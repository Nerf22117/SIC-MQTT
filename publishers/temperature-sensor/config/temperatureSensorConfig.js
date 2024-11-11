// publishers/temperature-sensor/config/temperatureSensorConfig.js

const CommonConfig = require('../../../config/commonConfig');
const ConfigValidator = require('../../../config/validators/configValidator');

/**
 * Configurações específicas do sensor de temperatura
 */
class TemperatureSensorConfig extends CommonConfig {
    /**
     * Configurações base do sensor de temperatura
     * @returns {Object} Configurações do sensor
     */
    static get sensorConfig() {
        const isDev = this.environmentConfig.isDevelopment;
        
        const config = {
            publishInterval: isDev ? 5000 : 300000,
            simulationConfig: {
                min: 5.0,
                max: 25.0,
                variance: 0.2,
                stabilizationTime: 300000
            },
            validation: {
                maxRateOfChange: 0.5,
                stabilityThreshold: 0.1,
                minReadings: 3
            }
        };

        return config;
    }

    /**
     * Obtém ou cria configuração de temperatura para uma casa
     * @param {string} houseUuid - Identificador da casa
     * @param {Object} testConfig - Configuração opcional para testes
     * @returns {Object} Configuração de temperatura
     */
    static getHouseTemperatureConfig(houseUuid, testConfig = null) {
        // Se fornecida, usar configuração de teste
        if (testConfig) {
            ConfigValidator.validateTemperatureConfig(testConfig);
            return testConfig;
        }

        // Caso contrário, usar configuração padrão da casa
        const houseConfig = this.houseConfigs[houseUuid]?.temperature || {
            min: 2.0,
            max: 18.0,
            bufferZone: 1.0,
            alertCooldown: 900000,
            readingInterval: 300000
        };

        ConfigValidator.validateTemperatureConfig(houseConfig);
        return houseConfig;
    }

    /**
     * Regras de validação para leituras de temperatura
     */
    static get validationRules() {
        return {
            temperature: {
                validateRange: (temp) => {
                    const config = this.sensorConfig.simulationConfig;
                    return {
                        isValid: temp >= config.min && temp <= config.max,
                        value: Math.min(Math.max(temp, config.min), config.max)
                    };
                },
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