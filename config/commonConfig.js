// config/commonConfig.js

module.exports = {
    brokerUrl: "mqtt://localhost:1883",
    houseUuids: ["12345", "67890"], // Exemplo com múltiplas casas
    
    // Padrões de tópicos, usando placeholders para personalização
    temperatureTopicPattern: "house/{house_uuid}/temperature",
    alertTopicPattern: "house/{house_uuid}/alerts",
    weightTopicPattern: "house/{house_uuid}/pantry/{shelf_id}/weight",
    rfidTopicPattern: "house/{house_uuid}/pantry/{shelf_id}/rfid",
    actionTopicPattern: "house/{house_uuid}/pantry/{shelf_id}/action",
    
    // Configurações de temperatura específicas por casa
    temperatureThresholds: {
        "12345": { min: 2.0, max: 18.0 },
        "67890": { min: 4.0, max: 20.0 }
    },
    // Limite padrão para alertas de temperatura, caso não haja configurações específicas para a casa
    defaultAlertThresholds: { min: 0.0, max: 22.0 },
    
    // Configurações dos sensores de peso aplicáveis a todas as prateleiras
    weightThresholds: {
        minWeightChange: 50,     // Mudança mínima detectável em gramas
        maxShelfWeight: 30000,   // Peso máximo por prateleira em gramas (30kg)
        stabilityTime: 2000,     // Tempo para considerar peso estável em ms
        noiseThreshold: 10       // Variação máxima considerada ruído (em gramas)
    },
    
    // Organização de prateleiras por casa
    shelves: {
        "12345": [  // Configuração de prateleiras para a casa "12345"
            {
                id: "A1",
                name: "Prateleira 1",
                maxWeight: 30000  // 30kg
            },
            {
                id: "A2",
                name: "Prateleira 2",
                maxWeight: 30000
            }
        ],
        "67890": [  // Configuração de prateleiras para a casa "67890"
            {
                id: "B1",
                name: "Prateleira 1",
                maxWeight: 20000  // 20kg, por exemplo
            },
            {
                id: "B2",
                name: "Prateleira 2",
                maxWeight: 25000
            }
        ]
    }

    // Organização dos produtos por prateleira e respetivo stock
    stockItems: {
        "arroz": {
            id: "PROD001",
            name: "Arroz",
            unitWeight: 1000,  // 1kg por unidade
            minStock: 2000,    // Alerta abaixo de 2kg
            rfidTag: "TAG001"  // Tag RFID associada
        },
    }
};
