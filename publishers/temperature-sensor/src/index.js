const mqtt = require('mqtt');
const config = require('../config/config.js');
const client = mqtt.connect(config.brokerUrl);

// Função para gerar o tópico dinâmico baseado no houseUuid
function generateTemperatureTopic(houseUuid) {
    return config.temperatureTopicPattern.replace("{house_uuid}", houseUuid);
}

client.on('connect', () => {
    console.log(`Sensor de Temperatura Conectado ao Broker`);

    // Publicação de temperatura para cada houseUuid
    config.houseUuids.forEach(houseUuid => {
        const temperatureTopic = generateTemperatureTopic(houseUuid);
        console.log(`Sensor de Temperatura publicará no tópico: ${temperatureTopic}`);
        
        setInterval(() => {
            const temperatura = (Math.random() * (config.maxTemp - config.minTemp) + config.minTemp).toFixed(2);
            client.publish(temperatureTopic, JSON.stringify({ temperature: temperatura }));
            console.log(`Publicado Temperatura: ${temperatura} °C no tópico ${temperatureTopic}`);
        }, config.publishInterval);
    });
});
