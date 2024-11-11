// publishers/temperature-sensor/config/temperatureSensorConfig.js

const CommonConfig = require('../../../config/commonConfig');
const ConfigValidator = require('../../../config/validators/configValidator');

/**
 * Configurações específicas do sensor de temperatura
 * Estende as configurações comuns do sistema
 */
class TemperatureSensorConfig extends CommonConfig {
    /**
     * Configurações base do sensor de temperatura
     * @returns {Object} Configurações do sensor
     */
    static get sensorConfig() {
        const isDev = this.environmentConfig.isDevelopment;
        
        const config = {
            publishInterval: isDev ? 5000 : 300000, // 5s dev / 5min prod
            simulationConfig: {
                min: 5.0,         // Temperatura mínima simulada
                max: 25.0,        // Temperatura máxima simulada
                variance: 0.2,    // Variação máxima entre leituras
                stabilizationTime: 300000  // Tempo para estabilizar após mudança
            },
            validation: {
                maxRateOfChange: 0.5,     // Mudança máxima por minuto
                stabilityThreshold: 0.1,   // Variação considerada estável
                minReadings: 3            // Leituras mínimas para confirmação
            },
            alertThresholds: {
                bufferZone: 1.0,          // Zona de tolerância para alertas
                normalReadingsRequired: 3  // Leituras normais para normalizar
            }
        };

        // Validar configuração
        ConfigValidator.validateTemperatureConfig(config);
        return config;
    }

    /**
     * Obtém configurações específicas de temperatura para uma casa
     * @param {string} houseUuid - Identificador único da casa
     * @returns {Object} Configurações de temperatura da casa
     */
    static getHouseTemperatureConfig(houseUuid) {
        const houseConfig = this.houseConfigs[houseUuid]?.temperature || {
            min: 2.0,
            max: 18.0,
            bufferZone: 1.0,
            alertCooldown: 900000,    // 15 minutos
            readingInterval: 300000    // 5 minutos
        };

        ConfigValidator.validateTemperatureConfig(houseConfig);
        return houseConfig;
    }

    /**
     * Regras de validação para leituras de temperatura
     * @returns {Object} Regras de validação
     */
    static get validationRules() {
        return {
            temperature: {
                /**
                 * Valida o intervalo de temperatura
                 * @param {number} temp - Temperatura a validar
                 * @returns {Object} Resultado da validação
                 */
                validateRange: (temp) => {
                    const config = this.sensorConfig.simulationConfig;
                    return {
                        isValid: temp >= config.min && temp <= config.max,
                        value: Math.min(Math.max(temp, config.min), config.max)
                    };
                },

                /**
                 * Valida a mudança de temperatura
                 * @param {number} currentTemp - Temperatura atual
                 * @param {number} lastTemp - Última temperatura
                 * @param {number} timeDiff - Diferença de tempo em ms
                 * @returns {Object} Resultado da validação
                 */
                validateChange: (currentTemp, lastTemp, timeDiff) => {
                    if (!lastTemp) return { isValid: true, value: currentTemp };
                    
                    const config = this.sensorConfig.validation;
                    const maxChange = (config.maxRateOfChange * timeDiff) / 60000;
                    const actualChange = Math.abs(currentTemp - lastTemp);
                    
                    if (actualChange > maxChange) {
                        const direction = currentTemp > lastTemp ? 1 : -1;
                        return {
                            isValid: false,
                            value: lastTemp + (maxChange * direction)
                        };
                    }
                    
                    return { isValid: true, value: currentTemp };
                }
            }
        };
    }

    /**
     * Verifica se uma temperatura deve ser exibida
     * @param {number} newTemp - Nova temperatura
     * @param {number} oldTemp - Temperatura anterior
     * @param {number} lastDisplayTime - Timestamp da última exibição
     * @returns {boolean} Verdadeiro se deve exibir
     */
    static shouldDisplayTemperature(newTemp, oldTemp, lastDisplayTime) {
        if (!oldTemp || !lastDisplayTime) return true;
        
        const now = Date.now();
        const config = this.sensorConfig;
        
        // Verificar intervalo mínimo
        if (now - lastDisplayTime >= config.publishInterval) {
            return true;
        }

        // Verificar mudança significativa
        return Math.abs(newTemp - oldTemp) >= config.validation.stabilityThreshold;
    }
}

module.exports = TemperatureSensorConfig;