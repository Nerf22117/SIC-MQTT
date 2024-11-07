// publishers/rfid-reader/config/config.js

const commonConfig = require('../../../config/commonConfig');

module.exports = {
    ...commonConfig,
    
    // Configurações do leitor
    reader: {
        readInterval: 500,    // Intervalo entre leituras em ms
        timeout: 1000         // Tempo para considerar tag removida
    },
    
    // Simulação
    simulation: {
        enabled: true,
        knownTags: {
            "RFID001": {
                id: "PROD001",
                name: "Arroz",
                weight: 1000
            },
            "RFID002": {
                id: "PROD002",
                name: "Massa",
                weight: 500
            }
        },
        unknownTags: [
            "RFID999",  // Tag não registrada para simular produto novo
            "RFID888"
        ]
    }
};