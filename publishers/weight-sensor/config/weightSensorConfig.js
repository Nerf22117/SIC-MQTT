// publishers/weight-sensor/config/weightSensorConfig.js

const CommonConfig = require('../../../config/commonConfig');
const ConfigValidator = require('../../../config/validators/configValidator');

/**
 * Configurações específicas do sensor de peso
 * Estende as configurações comuns do sistema
 */
class WeightSensorConfig extends CommonConfig {
    /**
     * Constantes relacionadas com peso
     * @returns {Object} Constantes de peso
     */
    static get WEIGHT_CONSTANTS() {
        return {
            MIN_WEIGHT_CHANGE: 50,      // Mudança mínima significativa (g)
            NOISE_THRESHOLD: 2,         // Tolerância para ruído (g)
            STABILITY_DELAY: 2000,      // Tempo para estabilização (ms)
            MAX_DEVIATION: 100,         // Desvio máximo aceitável (g)
            DEFAULT_MAX_WEIGHT: 30000   // Peso máximo padrão (g)
        };
    }

    /**
     * Configurações base do sensor de peso
     * @returns {Object} Configurações do sensor
     */
    static get sensorConfig() {
        const isDev = this.environmentConfig.isDevelopment;
        
        const config = {
            publishInterval: isDev ? 1000 : 3000,
            simulationConfig: {
                noiseLevel: this.WEIGHT_CONSTANTS.NOISE_THRESHOLD,
                driftRate: 0.1,            // Taxa de desvio natural
                stabilizationTime: this.WEIGHT_CONSTANTS.STABILITY_DELAY,
                movementPatterns: {
                    oscillationRange: 10,   // Variação durante estabilização
                    temperatureEffect: 0.01 // Efeito da temperatura no peso
                }
            },
            validation: {
                zeroThreshold: 5,          // Tolerância para peso zero
                stabilityThreshold: 3,      // Variação considerada estável
                minWeightChange: this.WEIGHT_CONSTANTS.MIN_WEIGHT_CHANGE,
                maxDeviation: this.WEIGHT_CONSTANTS.MAX_DEVIATION,
                maxReadAttempts: 3,         // Tentativas máximas de leitura
                readingTimeout: 5000        // Tempo máximo para leitura
            }
        };

        ConfigValidator.validateWeightConfig(config);
        return config;
    }

    /**
     * Obtém configurações específicas para uma prateleira
     * @param {string} shelfId - Identificador da prateleira
     * @returns {Object} Configurações da prateleira
     */
    static getShelfWeightConfig(shelfId) {
        const shelf = this.houseConfigs[this.currentHouse]?.shelves
            .find(s => s.id === shelfId);

        const config = {
            sensorId: shelf?.weightSensor || `WS-${shelfId}`,
            maxWeight: shelf?.maxWeight || this.WEIGHT_CONSTANTS.DEFAULT_MAX_WEIGHT,
            characteristics: {
                precision: 1,         // Precisão da medição
                resolution: 0.5,      // Resolução mínima
                temperatureCoefficient: 0.002  // Influência da temperatura
            }
        };

        ConfigValidator.validateWeightConfig(config);
        return config;
    }

    /**
     * Regras de validação para leituras de peso
     * @returns {Object} Regras de validação
     */
    static get validationRules() {
        return {
            weight: {
                /**
                 * Valida uma leitura de peso
                 * @param {number} value - Peso atual
                 * @param {number} previousValue - Peso anterior
                 * @returns {Object} Resultado da validação
                 */
                validateReading: (value, previousValue = null) => {
                    const config = this.sensorConfig.validation;
                    
                    // Validar mudança máxima
                    if (previousValue !== null) {
                        const maxChange = config.maxDeviation;
                        if (Math.abs(value - previousValue) > maxChange) {
                            return { 
                                isValid: false, 
                                value: previousValue, 
                                reason: "mudança_excessiva" 
                            };
                        }
                    }

                    // Validar limites
                    const shelfConfig = this.getShelfWeightConfig(this.currentShelf);
                    if (value < 0 || value > shelfConfig.maxWeight) {
                        return { 
                            isValid: false, 
                            value: previousValue || 0, 
                            reason: "fora_dos_limites" 
                        };
                    }

                    return { 
                        isValid: true, 
                        value: Number(value.toFixed(1)) 
                    };
                }
            }
        };
    }
}

module.exports = WeightSensorConfig;