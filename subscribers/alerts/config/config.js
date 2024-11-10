// subscribers/alerts/config/config.js

const commonConfig = require('../../../config/commonConfig');

module.exports = {
    ...commonConfig,
    
    // Configurações de alertas por tipo de produto
    productAlerts: {
        // Configuração padrão para produtos não especificados
        defaultThresholds: {
            minStockPercentage: 25,
            criticalStockPercentage: 10
        }
    },
    
    // Configurações de severidade dos alertas
    alertSeverity: {
        critical_stock: 'high',
        low_stock: 'medium',
        unregistered_product: 'low',
        temperature: 'high'
    },
    
    // Tempo mínimo entre alertas do mesmo tipo (em ms)
    alertCooldown: {
        stock: 300000,        // 5 minutos
        temperature: 60000,   // 1 minuto
        general: 30000        // 30 segundos
    }
};