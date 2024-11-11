// publishers/weight-sensor/src/index.js
const mqtt = require('mqtt');
const Config = require('../config/config');

class WeightSensor {
  constructor(houseUuid, shelfId) {
    this.houseUuid = houseUuid;
    this.shelfId = shelfId;
    this.client = null;
    this.publishInterval = null;
    this.lastReading = null;
    this.lastPublishedReading = null;
    this.stabilizationTimer = null;
    this.weightConfig = Config.getShelfWeightConfig(shelfId);
    this.isStabilizing = false;
    this.testWeights = null;
    this.testIndex = 0;
    
    // Store topic at construction time
    this.topic = Config.formatTopic(Config.TOPIC_PATTERNS.SHELF_WEIGHT, {
      house_uuid: houseUuid,
      shelf_id: shelfId
    });
  }

  async connect() {
    try {
      this.client = mqtt.connect(Config.brokerConfig.url, Config.brokerConfig.options);

      this.client.on('connect', () => {
        console.log(`Sensor de peso conectado para prateleira ${this.shelfId}`);
        this.startPublishing();
      });

      this.client.on('error', error => {
        console.error(`Erro no sensor de peso: ${error.message}`);
        this.cleanup();
      });
    } catch (error) {
      console.error(`Erro ao conectar sensor de peso: ${error.message}`);
      throw error;
    }
  }

  setTestSequence(sequence) {
    this.testWeights = sequence;
    this.testIndex = 0;
  }

  simulateWeightReading() {
    if (this.testWeights) {
      const weight = this.testWeights[this.testIndex];
      this.testIndex = (this.testIndex + 1) % this.testWeights.length;
      return { weight, isStable: true };
    }

    const config = Config.sensorConfig;

    if (this.lastReading === null) {
      return { weight: 0, isStable: true };
    }

    let reading = this.lastReading;

    if (this.isStabilizing) {
      const oscillation = (Math.random() - 0.5) * config.movementPatterns.oscillationRange;
      reading += oscillation;
    } else {
      const noise = (Math.random() - 0.5) * config.noiseLevel;
      const drift = (Math.random() * config.driftRate) / 3600;
      reading += noise + drift;
    }

    const validation = Config.validationRules.weight.validateReading(reading, this.lastReading);
    if (!validation.isValid) {
      console.warn(`Leitura inválida detectada: ${validation.reason}`);
      return null;
    }

    const isStable = Math.abs(reading - this.lastReading) < config.validation.stabilityThreshold;
    return { weight: validation.value, isStable };
  }

  processWeightChange(reading) {
    const config = Config.sensorConfig;
    const minWeightChange = config.validation.minWeightChange || 50; // Default value if not set
    
    const significantChange = this.lastPublishedReading && 
      Math.abs(reading.weight - this.lastPublishedReading) > minWeightChange;

    if (significantChange) {
      this.isStabilizing = true;
      if (this.stabilizationTimer) {
        clearTimeout(this.stabilizationTimer);
      }
      this.stabilizationTimer = setTimeout(() => {
        this.isStabilizing = false;
        this.publishWeightReading(reading.weight, true);
      }, config.simulationConfig.stabilizationTime);
    }

    return reading;
  }

  startPublishing() {
    if (this.publishInterval) return;

    this.publishInterval = setInterval(() => {
      const reading = this.simulateWeightReading();
      if (!reading) return;

      this.lastReading = reading.weight;
      const processedReading = this.processWeightChange(reading);

      if (processedReading.isStable || Config.environmentConfig.isDevelopment) {
        this.publishWeightReading(processedReading.weight, processedReading.isStable);
      }
    }, Config.sensorConfig.publishInterval);
  }

  publishWeightReading(weight, isStable) {
    const event = {
      type: 'weight_event',
      shelf_id: this.shelfId,
      sensor_id: this.weightConfig.sensorId,
      weight: weight,
      is_stable: isStable,
      timestamp: new Date().toISOString()
    };

    if (!this.client || !this.topic) {
      console.error('Cliente MQTT não inicializado ou tópico inválido');
      return;
    }

    this.client.publish(this.topic, JSON.stringify(event), { qos: 1 }, error => {
      if (error) {
        console.error(`Erro ao publicar leitura de peso: ${error.message}`);
      } else {
        this.lastPublishedReading = weight;
        if (Config.environmentConfig.isDevelopment) {
          console.log(`Leitura de peso publicada: ${JSON.stringify(event)}`);
        }
      }
    });
  }

  cleanup() {
    if (this.publishInterval) {
      clearInterval(this.publishInterval);
      this.publishInterval = null;
    }

    if (this.stabilizationTimer) {
      clearTimeout(this.stabilizationTimer);
      this.stabilizationTimer = null;
    }

    if (this.client) {
      try {
        this.client.end(true);
      } catch (error) {
        console.error(`Erro ao limpar recursos do sensor de peso: ${error.message}`);
      }
    }
  }
}

module.exports = WeightSensor;