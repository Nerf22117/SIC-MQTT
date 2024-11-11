// subscribers/alerts/config/alertConfig.js

const CommonConfig = require('../../../config/commonConfig');
const ConfigValidator = require('../../../config/validators/configValidator');

/**
 * Configurações do sistema de alertas
 * Gere as definições para geração e gestão de alertas
 */
class AlertConfig extends CommonConfig {
    /**
     * Configurações gerais de alertas
     * @returns {Object} Configurações de alertas
     */
    static get alertConfig() {
        const isDev = this.environmentConfig.isDevelopment;
        
        const config = {
            severity: {
                HIGH: "high",     // Alerta de alta prioridade
                MEDIUM: "medium", // Alerta de média prioridade
                LOW: "low"        // Alerta de baixa prioridade
            },
            types: {
                TEMPERATURE: {
                    HIGH: "high_temperature",    // Temperatura acima do limite
                    LOW: "low_temperature",      // Temperatura abaixo do limite
                    severity: "high",
                    cooldown: isDev ? 60000 : 900000,  // 1min dev / 15min prod
                    bufferZone: 1.0,                   // Zona de tolerância
                    requiredReadingsForAlert: 3        // Leituras para confirmar
                },
                PRODUCT: {
                    UNREGISTERED: "unregistered_product", // Produto não registado
                    LOW_STOCK: "low_stock",               // Stock baixo
                    WEIGHT_MISMATCH: "weight_mismatch",  // Divergência de peso
                    severity: "medium",
                    cooldown: isDev ? 30000 : 300000,    // 30s dev / 5min prod
                    correlation: {
                        timeout: 5000,                    // Tempo para correlação
                        weightThreshold: 50               // Mudança mínima (g)
                    }
                }
            },
            notification: {
                retryAttempts: 3,                    // Tentativas de notificação
                retryDelay: 1000,                    // Atraso entre tentativas
                maxNotificationAge: 3600000          // Validade máxima (1h)
            }
        };

        ConfigValidator.validateAlertConfig(config);
        return config;
    }

    /**
     * Configurações para correlação de eventos
     * @returns {Object} Configurações de correlação
     */
    static get eventCorrelationConfig() {
        return {
            timeWindow: 5000,              // Janela de correlação (ms)
            weightStabilizationTime: 2000, // Tempo de estabilização do peso
            minWeightChange: 50,           // Mudança mínima significativa
            maxWeightDeviation: 100,       // Desvio máximo aceitável
            cleanupInterval: 10000         // Intervalo de limpeza do cache
        };
    }

    /**
     * Regras de validação para produtos
     * @returns {Object} Regras de validação
     */
    static get productValidationRules() {
        return {
            weight: {
                /**
                 * Valida alteração de peso
                 * @param {number} newWeight - Novo peso
                 * @param {number} oldWeight - Peso anterior
                 * @returns {Object} Resultado da validação
                 */
                validateChange: (newWeight, oldWeight) => {
                    const diff = Math.abs(newWeight - oldWeight);
                    return {
                        isValid: diff <= this.eventCorrelationConfig.maxWeightDeviation,
                        difference: diff
                    };
                }
            }
        };
    }

    /**
     * Obtém configurações de alerta para uma casa
     * @param {string} houseUuid - Identificador da casa
     * @returns {Object} Configurações de alerta
     */
    static getHouseAlertConfig(houseUuid) {
        const houseConfig = this.houseConfigs[houseUuid];
        if (!houseConfig) {
            throw new Error(`Casa não encontrada: ${houseUuid}`);
        }

        return {
            temperature: {
                min: houseConfig.temperature.min,
                max: houseConfig.temperature.max,
                bufferZone: houseConfig.temperature.bufferZone,
                alertCooldown: houseConfig.temperature.alertCooldown
            },
            products: houseConfig.products.reduce((acc, product) => {
                acc[product.id] = {
                    minStock: product.min_stock,
                    alertThreshold: product.min_stock * 1.2 // 20% acima do mínimo
                };
                return acc;
            }, {})
        };
    }

    /**
     * Verifica se um alerta deve ser gerado
     * @param {string} type - Tipo de alerta
     * @param {Object} lastAlert - Último alerta gerado
     * @returns {boolean} Verdadeiro se deve gerar alerta
     */
    static shouldGenerateAlert(type, lastAlert) {
        if (!lastAlert) return true;

        const now = Date.now();
        const cooldown = type.includes('temperature')
            ? this.alertConfig.types.TEMPERATURE.cooldown
            : this.alertConfig.types.PRODUCT.cooldown;

        return (now - lastAlert.timestamp) >= cooldown;
    }

    /**
     * Formata uma mensagem de alerta
     * @param {string} type - Tipo de alerta
     * @param {Object} data - Dados do alerta
     * @returns {Object} Mensagem formatada
     */
    static formatAlertMessage(type, data) {
        const now = new Date().toISOString();
        const baseAlert = {
            type,
            timestamp: now,
            severity: this.getAlertSeverity(type)
        };

        switch (type) {
            case this.alertConfig.types.TEMPERATURE.HIGH:
            case this.alertConfig.types.TEMPERATURE.LOW:
                return {
                    ...baseAlert,
                    temperature: data.temperature,
                    threshold: data.threshold,
                    readings_history: data.readings_history
                };

            case this.alertConfig.types.PRODUCT.LOW_STOCK:
                return {
                    ...baseAlert,
                    product_id: data.product_id,
                    current_stock: data.current_stock,
                    min_stock: data.min_stock
                };

            default:
                return {
                    ...baseAlert,
                    ...data
                };
        }
    }

    /**
     * Obtém a severidade de um tipo de alerta
     * @param {string} type - Tipo de alerta
     * @returns {string} Severidade do alerta
     */
    static getAlertSeverity(type) {
        if (type.includes('temperature')) {
            return this.alertConfig.types.TEMPERATURE.severity;
        }
        return this.alertConfig.types.PRODUCT.severity;
    }
}

module.exports = AlertConfig;