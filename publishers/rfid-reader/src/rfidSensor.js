// publishers\rfid-reader\src\rfidSensor.js
const mqtt = require('mqtt');
const Config = require('../config/rfidSensorConfig');

class RFIDSensor {
  constructor(houseUuid, shelfId) {
    this.houseUuid = houseUuid;
    this.shelfId = shelfId;
    this.client = null;
    this.publishInterval = null;
    this.lastReadings = new Map();
    this.rfidConfig = Config.getShelfRFIDConfig(shelfId);
    this.testTags = null;
    this.testIndex = 0;
  }

  async connect() {
    try {
      this.client = mqtt.connect(Config.brokerConfig.url, Config.brokerConfig.options);

      this.client.on('connect', () => {
        console.log(`Sensor RFID conectado para prateleira ${this.shelfId}`);
        this.startPublishing();
      });

      this.client.on('error', error => {
        console.error(`Erro no sensor RFID: ${error.message}`);
        this.cleanup();
      });
    } catch (error) {
      throw console.error(`Erro ao conectar sensor RFID: ${error.message}`);
    }
  }

  setTestSequence(sequence) {
    this.testTags = sequence;
    this.testIndex = 0;
  }

  simulateRFIDReading() {
    if (this.testTags) {
      const reading = this.testTags[this.testIndex];
      this.testIndex = (this.testIndex + 1) % this.testTags.length;
      return reading;
    }

    const { simulationConfig: config } = Config.sensorConfig;

    // Random chance of no reading
    if (Math.random() > config.readProbability) {
      return null;
    }

    // Random chance of read error
    if (Math.random() < config.readErrorRate) {
      return {
        error: true,
        code: 'read_error',
        message: 'Erro na leitura do RFID'
      };
    }

    // Determine if adding or removing product
    const isAdd = Math.random() < config.movementPatterns.addProbability;

    // Generate tag (90% chance of registered tag, 10% chance of unregistered)
    let rfidTag = Math.random() > 0.1 
      ? this.getRandomRegisteredTag() 
      : this.generateUnregisteredTag();

    return {
      type: 'rfid_event',
      shelf_id: this.shelfId,
      reader_id: this.rfidConfig.readerId,
      rfid_tag: rfidTag,
      action: isAdd ? 'add' : 'remove',
      timestamp: new Date().toISOString()
    };
  }

  getRandomRegisteredTag() {
    const validTags = this.rfidConfig.validProducts;
    return validTags[Math.floor(Math.random() * validTags.length)];
  }

  generateUnregisteredTag() {
    return Array.from({ length: 10 }, () => 
      Math.floor(Math.random() * 16).toString(16)
    ).join('').toUpperCase();
  }

  startPublishing() {
    if (this.publishInterval) return;

    const topic = Config.formatTopic(Config.TOPIC_PATTERNS.SHELF_PRODUCTS, {
      house_uuid: this.houseUuid,
      shelf_id: this.shelfId
    });

    let lastPublishedReading = null;

    this.publishInterval = setInterval(() => {
      const reading = this.simulateRFIDReading();
      if (!reading) return;

      if (reading.error) {
        console.error(`${reading.message} na prateleira ${this.shelfId}`);
        return;
      }

      // Validar tag RFID
      const validation = Config.validationRules.rfid.validateTag(reading.rfid_tag);
      if (!validation.isValid) {
        console.error(`Tag RFID inválida detectada: ${reading.rfid_tag}`);
        return;
      }

      // Evitar logs duplicados em sequência
      const readingKey = `${reading.rfid_tag}_${reading.action}`;
      if (lastPublishedReading === readingKey) {
        this.client.publish(topic, JSON.stringify(reading), { qos: 1 });
        return;
      }

      this.client.publish(topic, JSON.stringify(reading), { qos: 1 }, error => {
        if (error) {
          console.error(`Erro ao publicar leitura RFID: ${error.message}`);
        } else if (Config.environmentConfig.isDevelopment) {
          console.log(`Leitura RFID: ${reading.action === 'add' ? 'Adicionado' : 'Removido'} tag ${reading.rfid_tag}`);
        }
      });

      lastPublishedReading = readingKey;
    }, Config.sensorConfig.publishInterval);
  }

  cleanup() {
    if (this.publishInterval) {
      clearInterval(this.publishInterval);
      this.publishInterval = null;
    }

    if (this.client) {
      try {
        this.client.end(true);
      } catch (error) {
        console.error(`Erro ao limpar recursos RFID: ${error.message}`);
      }
    }
  }
}

module.exports = RFIDSensor;