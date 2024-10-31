const mqtt = require('mqtt');
const config = require('../config/config.js');
const client = mqtt.connect(config.brokerUrl);

// Gerar o tópico dinâmico baseado no houseUuid
const temperatureTopic = config.temperatureTopicPattern.replace("{house_uuid}", config.houseUuids[0]);

client.on('connect', () => {
    console.log(`Sensor de Temperatura Conectado ao Broker - Tópico: ${temperatureTopic}`);

    // Publicação de temperatura constante, independentemente de alertas ativos
    setInterval(() => {
        const temperatura = (Math.random() * (config.maxTemp - config.minTemp) + config.minTemp).toFixed(2);
        client.publish(temperatureTopic, JSON.stringify({ temperature: temperatura }));
        console.log(`Publicado Temperatura: ${temperatura} °C no tópico ${temperatureTopic}`);
    }, config.publishInterval);
});
