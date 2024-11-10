// subscribers/app/config/config.js

const CommonConfig = require('../../../config/commonConfig');

class AppConfig extends CommonConfig {
    static get displayConfig() {
        return {
            updateInterval: 1000,                   // Intervalo de atualização da interface
            maxHistoryItems: 50,                    // Número máximo de itens no histórico
            temperatureDisplayPrecision: 1,         // Casas decimais para temperatura
            dateFormat: 'YYYY-MM-DD HH:mm:ss',     // Formato de data
            normalTemperatureUpdateInterval: this.environmentConfig.isDevelopment ? 5000 : 300000, // 5s dev / 5min prod
            statusDisplayTimeout: 5000              // Tempo de exibição de mensagens de status
        };
    }

    static get dataManagementConfig() {
        return {
            history: {
                maxStorageTime: 24 * 60 * 60 * 1000,    // 24 horas
                cleanupInterval: 60 * 60 * 1000,        // 1 hora
                aggregationInterval: 5 * 60 * 1000,     // 5 minutos
                maxReadingsPerHouse: 1000               // Máximo de leituras por casa
            },
            eventGrouping: {
                timeWindow: 5000,                       // 5 segundos
                maxEventsPerGroup: 10,
                minChangeThreshold: {
                    temperature: 0.5                    // Mudança mínima para registrar
                }
            }
        };
    }

    static get notificationConfig() {
        return {
            alerts: {
                temperature: {
                    displayTimeout: 30000,              // 30 segundos
                    soundEnabled: true,
                    priority: 'high',
                    minTimeBetweenNotifications: this.environmentConfig.isDevelopment ? 
                        60000 : 900000                  // 1min dev / 15min prod
                }
            },
            status: {
                displayTimeout: 5000,                   // 5 segundos
                soundEnabled: false,
                priority: 'low'
            }
        };
    }

    static get storageConfig() {
        return {
            localCache: {
                enabled: true,
                maxSize: 100 * 1024 * 1024,            // 100MB
                cleanupThreshold: 90,                   // Limpar quando atingir 90%
                expiryTime: 7 * 24 * 60 * 60 * 1000    // 7 dias
            },
            persistentStorage: {
                enabled: true,
                maxEntries: 10000,
                compressData: true
            }
        };
    }

    static shouldDisplayTemperature(currentTemp, lastTemp, lastDisplayTime) {
        if (!lastTemp || !lastDisplayTime) return true;

        const now = Date.now();
        const timeSinceLastDisplay = now - lastDisplayTime;
        const tempChange = Math.abs(currentTemp - lastTemp);

        // Sempre exibir se passou o intervalo normal
        if (timeSinceLastDisplay >= this.displayConfig.normalTemperatureUpdateInterval) {
            return true;
        }

        // Exibir se houver mudança significativa
        const minChange = this.dataManagementConfig.eventGrouping.minChangeThreshold.temperature;
        return tempChange >= minChange;
    }

    static formatTemperature(temperature) {
        return Number(temperature).toFixed(this.displayConfig.temperatureDisplayPrecision);
    }
}

module.exports = AppConfig;