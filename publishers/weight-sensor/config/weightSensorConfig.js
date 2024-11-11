// publishers\weight-sensor\config\weightSensorConfig.js

const CommonConfig = require("../../../config/commonConfig");

class WeightSensorConfig extends CommonConfig {
    // Constantes comuns para peso - podem ser acedidas por outros módulos
    static get WEIGHT_CONSTANTS() {
        return {
            MIN_WEIGHT_CHANGE: 50,      // Mudança mínima significativa em gramas
            NOISE_THRESHOLD: 2,         // Tolerância para ruído em gramas
            STABILITY_DELAY: 2000,      // Tempo para considerar leitura estável em ms
            MAX_DEVIATION: 100,         // Desvio máximo aceitável em gramas
            DEFAULT_MAX_WEIGHT: 30000   // Peso máximo padrão em gramas
        };
    }

    static get TOPIC_PATTERNS() {
        return CommonConfig.topicPatterns;
    }

    static get topicPatterns() {
        return this.TOPIC_PATTERNS;
    }

    // Configuração específica do sensor
    static get sensorConfig() {
        const isDev = this.environmentConfig.isDevelopment;
        return {
            publishInterval: isDev ? 1000 : 3000,
            simulationConfig: {
                noiseLevel: this.WEIGHT_CONSTANTS.NOISE_THRESHOLD,
                driftRate: 0.1,
                stabilizationTime: this.WEIGHT_CONSTANTS.STABILITY_DELAY,
                movementPatterns: {
                    oscillationRange: 10,
                    temperatureEffect: 0.01
                }
            },
            validation: {
                zeroThreshold: 5,
                stabilityThreshold: 3,
                minWeightChange: this.WEIGHT_CONSTANTS.MIN_WEIGHT_CHANGE,
                maxDeviation: this.WEIGHT_CONSTANTS.MAX_DEVIATION,
                maxReadAttempts: 3,
                readingTimeout: 5000
            }
        };
    }

    // Configuração específica da prateleira
    static getShelfWeightConfig(shelfId) {
        const shelf = this.houseConfigs[this.currentHouse]?.shelves.find(s => s.id === shelfId);
        return {
            sensorId: shelf?.weightSensor,
            maxWeight: shelf?.maxWeight || this.WEIGHT_CONSTANTS.DEFAULT_MAX_WEIGHT,
            characteristics: {
                precision: 1,
                resolution: 0.5,
                temperatureCoefficient: 0.002
            }
        };
    }

    static get validationRules() {
        return {
            weight: {
                validateReading: (value, previousValue = null) => {
                    const config = this.sensorConfig;
                    
                    if (previousValue !== null) {
                        const maxChange = config.validation.maxDeviation;
                        if (Math.abs(value - previousValue) > maxChange) {
                            return { 
                                isValid: false, 
                                value: previousValue, 
                                reason: "excessive_change" 
                            };
                        }
                    }

                    const shelfConfig = this.getShelfWeightConfig(this.currentShelf);
                    if (value < 0 || value > shelfConfig.maxWeight) {
                        return { 
                            isValid: false, 
                            value: previousValue || 0, 
                            reason: "out_of_bounds" 
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

    static formatTopic(pattern, params) {
        const topicPattern = typeof pattern === 'string' 
            ? pattern 
            : this.TOPIC_PATTERNS[pattern];

        if (!topicPattern) {
            throw Error(`Invalid topic pattern: ${pattern}`);
        }

        return super.formatTopic(topicPattern, params);
    }
}

module.exports = WeightSensorConfig;