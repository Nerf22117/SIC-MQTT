// subscribers/app/config/config.js

const commonConfig = require('../../../config/commonConfig');

module.exports = {
    ...commonConfig,
    
    // Configurações de exibição
    display: {
        updateInterval: 1000,  // Intervalo de atualização da interface
        maxHistoryItems: 50,   // Número máximo de itens no histórico
        groupTimeWindow: 5000  // Janela de tempo para agrupar eventos similares (ms)
    },
    
    // Filtros de exibição
    filters: {
        minWeightChange: 10,   // Mudança mínima para exibir (g)
        showSystemMessages: true,
        showDebugInfo: false
    }
};