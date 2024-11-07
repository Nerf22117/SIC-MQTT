// publishers/weight-sensor/config/config.js

const commonConfig = require('../../../config/commonConfig');

module.exports = {
    ...commonConfig,
    
    // Configurações específicas do sensor
    publishInterval: 1000,          // Intervalo entre publicações em ms
    readingInterval: 100,           // Intervalo entre leituras em ms
    bufferSize: 5,                  // Número de leituras para média móvel
    
    // Simulação
    simulation: {
        enabled: true,
        scenarios: [
            {
                description: "Variação grande - Adição de produto",
                weightChange: 1000,   // +1kg
                duration: 2000,       // 2 segundos
                delay: 5000          // 5 segundos após início
            },
            {
                description: "Variação média - Remoção parcial",
                weightChange: -400,   // -400g
                duration: 1500,
                delay: 10000
            },
            {
                description: "Variações pequenas - Ajustes",
                weightChange: 50,     // ±50g
                duration: 1000,
                delay: 15000
            }
        ],
        
        // Configurações de ruído
        noise: {
            enabled: true,
            maxVariation: 5  // ±5g de ruído aleatório
        }
    }
};