// subscribers\alerts\src\alertManager.js

require("dotenv").config();
const Config = require("../config/config");

const WeightSensorConfig = require('../../../publishers/weight-sensor/config/config');

class AlertManager {
  constructor() {
    this.alertCache = new Map();
    this.temperatureReadings = new Map();
    this.pendingEvents = new Map();
    this.productStates = new Map();
    this.weightReadings = new Map();
    this.setupCacheCleanup();
    this.setupEventCleanup();

            // Garantir acesso às constantes de peso
            this.weightConstants = WeightSensorConfig.WEIGHT_CONSTANTS;
  }

  setupCacheCleanup() {
    setInterval(() => {
      const now = Date.now();
      for (const [key, alert] of this.alertCache) {
        // Remove alertas expirados baseado no cooldown configurado
        const cooldown = alert.type.includes('temperature') 
          ? Config.alertConfig.types.TEMPERATURE.cooldown
          : Config.alertConfig.types.PRODUCT.cooldown;
          
        if (now - alert.timestamp > cooldown) {
          this.alertCache.delete(key);
        }
      }
    }, Config.eventCorrelationConfig.cleanupInterval);
  }

  setupEventCleanup() {
    setInterval(() => {
      const now = Date.now();
      for (let [key, event] of this.pendingEvents) {
        if (now - event.timestamp > Config.eventCorrelationConfig.timeWindow) {
          this.pendingEvents.delete(key);
        }
      }
    }, Config.eventCorrelationConfig.cleanupInterval);
  }

  handleRFIDEvent(houseUuid, data) {
    const eventKey = `${houseUuid}_${data.shelf_id}_${data.rfid_tag}`;
    this.pendingEvents.set(eventKey, {
      type: 'rfid',
      data: data,
      timestamp: Date.now()
    });
    this.correlateEvents(eventKey, houseUuid);
  }

  handleWeightEvent(houseUuid, data) {
    if (!data || !data.is_stable) return;

    // Armazenar leitura de peso
    this.weightReadings.set(data.shelf_id, {
        weight: data.weight,
        timestamp: new Date(data.timestamp)
    });

    // Verificar mudanças significativas
    const previousReading = this.getPreviousWeight(data.shelf_id);
    if (Math.abs(data.weight - previousReading) >= this.weightConstants.MIN_WEIGHT_CHANGE) {
        // Correlacionar com eventos RFID pendentes
        this.checkPendingEventsForShelf(houseUuid, data.shelf_id);
    }
}

checkPendingEventsForShelf(houseUuid, shelfId) {
    for (let [key, event] of this.pendingEvents) {
        if (key.includes(`${houseUuid}_${shelfId}`)) {
            this.correlateEvents(key, houseUuid);
        }
    }
}

getPreviousWeight(shelfId) {
    const reading = this.weightReadings.get(shelfId);
    return reading ? reading.weight : 0;
}

handleUnregisteredProduct(houseUuid, event, weightData) {
    if (event.data.action !== "add") return;

    const previousWeight = this.getPreviousWeight(event.data.shelf_id);
    const weightChange = Math.abs(weightData.weight - previousWeight);

    if (weightChange < this.weightConstants.MIN_WEIGHT_CHANGE) {
        console.debug('Mudança de peso insignificante para produto não registado');
        return;
    }

    return this.generateAlert({
        type: 'unregistered_product',
        severity: 'medium',
        house_uuid: houseUuid,
        shelf_id: event.data.shelf_id,
        rfid_tag: event.data.rfid_tag,
        weight_change: weightChange,
        timestamp: new Date().toISOString()
    });
}


correlateEvents(eventKey, houseUuid) {
    const event = this.pendingEvents.get(eventKey);
    if (!event || event.type !== 'rfid') return;

    const weightData = this.weightReadings.get(event.data.shelf_id);
    if (!weightData) {
        console.debug('Aguardando leitura de peso para correlação');
        return;
    }

    // Usar configuração do sensor de peso
    if (Math.abs(Date.now() - event.timestamp) > 
        WeightSensorConfig.sensorConfig.simulationConfig.stabilizationTime) {
        console.debug('Evento fora da janela de correlação');
        this.pendingEvents.delete(eventKey);
        return;
    }

    const product = this.findProduct(event.data.rfid_tag);
    if (product) {
        this.handleRegisteredProduct(houseUuid, event, weightData);
    } else {
        this.handleUnregisteredProduct(houseUuid, event, weightData);
    }

    this.pendingEvents.delete(eventKey);
}

  handleRegisteredProduct(houseUuid, event, weightReading) {
    const product = this.findProduct(event.data.rfid_tag);
    const productState = this.productStates.get(product.id);
    const isAdd = event.data.action === 'add';
    const lastWeight = productState?.lastKnownWeight || 0;
    const weightDiff = weightReading.weight - lastWeight;

    const expectedWeight = isAdd ? product.container_weight : productState?.lastKnownWeight || 0;
    const weightValidation = Config.productValidationRules.weight.validateChange(Math.abs(weightDiff), expectedWeight);

    if (!weightValidation.isValid) {
      this.generateAlert({
        type: Config.alertConfig.types.PRODUCT.WEIGHT_MISMATCH,
        severity: Config.alertConfig.severity.MEDIUM,
        house_uuid: houseUuid,
        product_id: product.id,
        shelf_id: event.data.shelf_id,
        expected_weight: expectedWeight,
        actual_weight: Math.abs(weightDiff),
        timestamp: new Date().toISOString()
      });
      return;
    }

    const newWeight = Math.max(0, isAdd ? weightDiff : weightReading.weight);
    this.productStates.set(product.id, {
      lastKnownWeight: newWeight,
      lastUpdate: weightReading.timestamp,
      shelf_id: event.data.shelf_id
    });

    // Verificar estoque baixo
    if (newWeight <= product.min_stock) {
      this.generateAlert({
        type: Config.alertConfig.types.PRODUCT.LOW_STOCK,
        severity: Config.alertConfig.severity.HIGH,
        house_uuid: houseUuid,
        product_id: product.id,
        shelf_id: event.data.shelf_id,
        current_weight: newWeight,
        min_stock: product.min_stock,
        timestamp: new Date().toISOString()
      });
    }
  }



  findProduct(rfidTag) {
    const houseConfig = Config.houseConfigs[this.currentHouse];
    return houseConfig.products.find(product => product.rfid_tag === rfidTag);
  }

  getPreviousWeight(shelfId) {
    const reading = this.weightReadings.get(shelfId);
    return reading?.weight || 0;
  }

  generateAlert(alert) {
    const key = this.generateAlertKey(alert.house_uuid, alert.type, {
      shelf_id: alert.shelf_id
    });

    if (this.isAlertInCooldown(key)) return null;

    const cooldown = alert.type.includes('temperature')
      ? Config.alertConfig.types.TEMPERATURE.cooldown
      : Config.alertConfig.types.PRODUCT.cooldown;

    this.cacheAlert(key, alert.type, cooldown);
    return alert;
  }

  generateAlertKey(houseUuid, type, metadata = {}) {
    return `${houseUuid}_${type}_${JSON.stringify(metadata)}`;
  }

  isAlertInCooldown(key) {
    const cachedAlert = this.alertCache.get(key);
    if (!cachedAlert) return false;

    const now = Date.now();
    return (now - cachedAlert.timestamp) < cachedAlert.cooldown;
  }

  cacheAlert(key, type, cooldown) {
    this.alertCache.set(key, {
      type,
      timestamp: Date.now(),
      cooldown
    });
  }
}

module.exports = AlertManager;