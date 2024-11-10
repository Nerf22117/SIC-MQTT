// subscribers/alerts/config/config.js

const CommonConfig = require('../../../config/commonConfig');

class AlertSystemConfig extends CommonConfig {
    static get alertConfig() {
        const isDevMode = this.environmentConfig.isDevelopment;
        
        return {
            severity: {
                HIGH: 'high',
                MEDIUM: 'medium',
                LOW: 'low'
            },
            types: {
                TEMPERATURE: {
                    HIGH: 'high_temperature',
                    LOW: 'low_temperature',
                    severity: 'high',
                    cooldown: isDevMode ? 60000 : 900000, // 1min dev / 15min prod
                    bufferZone: 1.0, // 1°C de zona de buffer
                    requiredReadingsForAlert: 3 // Número de leituras consecutivas para gerar alerta
                }
            },
            notification: {
                retryAttempts: 3,
                retryDelay: 1000,
                maxNotificationAge: 3600000 // 1 hora
            }
        };
    }

    static get alertProcessingConfig() {
        return {
            batchSize: 10,
            processInterval: 1000,
            maxProcessingTime: 5000,
            errorThreshold: 5 // Número de erros antes de pausar o processamento
        };
    }

    static get alertCacheConfig() {
        return {
            maxSize: 1000,
            cleanupInterval: 300000, // 5 minutos
            expiryTime: 3600000      // 1 hora
        };
    }

    static getHouseAlertThresholds(houseUuid) {
        return this.houseConfigs[houseUuid]?.temperature || {
            min: 2.0,
            max: 18.0,
            bufferZone: 1.0,
            alertCooldown: this.environmentConfig.isDevelopment ? 60000 : 900000,
            readingInterval: this.environmentConfig.isDevelopment ? 5000 : 300000
        };
    }

    static validateTemperatureForAlert(temperature, readings, thresholds) {
        const { bufferZone } = thresholds;
        const recentReadings = readings.slice(-this.alertConfig.types.TEMPERATURE.requiredReadingsForAlert);
        
        if (recentReadings.length < this.alertConfig.types.TEMPERATURE.requiredReadingsForAlert) {
            return { shouldAlert: false };
        }

        const allReadingsHigh = recentReadings.every(t => t > (thresholds.max - bufferZone));
        const allReadingsLow = recentReadings.every(t => t < (thresholds.min + bufferZone));

        if (allReadingsHigh && temperature > thresholds.max) {
            return {
                shouldAlert: true,
                type: this.alertConfig.types.TEMPERATURE.HIGH,
                threshold: thresholds.max
            };
        }

        if (allReadingsLow && temperature < thresholds.min) {
            return {
                shouldAlert: true,
                type: this.alertConfig.types.TEMPERATURE.LOW,
                threshold: thresholds.min
            };
        }

        return { shouldAlert: false };
    }
}

module.exports = AlertSystemConfig;