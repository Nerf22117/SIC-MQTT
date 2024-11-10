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
        unknownTags: [
            "RFID999",  // Tag não registrada para simular produto novo
            "RFID888"
        ]
    }
};