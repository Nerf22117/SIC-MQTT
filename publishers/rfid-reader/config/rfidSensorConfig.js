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

        return config;
    }

    /**
     * Obtém configurações específicas para uma prateleira
     * @param {string} shelfId - Identificador da prateleira
     * @returns {Object} Configurações da prateleira
     * @throws {Error} Se a configuração for inválida
     */
    static getShelfRFIDConfig(shelfId) {
        if (!shelfId) {
            throw new Error("ID da prateleira não fornecido");
        }

        // Obter configuração da casa atual
        const houseConfig = this.houseConfigs[this.currentHouse];
        if (!houseConfig) {
            throw new Error(`Configuração não encontrada para casa ${this.currentHouse}`);
        }

        // Encontrar prateleira específica
        const shelf = houseConfig.shelves.find(s => s.id === shelfId);
        if (!shelf) {
            throw new Error(`Prateleira ${shelfId} não encontrada`);
        }

        // Obter produtos válidos para a prateleira
        const validProducts = houseConfig.products
            ?.filter(p => p.shelfId === shelfId)
            .map(p => p.rfid_tag) || [];

        // Criar configuração específica da prateleira
        const config = {
            readerId: shelf.rfidReader,  // Usa o ID definido em commonConfig
            validProducts,
            validationRules: {
                tagFormat: /^[A-Fa-f0-9]{10}$/,  // Formato: 10 caracteres hexadecimais
                maxReadAttempts: 3,
                readTimeout: 2000
            },
            errorHandling: {
                retryDelay: 500,
                maxConsecutiveErrors: 5,
                recoveryTime: 10000
            }
        };

        // Validar configuração antes de retornar
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
                validateTag: (tag) => {
                    const isValid = /^[A-Fa-f0-9]{10}$/.test(tag);
                    return {
                        isValid,
                        value: isValid ? tag.toUpperCase() : null,
                        reason: isValid ? null : "formato_inválido"
                    };
                },

                /**
                 * Verifica se uma tag está registada
                 * @param {string} tag - Tag RFID
                 * @param {string} shelfId - ID da prateleira
                 * @returns {Object} Resultado da verificação
                 */
                validateRegistration: (tag, shelfId) => {
                    const config = this.getShelfRFIDConfig(shelfId);
                    const isRegistered = config.validProducts.includes(tag);
                    return {
                        isValid: isRegistered,
                        reason: isRegistered ? null : "produto_não_registado"
                    };
                },

                /**
                 * Valida uma sequência de leituras
                 * @param {Array} readings - Sequência de leituras
                 * @returns {Object} Resultado da validação
                 */
                validateReadingSequence: (readings) => {
                    if (!Array.isArray(readings) || readings.length === 0) {
                        return {
                            isValid: false,
                            reason: "sequência_inválida"
                        };
                    }

                    // Verificar duplicados próximos
                    const duplicates = this.findDuplicateReadings(readings);
                    if (duplicates.length > 0) {
                        return {
                            isValid: false,
                            reason: "leituras_duplicadas",
                            duplicates
                        };
                    }

                    return {
                        isValid: true
                    };
                }
            }
        };
    }

    /**
     * Encontra leituras duplicadas dentro da janela de tempo
     * @param {Array} readings - Sequência de leituras
     * @returns {Array} Leituras duplicadas encontradas
     * @private
     */
    static findDuplicateReadings(readings) {
        const duplicates = [];
        const window = this.sensorConfig.validation.duplicateWindow;

        for (let i = 0; i < readings.length - 1; i++) {
            for (let j = i + 1; j < readings.length; j++) {
                const timeDiff = new Date(readings[j].timestamp) - new Date(readings[i].timestamp);
                if (timeDiff <= window && 
                    readings[i].rfid_tag === readings[j].rfid_tag && 
                    readings[i].action === readings[j].action) {
                    duplicates.push({
                        original: readings[i],
                        duplicate: readings[j],
                        timeDiff
                    });
                }
            }
        }

        return duplicates;
    }
}

module.exports = RFIDSensorConfig;