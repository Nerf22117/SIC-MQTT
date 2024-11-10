// config/commonConfig.js

require('dotenv').config();

const MQTT_PROTOCOLS = {
    MQTT: 'mqtt://',
    MQTTS: 'mqtts://',
    WS: 'ws://',
    WSS: 'wss://'
};

const TOPIC_PATTERNS = {
    TEMPERATURE: 'house/{house_uuid}/temperature',
    ALERTS: 'house/{house_uuid}/alerts',
    SHELF_WEIGHT: 'house/{house_uuid}/shelf/{shelf_id}/weight',
    SHELF_PRODUCTS: 'house/{house_uuid}/shelf/{shelf_id}/products'
};

const MQTT_OPTIONS = {
    clean: true,
    connectTimeout: 4000,
    reconnectPeriod: 1000,
    qos: 1,
    retain: false
};

class CommonConfig {
    static get brokerConfig() {
        return {
            url: process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883',
            options: MQTT_OPTIONS
        };
    }

    static get topicPatterns() {
        return TOPIC_PATTERNS;
    }

    static formatTopic(pattern, params) {
        let formattedTopic = pattern;
        Object.entries(params).forEach(([key, value]) => {
            formattedTopic = formattedTopic.replace(`{${key}}`, value);
        });
        return formattedTopic;
    }

    static get houseConfigs() {
        return {
            "12345": {
                name: "Casa Principal",
                temperature: {
                    min: 14.0,
                    max: 16.0,
                    bufferZone: 1.0,         // Zona de buffer para alertas
                    alertCooldown: 900000,    // 15 minutos em produção
                    readingInterval: 300000   // 5 minutos em produção
                },
                shelves: [
                    { id: "A1", name: "Prateleira 1", maxWeight: 30000 },
                    { id: "A2", name: "Prateleira 2", maxWeight: 30000 }
                ],
                products: [
                    {
                        id: "P1",
                        shelfId: "A1",
                        name: "Arroz",
                        rfid_tag: "1234567890",
                        min_stock: 2000 // Dois quilos de arroz
                    },
                    {
                        id: "P2",
                        shelfId: "A1",
                        name: "Feijão",
                        rfid_tag: "0987654321",
                        min_stock: 1000 // Um quilo de feijão
                    },
                    {
                        id: "P3",
                        shelfId: "A2",
                        name: "Massa",
                        rfid_tag: "1357924680",
                        min_stock: 1500 // Um quilo e meio de macarrão
                    },
                    {
                        id: "P4",
                        shelfId: "A2",
                        name: "Sal",
                        rfid_tag: "2468013579",
                        min_stock: 500 // Meio quilo de sal
                    }
                ]
            },
            "54321": {
                name: "Casa de Campo",
                temperature: {
                    min: 10.0,
                    max: 20.0,
                    bufferZone: 1.0,
                    alertCooldown: 900000,
                    readingInterval: 300000
                },
                shelves: [
                    { id: "A1", name: "Prateleira 1", maxWeight: 20000 },
                    { id: "A2", name: "Prateleira 2", maxWeight: 20000 }
                ]
            }
            // Adicionar outras casas conforme necessário
        };
    }

    static getHouseAlertThresholds(houseUuid) {
        return this.houseConfigs[houseUuid]?.temperature || {
            min: 2.0,
            max: 18.0,
            bufferZone: 1.0,
            alertCooldown: 900000,
            readingInterval: 300000
        };
    }

    static get loggingConfig() {
        return {
            level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
            temperatureLogInterval: 300000, // Log a cada 5 minutos
            format: {
                timestamp: true,
                includeHouseId: true,
                includeSensorId: true
            }
        };
    }

    static get environmentConfig() {
        return {
            isDevelopment: process.env.NODE_ENV !== 'production',
            isProduction: process.env.NODE_ENV === 'production',
            debugMode: process.env.DEBUG === 'true'
        };
    }
}

module.exports = CommonConfig;