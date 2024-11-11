// config/commonConfig.js

/**
 * Configurações comuns do sistema StockWise
 * Fornece acesso a configurações base utilizadas por todos os componentes
 */
class CommonConfig {
    /**
     * Configurações do broker MQTT
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
        
        return config;
    }

    /**
     * Padrões de tópicos MQTT
     */
    static get topicPatterns() {
        return {
            TEMPERATURE: "house/{house_uuid}/temperature",
            ALERTS: "house/{house_uuid}/alerts",
            SHELF_WEIGHT: "house/{house_uuid}/shelf/{shelf_id}/weight",
            SHELF_PRODUCTS: "house/{house_uuid}/shelf/{shelf_id}/products",
            BASE: "house/{house_uuid}"
        };
    }

    /**
     * Configurações de ambiente
     */
    static get environmentConfig() {
        return {
            isDevelopment: process.env.NODE_ENV !== 'production',
            isProduction: process.env.NODE_ENV === 'production',
            debugMode: process.env.DEBUG === 'true'
        };
    }

    /**
     * Configurações base das casas
     */
    static get houseConfigs() {
        return {
            "12345": {
                name: "Casa Principal",
                temperature: {
                    min: 14.0,
                    max: 16.0,
                    bufferZone: 1.0,
                    alertCooldown: 900000,
                    readingInterval: 300000
                },
                shelves: [
                    {
                        id: "A1",
                        name: "Prateleira 1",
                        maxWeight: 30000,
                        weightSensor: "WS-A1",
                        rfidReader: "RFID-A1"
                    },
                    {
                        id: "A2",
                        name: "Prateleira 2",
                        maxWeight: 30000,
                        weightSensor: "WS-A2",
                        rfidReader: "RFID-A2"
                    }
                ],
                products: [
                    {
                        id: "P1",
                        name: "Arroz",
                        rfid_tag: "1234567890",
                        shelfId: "A1",
                        min_stock: 1000,
                        container_weight: 50
                    },
                    {
                        id: "P2",
                        name: "Massa",
                        rfid_tag: "0987654321",
                        shelfId: "A1",
                        min_stock: 500,
                        container_weight: 30
                    }
                ]
            }
        };
    }

    /**
     * ID da casa atual para testes e desenvolvimento
     */
    static get currentHouse() {
        return "12345";
    }

    /**
     * Formata um tópico MQTT substituindo os parâmetros
     * @param {string} pattern - Padrão do tópico
     * @param {Object} params - Parâmetros para substituição
     * @returns {string} Tópico formatado
     */
    static formatTopic(pattern, params) {
        try {
            // Se pattern for uma chave dos padrões, obter o padrão correspondente
            const topicPattern = this.topicPatterns[pattern] || pattern;

            if (!topicPattern) {
                throw new Error("Padrão de tópico indefinido");
            }

            let formattedTopic = topicPattern;
            
            if (params) {
                Object.entries(params).forEach(([key, value]) => {
                    const placeholder = `{${key}}`;
                    formattedTopic = formattedTopic.replace(placeholder, value);
                });
            }

            return formattedTopic;
        } catch (error) {
            console.error('Erro ao formatar tópico:', error);
            throw error;
        }
    }
}

module.exports = CommonConfig;