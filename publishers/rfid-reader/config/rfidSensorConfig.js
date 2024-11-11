// publishers/rfid-reader/config/rfidSensorConfig.js

const CommonConfig = require('../../../config/commonConfig');
const ConfigValidator = require('../../../config/validators/configValidator');

/**
 * Configurações específicas do leitor RFID
 * Estende as configurações comuns do sistema
 */
class RFIDSensorConfig extends CommonConfig {
    /**
     * Configurações base do sensor RFID
     * @returns {Object} Configurações do sensor
     */
    static get sensorConfig() {
        const isDev = this.environmentConfig.isDevelopment;
        
        const config = {
            publishInterval: isDev ? 1000 : 5000,
            simulationConfig: {
                readProbability: 0.3,      // Probabilidade de leitura
                readErrorRate: 0.02,       // Taxa de erro de leitura
                movementPatterns: {
                    addProbability: 0.6,   // Probabilidade de adição
                    removeProbability: 0.4, // Probabilidade de remoção
                    multiReadWindow: 2000   // Janela para leituras múltiplas
                }
            },
            validation: {
                maxReadingsPerCycle: 3,    // Máximo de leituras por ciclo
                minReadInterval: 500,      // Intervalo mínimo entre leituras
                readTimeout: 5000,         // Tempo limite para leitura
                duplicateWindow: 1000      // Janela para deteção de duplicados
            },
            correlation: {
                timeWindow: 5000,          // Janela para correlação com peso
                minConfidence: 0.8,        // Confiança mínima para correlação
                maxAttempts: 3             // Tentativas máximas de correlação
            }
        };

        ConfigValidator.validateRFIDConfig(config);
        return config;
    }

    /**
     * Obtém configurações específicas para uma prateleira
     * @param {string} shelfId - Identificador da prateleira
     * @returns {Object} Configurações da prateleira
     */
    static getShelfRFIDConfig(shelfId) {
        // Obter produtos válidos para a prateleira
        const validProducts = this.houseConfigs[this.currentHouse]?.products
            .filter(p => p.shelfId === shelfId)
            .map(p => p.rfid_tag) || [];

        const config = {
            readerId: `RFID-${shelfId}`,
            validProducts: validProducts,
            validationRules: {
                tagFormat: /^[A-Fa-f0-9]{10}$/,  // Formato válido de tag RFID
                maxReadAttempts: 3,              // Tentativas máximas de leitura
                readTimeout: 2000                // Tempo limite por tentativa
            },
            errorHandling: {
                retryDelay: 500,                // Atraso entre tentativas
                maxConsecutiveErrors: 5,         // Erros consecutivos máximos
                recoveryTime: 10000             // Tempo de recuperação após erro
            }
        };

        ConfigValidator.validateRFIDConfig(config);
        return config;
    }

    /**
     * Regras de validação para tags RFID
     * @returns {Object} Regras de validação
     */
    static get validationRules() {
        return {
            rfid: {
                /**
                 * Valida uma tag RFID
                 * @param {string} tag - Tag RFID a validar
                 * @returns {Object} Resultado da validação
                 */
                validateTag(tag) {
                    const isValid = /^[A-Fa-f0-9]{10}$/.test(tag);
                    return {
                        isValid,
                        value: isValid ? tag.toUpperCase() : null,
                        reason: isValid ? null : "formato_inválido"
                    };
                },

                /**
                 * Verifica se uma tag está registada
                 * @param {string} tag - Tag RFID a verificar
                 * @param {string} shelfId - Identificador da prateleira 
                 * @returns {Object} Resultado da verificação
                 */
                validateRegistration(tag, shelfId) {
                    const config = this.getShelfRFIDConfig(shelfId);
                    const isRegistered = config.validProducts.includes(tag);
                    return {
                        isValid: isRegistered,
                        reason: isRegistered ? null : "produto_não_registado"
                    };
                }
            }
        };
    }

    /**
     * Formata um tópico MQTT específico do RFID
     * @param {string} pattern - Padrão do tópico
     * @param {Object} params - Parâmetros para substituição
     * @returns {string} Tópico formatado
     */
    static formatTopic(pattern, params) {
        const topicPattern = typeof pattern === 'string' 
            ? pattern 
            : this.TOPIC_PATTERNS[pattern];

        if (!topicPattern) {
            throw new Error(`Padrão de tópico inválido: ${pattern}`);
        }

        return super.formatTopic(topicPattern, params);
    }
}

module.exports = RFIDSensorConfig;