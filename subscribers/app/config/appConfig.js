// subscribers/app/config/appConfig.js

const CommonConfig = require('../../../config/commonConfig');
const ConfigValidator = require('../../../config/validators/configValidator');
const WeightSensorConfig = require('../../../publishers/weight-sensor/config/weightSensorConfig');

/**
 * Configurações da aplicação principal
 * Gere as definições de interface e apresentação
 */
class AppConfig extends CommonConfig {
    /**
     * Configurações de apresentação
     * @returns {Object} Configurações de apresentação
     */
    static get displayConfig() {
        const isDev = this.environmentConfig.isDevelopment;
        
        const config = {
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

        return config;
    }

    /**
     * Configurações dos sensores
     * @returns {Object} Configurações dos sensores
     */
    static get sensorConfiguration() {
        return {
            validation: {
                minWeightChange: WeightSensorConfig.WEIGHT_CONSTANTS.MIN_WEIGHT_CHANGE,
                stabilityThreshold: 3,
                temperatureThreshold: 0.5
            },
            aggregation: {
                timeWindow: 5000,       // Janela para agregação
                minSamples: 3          // Amostras mínimas para agregação
            },
            rfid: {
                readTimeout: 2000,     // Tempo limite de leitura
                maxAttempts: 3,        // Tentativas máximas
                correlationWindow: 5000 // Janela para correlação
            }
        };
    }

    /**
     * Configurações de gestão de dados
     * @returns {Object} Configurações de dados
     */
    static get dataManagementConfig() {
        return {
            history: {
                maxStorageTime: 86400000,     // 24 horas
                cleanupInterval: 3600000,      // 1 hora
                aggregationInterval: 300000,   // 5 minutos
                maxReadingsPerHouse: 1000     // Leituras máximas por casa
            },
            eventGrouping: {
                timeWindow: 5000,             // Janela de eventos
                maxEventsPerGroup: 10,        // Eventos por grupo
                minChangeThreshold: {
                    temperature: 0.5,         // Mudança mínima de temperatura
                    weight: WeightSensorConfig.WEIGHT_CONSTANTS.MIN_WEIGHT_CHANGE
                }
            },
            products: {
                correlationTimeout: 5000,      // Tempo para correlação
                minWeightChange: WeightSensorConfig.WEIGHT_CONSTANTS.MIN_WEIGHT_CHANGE,
                maxWeightDeviation: WeightSensorConfig.WEIGHT_CONSTANTS.MAX_DEVIATION
            }
        };
    }

    /**
     * Configurações de notificações
     * @returns {Object} Configurações de notificações
     */
    static get notificationConfig() {
        const isDev = this.environmentConfig.isDevelopment;
        
        return {
            alerts: {
                temperature: {
                    displayTimeout: 30000,     // 30 segundos
                    soundEnabled: true,
                    priority: "high",
                    minTimeBetweenNotifications: isDev ? 60000 : 900000
                },
                product: {
                    displayTimeout: 20000,     // 20 segundos
                    soundEnabled: true,
                    priority: "medium",
                    minTimeBetweenNotifications: isDev ? 30000 : 300000
                },
                status: {
                    displayTimeout: 5000,     // 5 segundos
                    soundEnabled: false,
                    priority: "low"
                }
            }
        };
    }

    /**
     * Configurações de armazenamento
     * @returns {Object} Configurações de armazenamento
     */
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

    /**
     * Verifica se uma temperatura deve ser apresentada
     * @param {number} newTemp - Nova temperatura
     * @param {number} oldTemp - Temperatura anterior
     * @param {number} lastDisplayTime - Último momento de apresentação
     * @returns {boolean} Verdadeiro se deve apresentar
     */
    static shouldDisplayTemperature(newTemp, oldTemp, lastDisplayTime) {
        if (!oldTemp || !lastDisplayTime) return true;
        
        const now = Date.now();
        if (now - lastDisplayTime >= this.displayConfig.temperatureUpdateInterval) {
            return true;
        }

        const minChange = this.dataManagementConfig.eventGrouping.minChangeThreshold.temperature;
        return Math.abs(newTemp - oldTemp) >= minChange;
    }

    /**
     * Verifica se um peso deve ser apresentado
     * @param {number} newWeight - Novo peso
     * @param {number} oldWeight - Peso anterior
     * @param {number} lastDisplayTime - Último momento de apresentação
     * @returns {boolean} Verdadeiro se deve apresentar
     */
    static shouldDisplayWeight(newWeight, oldWeight, lastDisplayTime) {
        if (!oldWeight || !lastDisplayTime) return true;
        
        const now = Date.now();
        if (now - lastDisplayTime >= this.displayConfig.productUpdateInterval) {
            return true;
        }

        const minChange = this.dataManagementConfig.eventGrouping.minChangeThreshold.weight;
        return Math.abs(newWeight - oldWeight) >= minChange;
    }

    /**
     * Formata uma temperatura para apresentação
     * @param {number} temp - Temperatura a formatar
     * @returns {string} Temperatura formatada
     */
    static formatTemperature(temp) {
        return Number(temp).toFixed(this.displayConfig.temperatureDisplayPrecision);
    }

    /**
     * Formata um peso para apresentação
     * @param {number} weight - Peso a formatar
     * @returns {string} Peso formatado
     */
    static formatWeight(weight) {
        return Number(weight).toFixed(this.displayConfig.weightDisplayPrecision);
    }
}

module.exports = AppConfig;