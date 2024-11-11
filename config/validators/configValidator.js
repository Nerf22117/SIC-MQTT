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
        if (!config || typeof config !== 'object') {
            throw new Error("Configuração de temperatura inválida");
        }

        // Validar limites de temperatura
        if (!('min' in config) || !('max' in config)) {
            throw new Error("Limites de temperatura não definidos");
        }

        if (typeof config.min !== 'number' || typeof config.max !== 'number') {
            throw new Error("Limites de temperatura devem ser números");
        }

        if (config.min >= config.max) {
            throw new Error(`Temperatura mínima (${config.min}) deve ser menor que máxima (${config.max})`);
        }

        // Validar zona de buffer
        if ('bufferZone' in config) {
            if (typeof config.bufferZone !== 'number' || config.bufferZone <= 0) {
                throw new Error("Zona de buffer de temperatura inválida");
            }
        }
    }

    /**
     * Valida configurações de peso
     * @param {Object} config - Configuração de peso
     * @throws {Error} Se a configuração for inválida
     */
    static validateWeightConfig(config) {
        if (!config || typeof config !== 'object') {
            throw new Error("Configuração de peso inválida");
        }

        // Validar peso máximo se definido
        if ('maxWeight' in config) {
            if (typeof config.maxWeight !== 'number' || config.maxWeight <= 0) {
                throw new Error("Peso máximo inválido");
            }
        }

        // Validar características se definidas
        if (config.characteristics) {
            const { precision, resolution } = config.characteristics;
            if (typeof precision !== 'number' || precision <= 0) {
                throw new Error("Precisão inválida");
            }
            if (typeof resolution !== 'number' || resolution <= 0) {
                throw new Error("Resolução inválida");
            }
        }
    }

    /**
     * Valida configurações de RFID
     * @param {Object} config - Configuração de RFID
     * @throws {Error} Se a configuração for inválida
     */
    static validateRFIDConfig(config) {
        if (!config || typeof config !== 'object') {
            throw new Error("Configuração RFID inválida");
        }

        // Validar ID do leitor
        if (!config.readerId || typeof config.readerId !== 'string') {
            throw new Error("ID do leitor RFID não definido ou inválido");
        }

        // Validar lista de produtos válidos se presente
        if ('validProducts' in config && !Array.isArray(config.validProducts)) {
            throw new Error("Lista de produtos válidos deve ser um array");
        }

        // Validar regras de validação
        if (config.validationRules) {
            if (!config.validationRules.tagFormat) {
                throw new Error("Formato de tag RFID não definido");
            }
            if (config.validationRules.maxReadAttempts && 
                typeof config.validationRules.maxReadAttempts !== 'number') {
                throw new Error("Número máximo de tentativas de leitura inválido");
            }
        }

        // Validar configurações de tratamento de erros se presentes
        if (config.errorHandling) {
            const { retryDelay, maxConsecutiveErrors, recoveryTime } = config.errorHandling;
            
            if (typeof retryDelay !== 'number' || retryDelay <= 0) {
                throw new Error("Tempo de nova tentativa inválido");
            }
            if (typeof maxConsecutiveErrors !== 'number' || maxConsecutiveErrors <= 0) {
                throw new Error("Número máximo de erros consecutivos inválido");
            }
            if (typeof recoveryTime !== 'number' || recoveryTime <= 0) {
                throw new Error("Tempo de recuperação inválido");
            }
        }
    }

    /**
     * Valida configurações de alerta
     * @param {Object} config - Configuração de alertas
     * @throws {Error} Se a configuração for inválida
     */
    static validateAlertConfig(config) {
        if (!config || typeof config !== 'object') {
            throw new Error("Configuração de alertas inválida");
        }

        // Validar tipos de alerta
        if (!config.types || !config.severity) {
            throw new Error("Configurações de alerta incompletas");
        }

        // Validar configurações de temperatura
        if (config.types.TEMPERATURE) {
            const temp = config.types.TEMPERATURE;
            if (!temp.cooldown || typeof temp.cooldown !== 'number') {
                throw new Error("Tempo de cooldown de temperatura inválido");
            }
        }

        // Validar configurações de produto
        if (config.types.PRODUCT) {
            const prod = config.types.PRODUCT;
            if (!prod.cooldown || typeof prod.cooldown !== 'number') {
                throw new Error("Tempo de cooldown de produto inválido");
            }
        }
    }

    /**
     * Valida configurações de casa
     * @param {Object} config - Configuração da casa
     * @throws {Error} Se a configuração for inválida
     */
    static validateHouseConfig(config) {
        if (!config || typeof config !== 'object') {
            throw new Error("Configuração de casa inválida");
        }

        if (!config.name) {
            throw new Error("Nome da casa não definido");
        }

        // Validar configuração de temperatura
        if (config.temperature) {
            this.validateTemperatureConfig(config.temperature);
        }

        // Validar prateleiras
        if (!Array.isArray(config.shelves)) {
            throw new Error("Lista de prateleiras inválida");
        }

        config.shelves.forEach((shelf, index) => {
            try {
                this.validateShelfConfig(shelf);
            } catch (error) {
                throw new Error(`Erro na prateleira ${index}: ${error.message}`);
            }
        });
    }

    /**
     * Valida configurações de prateleira
     * @param {Object} config - Configuração da prateleira
     * @throws {Error} Se a configuração for inválida
     */
    static validateShelfConfig(config) {
        if (!config || typeof config !== 'object') {
            throw new Error("Configuração de prateleira inválida");
        }

        if (!config.id || !config.name) {
            throw new Error("Identificação da prateleira incompleta");
        }

        if (!config.maxWeight || typeof config.maxWeight !== 'number') {
            throw new Error("Peso máximo da prateleira não definido ou inválido");
        }

        if (!config.weightSensor || !config.rfidReader) {
            throw new Error("Sensores da prateleira não definidos corretamente");
        }
    }
}

module.exports = ConfigValidator;