// publishers\temperature-sensor\config\config.js

const commonConfig = require('../../../config/commonConfig');

module.exports = {
    ...commonConfig,
    publishInterval: 5000, // Intervalo de publicação em milissegundos
    minTemp: 5.0, // Temperatura mínima para a simulação
    maxTemp: 25.0, // Temperatura máxima para a simulação
        // Limite padrão para alertas de temperatura, caso não haja configurações específicas para a casa
        defaultAlertThresholds: { min: 0.0, max: 22.0 },
};
