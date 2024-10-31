const commonConfig = require('../../../config/commonConfig');

module.exports = {
    ...commonConfig,
    publishInterval: 5000, // Intervalo de publicação em milissegundos
    minTemp: 5.0, // Temperatura mínima para a simulação
    maxTemp: 25.0 // Temperatura máxima para a simulação
};
