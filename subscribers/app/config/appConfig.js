// subscribers\app\config\appConfig.js

const CommonConfig = require("../../../config/commonConfig");
const WeightSensorConfig = require("../../../publishers/weight-sensor/config/weightSensorConfig");

class AppConfig extends CommonConfig {
    static get displayConfig() {
        const isDev = this.environmentConfig.isDevelopment;
        return {
            updateInterval: isDev ? 1000 : 5000,
            maxHistoryItems: 50,
            temperatureDisplayPrecision: 1,
            weightDisplayPrecision: 1,
            dateFormat: "YYYY-MM-DD HH:mm:ss",
            logLevel: isDev ? 'debug' : 'info',
            statusDisplayTimeout: 5000,
            temperatureUpdateInterval: isDev ? 5000 : 300000,
            productUpdateInterval: isDev ? 2000 : 60000
        };
    }

    static get sensorConfiguration() {
        return {
            validation: {
                minWeightChange: WeightSensorConfig.WEIGHT_CONSTANTS.MIN_WEIGHT_CHANGE,
                stabilityThreshold: 3,
                temperatureThreshold: 0.5
            },
            aggregation: {
                timeWindow: 5000,
                minSamples: 3
            },
            rfid: {
                readTimeout: 2000,
                maxAttempts: 3,
                correlationWindow: 5000
            },
            weight: {
                stabilizationTime: WeightSensorConfig.WEIGHT_CONSTANTS.STABILITY_DELAY,
                precision: 1,
                minStableReadings: 3
            }
        };
    }

    static get dataManagementConfig() {
        return {
            history: {
                maxStorageTime: 86400000,     // 24 horas
                cleanupInterval: 3600000,      // 1 hora
                aggregationInterval: 300000,   // 5 minutos
                maxReadingsPerHouse: 1000
            },
            eventGrouping: {
                timeWindow: 5000,
                maxEventsPerGroup: 10,
                minChangeThreshold: {
                    temperature: 0.5,
                    weight: WeightSensorConfig.WEIGHT_CONSTANTS.MIN_WEIGHT_CHANGE
                }
            },
            products: {
                correlationTimeout: 5000,
                minWeightChange: WeightSensorConfig.WEIGHT_CONSTANTS.MIN_WEIGHT_CHANGE,
                maxWeightDeviation: WeightSensorConfig.WEIGHT_CONSTANTS.MAX_DEVIATION
            }
        };
    }

    static get notificationConfig() {
        const isDev = this.environmentConfig.isDevelopment;
        return {
            alerts: {
                temperature: {
                    displayTimeout: 30000,
                    soundEnabled: true,
                    priority: "high",
                    minTimeBetweenNotifications: isDev ? 60000 : 900000
                },
                product: {
                    displayTimeout: 20000,
                    soundEnabled: true,
                    priority: "medium",
                    minTimeBetweenNotifications: isDev ? 30000 : 300000
                },
                status: {
                    displayTimeout: 5000,
                    soundEnabled: false,
                    priority: "low"
                }
            }
        };
    }

    static get storageConfig() {
        return {
            localCache: {
                enabled: true,
                maxSize: 104857600,  // 100MB
                cleanupThreshold: 90,
                expiryTime: 604800000  // 7 dias
            },
            persistentStorage: {
                enabled: true,
                maxEntries: 10000,
                compressData: true
            }
        };
    }

  static shouldDisplayTemperature(newTemp, oldTemp, lastDisplayTime) {
    if (!oldTemp || !lastDisplayTime) return true;
    
    const now = Date.now();
    if (now - lastDisplayTime >= this.displayConfig.normalTemperatureUpdateInterval) {
      return true;
    }

    const minChange = this.dataManagementConfig.eventGrouping.minChangeThreshold.temperature;
    return Math.abs(newTemp - oldTemp) >= minChange;
  }

  static shouldDisplayWeight(newWeight, oldWeight, lastDisplayTime) {
    if (!oldWeight || !lastDisplayTime) return true;
    
    const now = Date.now();
    if (now - lastDisplayTime >= this.displayConfig.productUpdateInterval) {
      return true;
    }

    const minChange = this.dataManagementConfig.eventGrouping.minChangeThreshold.weight;
    return Math.abs(newWeight - oldWeight) >= minChange;
  }

  static formatTemperature(temp) {
    return Number(temp).toFixed(this.displayConfig.temperatureDisplayPrecision);
  }

  static formatWeight(weight) {
    return Number(weight).toFixed(this.displayConfig.weightDisplayPrecision);
  }
}

module.exports = AppConfig;