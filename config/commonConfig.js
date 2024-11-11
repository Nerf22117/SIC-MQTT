// config/commonConfig.js

const ConfigValidator = require('./validators/configValidator');

/**
 * Configurações comuns do sistema StockWise
 * Fornece acesso a configurações base utilizadas por todos os componentes
 */
class CommonConfig {
    /**
     * Configurações do broker MQTT
     * @returns {Object} Configuração do broker
     */
    static get brokerConfig() {
        const config = {
            url: process.env.MQTT_BROKER_URL || "mqtt://localhost:1883",
            options: {
                clean: true,
                connectTimeout: 4000,
                reconnectPeriod: 1000,
                qos: 1,
                retain: false
            }
        };
        
        ConfigValidator.validateBrokerConfig(config);
        return config;
    }

    /**
     * Padrões de tópicos MQTT
     * @returns {Object} Padrões de tópicos
     */
    static get topicPatterns() {
        return {
            TEMPERATURE: "house/{house_uuid}/temperature",
            ALERTS: "house/{house_uuid}/alerts",
            SHELF_WEIGHT: "house/{house_uuid}/shelf/{shelf_id}/weight",
            SHELF_PRODUCTS: "house/{house_uuid}/shelf/{shelf_id}/products"
        };
    }

    /**
     * Configurações de ambiente
     * @returns {Object} Configurações do ambiente
     */
    static get environmentConfig() {
        return {
            isDevelopment: process.env.NODE_ENV !== 'production',
            isProduction: process.env.NODE_ENV === 'production',
            debugMode: process.env.DEBUG === 'true'
        };
    }

    /**
     * Configurações de registos (logs)
     * @returns {Object} Configurações de registos
     */
    static get loggingConfig() {
        return {
            level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
            temperatureLogInterval: 300000, // 5 minutos
            format: {
                timestamp: true,
                includeHouseId: true,
                includeSensorId: true
            }
        };
    }

    /**
     * Configurações base das casas
     * @returns {Object} Configurações das casas
     */
    static get houseConfigs() {
        const configs = {
            "12345": {
                name: "Casa Principal",
                temperature: {
                    min: 14.0,
                    max: 16.0,
                    bufferZone: 1.0,
                    alertCooldown: 900000,    // 15 minutos
                    readingInterval: 300000   // 5 minutos
                },
                shelves: [
                    {
                        id: "A1",
                        name: "Prateleira 1",
                        maxWeight: 30000
                    },
                    {
                        id: "A2",
                        name: "Prateleira 2",
                        maxWeight: 30000
                    }
                ]
            }
        };

        // Validar cada configuração de casa
        Object.values(configs).forEach(config => {
            ConfigValidator.validateHouseConfig(config);
        });

        return configs;
    }

    /**
     * Formata um tópico MQTT substituindo os parâmetros
     * @param {string} pattern - Padrão do tópico
     * @param {Object} params - Parâmetros para substituição
     * @returns {string} Tópico formatado
     */
    static formatTopic(pattern, params) {
        if (!pattern) {
            throw new Error("Padrão de tópico indefinido");
        }

        let formattedTopic = pattern;

        if (params) {
            Object.entries(params).forEach(([key, value]) => {
                if (typeof formattedTopic !== 'string') {
                    throw new Error(`Padrão de tópico inválido: ${pattern}`);
                }
                formattedTopic = formattedTopic.replace(`{${key}}`, value);
            });
        }

        return formattedTopic;
    }
}

module.exports = CommonConfig;