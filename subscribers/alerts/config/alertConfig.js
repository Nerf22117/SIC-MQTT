// subscribers\alerts\config\alertConfig.js

const CommonConfig = require("../../../config/commonConfig");

class AlertSystemConfig extends CommonConfig {
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

  static get alertConfig() {
    const isDev = this.environmentConfig.isDevelopment;
    return {
      severity: {
        HIGH: "high",
        MEDIUM: "medium",
        LOW: "low"
      },
      types: {
        TEMPERATURE: {
          HIGH: "high_temperature",
          LOW: "low_temperature",
          severity: "high",
          cooldown: isDev ? 60000 : 900000,
          bufferZone: 1,
          requiredReadingsForAlert: 3
        },
        PRODUCT: {
          UNREGISTERED: "unregistered_product",
          LOW_STOCK: "low_stock",
          WEIGHT_MISMATCH: "weight_mismatch",
          severity: "medium",
          cooldown: isDev ? 30000 : 300000,
          correlation: {
            timeout: 5000,
            weightThreshold: 50
          }
        }
      },
      notification: {
        retryAttempts: 3,
        retryDelay: 1000,
        maxNotificationAge: 3600000
      }
    };
  }

  static get eventCorrelationConfig() {
    return {
      timeWindow: 5000,
      weightStabilizationTime: 2000,
      minWeightChange: 50,
      maxWeightDeviation: 100,
      cleanupInterval: 10000
    };
  }

  static get productValidationRules() {
    return {
      weight: {
        validateChange: (newWeight, oldWeight) => {
          const diff = Math.abs(newWeight - oldWeight);
          return {
            isValid: diff <= this.eventCorrelationConfig.maxWeightDeviation,
            difference: diff
          };
        }
      }
    };
  }
}

// Debug logs
console.log('AlertSystemConfig loaded');
console.log('TOPIC_PATTERNS available:', !!AlertSystemConfig.TOPIC_PATTERNS);
console.log('Sample pattern:', AlertSystemConfig.TOPIC_PATTERNS.TEMPERATURE);

module.exports = AlertSystemConfig;