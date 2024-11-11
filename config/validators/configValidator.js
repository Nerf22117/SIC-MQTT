// config/validators/configValidator.js

/**
 * Classe responsável pela validação de configurações do sistema
 * Fornece métodos estáticos para validar diferentes tipos de configuração
 */
class ConfigValidator {
    /**
     * Valida configurações básicas do broker MQTT
     * @param {Object} config - Configuração do broker
     * @throws {Error} Se a configuração for inválida
     */
    static validateBrokerConfig(config) {
        if (!config.url) {
            throw new Error("URL do broker MQTT não definida");
        }
        if (!config.options) {
            throw new Error("Opções do broker MQTT não definidas");
        }
    }

    /**
     * Valida configurações de temperatura
     * @param {Object} config - Configuração de temperatura
     * @throws {Error} Se a configuração for inválida
     */
    static validateTemperatureConfig(config) {
        if (typeof config.min !== 'number' || typeof config.max !== 'number') {
            throw new Error("Limites de temperatura não definidos corretamente");
        }
        if (config.min >= config.max) {
            throw new Error("Temperatura mínima deve ser menor que a máxima");
        }
        if (typeof config.bufferZone !== 'number' || config.bufferZone <= 0) {
            throw new Error("Zona de buffer de temperatura inválida");
        }
    }

    /**
     * Valida configurações de peso
     * @param {Object} config - Configuração de peso
     * @throws {Error} Se a configuração for inválida
     */
    static validateWeightConfig(config) {
        if (!config.maxWeight || config.maxWeight <= 0) {
            throw new Error("Peso máximo inválido");
        }
        if (!config.minWeightChange || config.minWeightChange <= 0) {
            throw new Error("Mudança mínima de peso inválida");
        }
    }

    /**
     * Valida configurações de RFID
     * @param {Object} config - Configuração de RFID
     * @throws {Error} Se a configuração for inválida
     */
    static validateRFIDConfig(config) {
        if (!config.readerId) {
            throw new Error("ID do leitor RFID não definido");
        }
        if (!config.validationRules || !config.validationRules.tagFormat) {
            throw new Error("Regras de validação RFID não definidas");
        }
    }

    /**
     * Valida configurações de alerta
     * @param {Object} config - Configuração de alertas
     * @throws {Error} Se a configuração for inválida
     */
    static validateAlertConfig(config) {
        if (!config.types || !config.severity) {
            throw new Error("Configurações de alerta incompletas");
        }
        if (!config.types.TEMPERATURE || !config.types.PRODUCT) {
            throw new Error("Tipos de alerta não definidos corretamente");
        }
    }

    /**
     * Valida configurações de casa
     * @param {Object} config - Configuração da casa
     * @throws {Error} Se a configuração for inválida
     */
    static validateHouseConfig(config) {
        if (!config.name) {
            throw new Error("Nome da casa não definido");
        }
        if (!config.temperature || !config.shelves) {
            throw new Error("Configuração de casa incompleta");
        }
        this.validateTemperatureConfig(config.temperature);
    }

    /**
     * Valida configurações de prateleira
     * @param {Object} config - Configuração da prateleira
     * @throws {Error} Se a configuração for inválida
     */
    static validateShelfConfig(config) {
        if (!config.id || !config.name) {
            throw new Error("Identificação da prateleira incompleta");
        }
        if (!config.maxWeight) {
            throw new Error("Peso máximo da prateleira não definido");
        }
    }
}

module.exports = ConfigValidator;