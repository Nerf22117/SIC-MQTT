// subscribers\app\src\appSubscriber.js

const mqtt = require("mqtt");
const Config = require('../config/appConfig');

class AppSubscriber {
  constructor() {
    this.client = null;
    this.houseData = new Map();
    this.alertStates = new Map();
    this.lastDisplayTimes = new Map();
    this.productStates = new Map();
    this.setupDataStructures();
  }

  setupDataStructures() {
    Object.keys(Config.houseConfigs).forEach(houseUuid => {
      // Inicializar estrutura de dados da casa
      this.houseData.set(houseUuid, {
          temperature: null,
          lastUpdate: null,
          shelves: new Map(),
          history: {
              temperature: [],
              products: [],
              alerts: [],
              weight_changes: []  // Adicionado explicitamente
          }
      });

      // Initialize alert states
      this.alertStates.set(houseUuid, {
        temperature: {
          active: false,
          lastAlert: null,
          type: null,
          lastNotification: null,
          normalReadingsCount: 0
        },
        products: new Map()
      });

      // Initialize display times
      this.lastDisplayTimes.set(houseUuid, {
        temperature: null,
        status: null,
        product: new Map()
      });

      // Initialize shelf data
      Config.houseConfigs[houseUuid].shelves.forEach(shelf => {
        this.houseData.get(houseUuid).shelves.set(shelf.id, {
          weight: null,
          lastUpdate: null,
          products: new Map(),
          rfidReadings: []
        });
      });
    });
  }

  async connect() {
    try {
      this.client = mqtt.connect(Config.brokerConfig.url, Config.brokerConfig.options);

      this.client.on("connect", () => {
        console.log("Aplicação conectada ao broker MQTT");
        this.setupSubscriptions();
      });

      this.client.on("message", (topic, message) => {
        this.handleMessage(topic, message).catch(error => {
          console.error(`Erro ao processar mensagem: ${error.message}`);
        });
      });

      this.client.on("error", error => {
        console.error(`Erro na conexão MQTT: ${error.message}`);
      });

      this.startHistoryCleanup();
    } catch (error) {
      console.error(`Erro ao conectar aplicação: ${error.message}`);
      throw error;
    }
  }

  setupSubscriptions() {
    Object.keys(Config.houseConfigs).forEach(houseUuid => {
      // Temperature topics
      const temperatureTopic = Config.formatTopic(Config.topicPatterns.TEMPERATURE, { house_uuid: houseUuid });
      const alertsTopic = Config.formatTopic(Config.topicPatterns.ALERTS, { house_uuid: houseUuid });

      // Subscribe to base topics
      [temperatureTopic, alertsTopic].forEach(topic => {
        this.subscribeTopic(topic);
      });

      // Subscribe to shelf-specific topics
      Config.houseConfigs[houseUuid].shelves.forEach(shelf => {
        const weightTopic = Config.formatTopic(Config.topicPatterns.SHELF_WEIGHT, { 
          house_uuid: houseUuid, 
          shelf_id: shelf.id 
        });
        const productsTopic = Config.formatTopic(Config.topicPatterns.SHELF_PRODUCTS, {
          house_uuid: houseUuid,
          shelf_id: shelf.id
        });

        [weightTopic, productsTopic].forEach(topic => {
          this.subscribeTopic(topic);
        });
      });
    });
  }

  subscribeTopic(topic) {
    this.client.subscribe(topic, { qos: 1 }, error => {
      if (error) {
        console.error(`Erro ao subscrever ${topic}: ${error.message}`);
      } else {
        console.log(`Subscrito ao tópico: ${topic}`);
      }
    });
  }

  // Utility methods for topic handling
  extractHouseUuid(topic) {
    const match = topic.match(/house\/([^/]+)/);
    return match ? match[1] : null;
  }

  extractShelfId(topic) {
    const match = topic.match(/shelf\/([^/]+)/);
    return match ? match[1] : null;
  }

  isTemperatureTopic(topic) {
    return topic.endsWith("temperature");
  }

  isWeightTopic(topic) {
    return topic.includes("/weight");
  }

  isProductTopic(topic) {
    return topic.includes("/products");
  }

  isAlertTopic(topic) {
    return topic.endsWith("alerts");
  }


async handleMessage(topic, message) {
    try {
      const data = JSON.parse(message.toString());
      const houseUuid = this.extractHouseUuid(topic);
      const shelfId = this.extractShelfId(topic);

      if (!houseUuid || !this.houseData.has(houseUuid)) {
        console.warn(`UUID de casa inválido ou não encontrado: ${houseUuid}`);
        return;
      }

      if (this.isTemperatureTopic(topic)) {
        await this.handleTemperatureMessage(houseUuid, data);
      } else if (this.isWeightTopic(topic) && shelfId) {
        await this.handleWeightMessage(houseUuid, shelfId, data);
      } else if (this.isProductTopic(topic) && shelfId) {
        await this.handleProductMessage(houseUuid, shelfId, data);
      } else if (this.isAlertTopic(topic)) {
        await this.handleAlertMessage(houseUuid, data);
      }
    } catch (error) {
      console.error(`Erro ao processar mensagem: ${error.message}`);
      if (error instanceof SyntaxError) {
        console.error("Mensagem inválida:", message.toString());
      }
    }
  }

  async handleTemperatureMessage(houseUuid, data) {
    const houseData = this.houseData.get(houseUuid);
    const alertState = this.alertStates.get(houseUuid).temperature;
    const temperature = parseFloat(data.temperature);
    const thresholds = Config.getHouseAlertThresholds(houseUuid);
    const previousTemp = houseData.temperature;

    // Update temperature data
    houseData.temperature = temperature;
    houseData.lastUpdate = new Date();

    // Check if temperature is within normal range (including buffer zone)
    const isNormal = temperature >= thresholds.min + thresholds.bufferZone && 
                    temperature <= thresholds.max - thresholds.bufferZone;

    if (isNormal) {
      alertState.normalReadingsCount++;
      if (alertState.active && alertState.normalReadingsCount >= 3) {
        this.normalizeTemperatureState(houseUuid, temperature);
      }
    } else {
      alertState.normalReadingsCount = 0;
    }

    // Display temperature update if needed
    const lastDisplayTime = this.lastDisplayTimes.get(houseUuid).temperature;
    if (!alertState.active && Config.shouldDisplayTemperature(temperature, previousTemp, lastDisplayTime)) {
      this.displayTemperatureUpdate(houseUuid, temperature, thresholds);
      this.lastDisplayTimes.get(houseUuid).temperature = Date.now();
    }

    // Add to history
    this.addToHistory(houseUuid, "temperature", {
      value: temperature,
      timestamp: data.timestamp || new Date().toISOString(),
      isNormal
    });
  }

  async handleWeightMessage(houseUuid, shelfId, data) {
    const shelfData = this.houseData.get(houseUuid).shelves.get(shelfId);
    if (!shelfData) return;

    const previousWeight = shelfData.weight;
    shelfData.weight = data.weight;
    shelfData.lastUpdate = new Date(data.timestamp);

    // Process weight change if stable
    if (data.is_stable) {
        const weightChange = data.weight - (previousWeight || 0);
        const minWeightChange = Config.dataManagementConfig.products.minWeightChange;

        if (Math.abs(weightChange) >= minWeightChange) {
            if (Config.displayConfig.logLevel === 'debug') {
                console.log(`Alteração de peso detectada na prateleira ${shelfId}: ${weightChange}g`);
            }
            await this.processWeightChange(houseUuid, shelfId, weightChange, data);
        }
    }
}

  async handleProductMessage(houseUuid, shelfId, data) {
    const shelfData = this.houseData.get(houseUuid).shelves.get(shelfId);
  
    if (!shelfData) return;

    // Process RFID event
    if (data.type === "rfid_event") {
      const product = this.findProduct(houseUuid, data.rfid_tag);
      
      if (product) {
        await this.handleRegisteredProduct(houseUuid, shelfId, product, data);
      } else {
        await this.handleUnregisteredProduct(houseUuid, shelfId, data);
      }

      // Add to RFID readings history
      shelfData.rfidReadings.push({
        rfid_tag: data.rfid_tag,
        action: data.action,
        timestamp: data.timestamp
      });

      // Trim RFID readings history if needed
      if (shelfData.rfidReadings.length > Config.displayConfig.maxHistoryItems) {
        shelfData.rfidReadings.splice(0, shelfData.rfidReadings.length - Config.displayConfig.maxHistoryItems);
      }
    }
  }

  async handleAlertMessage(houseUuid, data) {
    const alertState = this.alertStates.get(houseUuid);

    if (data.type.includes("temperature")) {
      const lastNotification = alertState.temperature.lastNotification;
      const minTime = Config.notificationConfig.alerts.temperature.minTimeBetweenNotifications;

      if (!lastNotification || (Date.now() - lastNotification >= minTime)) {
        alertState.temperature.active = true;
        alertState.temperature.lastAlert = Date.now();
        alertState.temperature.type = data.type;
        alertState.temperature.lastNotification = Date.now();
        alertState.temperature.normalReadingsCount = 0;

        this.addToHistory(houseUuid, "alerts", {
          type: data.type,
          temperature: data.temperature,
          threshold: data.threshold,
          timestamp: data.timestamp,
          readings_history: data.readings_history
        });

        this.displayAlert(houseUuid, data);
      }
    } else if (data.type.includes("product")) {
      // Handle product-related alerts
      const productId = data.product_id;
      const productAlertState = alertState.products.get(productId) || {
        lastNotification: null,
        type: null
      };

      const minTime = Config.alertConfig.types.PRODUCT.cooldown;
      if (!productAlertState.lastNotification || 
          (Date.now() - productAlertState.lastNotification >= minTime)) {
        
        productAlertState.lastNotification = Date.now();
        productAlertState.type = data.type;
        alertState.products.set(productId, productAlertState);

        this.addToHistory(houseUuid, "alerts", {
          type: data.type,
          product_id: data.product_id,
          shelf_id: data.shelf_id,
          details: data.details,
          timestamp: data.timestamp
        });

        this.displayProductAlert(houseUuid, data);
      }
    }
  }

findProduct(houseUuid, rfidTag) {
    const houseConfig = Config.houseConfigs[houseUuid];
    return houseConfig.products.find(product => product.rfid_tag === rfidTag);
  }

  async handleRegisteredProduct(houseUuid, shelfId, product, data) {
    const shelfData = this.houseData.get(houseUuid).shelves.get(shelfId);
    const productState = shelfData.products.get(product.id) || {
      lastAction: null,
      lastUpdate: null,
      weight: 0,
      movementHistory: []
    };

    // Update product state
    productState.lastAction = data.action;
    productState.lastUpdate = new Date(data.timestamp);

    // Add to movement history
    productState.movementHistory.push({
      action: data.action,
      timestamp: data.timestamp
    });

    // Trim movement history if needed
    if (productState.movementHistory.length > Config.displayConfig.maxHistoryItems) {
      productState.movementHistory.splice(0, 
        productState.movementHistory.length - Config.displayConfig.maxHistoryItems);
    }

    shelfData.products.set(product.id, productState);

    // Add to history
    this.addToHistory(houseUuid, "products", {
      product_id: product.id,
      name: product.name,
      action: data.action,
      shelf_id: shelfId,
      timestamp: data.timestamp
    });

    // Display product movement
    this.displayProductMovement(houseUuid, shelfId, product, data.action);
  }

  async handleUnregisteredProduct(houseUuid, shelfId, data) {
    if (data.action === "add") {
      console.warn(`
[Casa ${houseUuid}] ⚠️ Produto não registado detectado
Prateleira: ${shelfId}
Tag RFID: ${data.rfid_tag}
Timestamp: ${new Date(data.timestamp).toLocaleString()}
`);
    }
  }

  async processWeightChange(houseUuid, shelfId, weightChange, data) {
    const shelfData = this.houseData.get(houseUuid).shelves.get(shelfId);
    const houseConfig = Config.houseConfigs[houseUuid];
    
    // Verificar produtos ativos na prateleira
    shelfData.products.forEach((state, productId) => {
        const product = houseConfig.products.find(p => p.id === productId);
        if (product && state.lastAction === 'add') {
            // Atualizar peso estimado
            const estimatedWeight = Math.max(0, data.weight - (product.container_weight || 0));
            state.weight = estimatedWeight;

            // Verificar Stock baixo
            if (estimatedWeight <= product.min_stock) {
                this.handleLowStock(houseUuid, shelfId, product, estimatedWeight);
            }
        }
    });

    // Adicionar ao histórico com validação de dados
    if (weightChange !== undefined && data.weight !== undefined) {
        this.addToHistory(houseUuid, 'weight_changes', {
            shelf_id: shelfId,
            change: weightChange,
            total_weight: data.weight,
            timestamp: data.timestamp || new Date().toISOString()
        });
    }


    // Adicionar ao histórico
    this.addToHistory(houseUuid, 'weight_changes', {
      shelf_id: shelfId,
      change: weightChange,
      total_weight: data.weight,
      timestamp: data.timestamp
    });
  }

  getRecentRFIDEvents(readings, timestamp, timeWindow = 5000) {
    const eventTime = new Date(timestamp).getTime();
    return readings.filter(reading => 
      Math.abs(new Date(reading.timestamp).getTime() - eventTime) <= timeWindow);
  }

  updateProductWeight(houseUuid, shelfId, product, weightChange, action) {
    const shelfData = this.houseData.get(houseUuid).shelves.get(shelfId);
    const productState = shelfData.products.get(product.id);

    if (productState) {
      if (action === "add") {
        productState.weight = Math.max(0, (productState.weight || 0) + weightChange);
      } else if (action === "remove") {
        productState.weight = Math.max(0, (productState.weight || 0) - Math.abs(weightChange));
      }

      // Check for low stock
      if (productState.weight <= product.min_stock) {
        this.handleLowStock(houseUuid, shelfId, product, productState.weight);
      }
    }
  }

  handleLowStock(houseUuid, shelfId, product, currentWeight) {
    const alertState = this.alertStates.get(houseUuid).products.get(product.id);
    const now = Date.now();
    const cooldown = Config.notificationConfig.alerts.product.minTimeBetweenNotifications;

    if (!alertState || (now - alertState.lastNotification >= cooldown)) {
      console.log(`
[ALERTA - Casa ${houseUuid}] ⚠️ Stock baixo detectado!
Produto: ${product.name}
Prateleira: ${shelfId}
Peso atual: ${currentWeight.toFixed(1)}g
Stock mínimo: ${product.min_stock}g
`);

      this.alertStates.get(houseUuid).products.set(product.id, {
        lastNotification: now,
        type: 'low_stock'
      });
    }
  }

  normalizeTemperatureState(houseUuid, temperature) {
    const alertState = this.alertStates.get(houseUuid).temperature;
    const thresholds = Config.getHouseAlertThresholds(houseUuid);

    alertState.active = false;
    alertState.type = null;

    console.log(`
[Casa ${houseUuid}] ✅ Temperatura normalizada após ${alertState.normalReadingsCount} leituras normais
Temperatura atual: ${Config.formatTemperature(temperature)}°C
Limites: ${thresholds.min}°C - ${thresholds.max}°C
Zona de buffer: ±${thresholds.bufferZone}°C
`);

    alertState.normalReadingsCount = 0;
  }

  displayTemperatureUpdate(houseUuid, temperature, thresholds) {
    const alertState = this.alertStates.get(houseUuid).temperature;

    if (!alertState.active) {
      console.log(`[Casa ${houseUuid}] Temperatura atual: ${Config.formatTemperature(temperature)}°C`);

      // Check if temperature is near limits
      const nearMax = Math.abs(temperature - thresholds.max) <= thresholds.bufferZone;
      const nearMin = Math.abs(temperature - thresholds.min) <= thresholds.bufferZone;

      if (nearMax || nearMin) {
        console.log(`[Casa ${houseUuid}] ⚠️ Atenção: Temperatura próxima dos limites (${thresholds.min}°C - ${thresholds.max}°C)`);
        console.log(`[Casa ${houseUuid}] Zona de buffer: ±${thresholds.bufferZone}°C`);
      }
    }
  }

  displayProductMovement(houseUuid, shelfId, product, action) {
    const actionText = action === "add" ? "adicionado à" : "removido da";
    console.log(`
[Casa ${houseUuid}] 📦 Produto ${actionText} prateleira
Produto: ${product.name}
Prateleira: ${shelfId}
Timestamp: ${new Date().toLocaleString()}
`);
  }

  displayProductAlert(houseUuid, data) {
    const alertTypes = {
      "low_stock": "Stock Baixo",
      "weight_mismatch": "Divergência de Peso",
      "unregistered_product": "Produto Não registado"
    };

    console.log(`
[ALERTA - Casa ${houseUuid}] ⚠️ ${alertTypes[data.type]}
Produto: ${data.product_name || 'N/A'}
Prateleira: ${data.shelf_id}
${data.details ? '\nDetalhes: ' + data.details : ''}
Timestamp: ${new Date(data.timestamp).toLocaleString()}
`);
  }

  displayAlert(houseUuid, data) {
    const tempType = data.type === "high_temperature" ? "alta" : "baixa";
    
    console.log(`
[ALERTA - Casa ${houseUuid}] ❗ Temperatura ${tempType} detectada!
Temperatura: ${Config.formatTemperature(data.temperature)}°C (Limite: ${data.threshold}°C)
${data.readings_history ? `Últimas leituras: ${data.readings_history.map(t => Config.formatTemperature(t)).join(", ")}°C` : ''}

ℹ️ Sistema aguardará 3 leituras normais consecutivas para normalizar o estado.
Monitorando temperatura...
`);
  }

  addToHistory(houseUuid, type, data) {
    const houseData = this.houseData.get(houseUuid);
    if (!houseData) {
        console.warn(`Dados da casa ${houseUuid} não encontrados`);
        return;
    }

    // Garantir que o tipo de histórico existe
    if (!houseData.history[type]) {
        houseData.history[type] = [];
    }

    // Adicionar o novo item
    const newItem = {
        ...data,
        timestamp: data.timestamp || new Date().toISOString()
    };

    houseData.history[type].push(newItem);

    // Limitar tamanho do histórico
    const maxItems = this.getMaxHistoryItems(type);
    if (houseData.history[type].length > maxItems) {
        houseData.history[type] = houseData.history[type].slice(-maxItems);
    }
}

getMaxHistoryItems(type) {
    switch(type) {
        case 'weight_changes':
            return 100;  // Mantém mais entradas para mudanças de peso
        case 'temperature':
            return 50;   // Mantém menos entradas para temperatura
        default:
            return Config.displayConfig.maxHistoryItems;
    }
}

  startHistoryCleanup() {
    setInterval(() => {
      const maxAge = Date.now() - Config.dataManagementConfig.history.maxStorageTime;

      this.houseData.forEach((house, houseUuid) => {
        Object.keys(house.history).forEach(type => {
          house.history[type] = house.history[type].filter(item => 
            new Date(item.timestamp).getTime() > maxAge
          );
        });
      });
    }, Config.dataManagementConfig.history.cleanupInterval);
  }

  cleanup() {
    if (this.client) {
      try {
        this.client.end(true);
      } catch (error) {
        console.error(`Erro ao limpar recursos: ${error.message}`);
      }
    }
  }
}

// Export the class
module.exports = AppSubscriber;