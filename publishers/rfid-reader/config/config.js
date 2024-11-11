// publishers\rfid-reader\config\config.js

const CommonConfig = require("../../../config/commonConfig");

class RFIDSensorConfig extends CommonConfig {
  static get TOPIC_PATTERNS() {
    return CommonConfig.topicPatterns;
  }

  static get topicPatterns() {
    return this.TOPIC_PATTERNS;
  }

  static formatTopic(pattern, params) {
    const topicPattern = typeof pattern === 'string' 
      ? pattern 
      : this.TOPIC_PATTERNS[pattern];

    if (!topicPattern) {
      throw new Error(`Invalid topic pattern: ${pattern}`);
    }

    return super.formatTopic(topicPattern, params);
  }

  static get sensorConfig() {
    let isDev = this.environmentConfig.isDevelopment;
    return {
      publishInterval: isDev ? 1000 : 5000,
      simulationConfig: {
        readProbability: 0.3,
        readErrorRate: 0.02,
        movementPatterns: {
          addProbability: 0.6,
          removeProbability: 0.4,
          multiReadWindow: 2000
        }
      },
      validation: {
        maxReadingsPerCycle: 3,
        minReadInterval: 500
      }
    };
  }

  static getShelfRFIDConfig(shelfId) {
    return {
      readerId: this.houseConfigs[this.currentHouse]?.shelves.find(s => s.id === shelfId)?.rfidReader,
      validProducts: this.houseConfigs[this.currentHouse]?.products
        .filter(p => p.shelfId === shelfId)
        .map(p => p.rfid_tag) || []
    };
  }

  static get validationRules() {
    return {
      rfid: {
        validateTag(tag) {
          const isValid = /^[A-Fa-f0-9]{10}$/.test(tag);
          return {
            isValid,
            value: isValid ? tag.toUpperCase() : null
          };
        }
      }
    };
  }
}

module.exports = RFIDSensorConfig;