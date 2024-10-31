const mqtt = require('mqtt');
const config = require('../config/config.js');
const client = mqtt.connect(config.brokerUrl);

// Função para gerar o tópico baseado no padrão, usando o house_uuid
function generateTopic(pattern, houseUuid) {
    return pattern.replace("{house_uuid}", houseUuid);
}

// Função para obter os limites de temperatura para uma casa específica
function getTemperatureThresholds(houseUuid) {
    return config.temperatureThresholds[houseUuid] || config.defaultAlertThresholds;
}

client.on('connect', () => {
    console.log('Subscritor de Alertas Conectado ao Broker');

    // Subscrever aos tópicos de temperatura para cada house_uuid
    config.houseUuids.forEach(houseUuid => {
        const temperatureTopic = generateTopic(config.temperatureTopicPattern, houseUuid);
        client.subscribe(temperatureTopic);
        console.log(`Subscrito ao tópico de temperatura: ${temperatureTopic}`);
    });
});

client.on('message', (topic, message) => {
    const parsedMessage = JSON.parse(message.toString());
    const temperatura = parseFloat(parsedMessage.temperature);

    // Extraí o house_uuid do tópico
    const match = topic.match(/house\/([^/]+)\/temperature/);
    const houseUuid = match ? match[1] : null;

    // Obter limites de temperatura
    const { min: minTemp, max: maxTemp } = getTemperatureThresholds(houseUuid);

    // Publica um alerta sempre que a temperatura estiver fora dos limites
    if (temperatura < minTemp || temperatura > maxTemp) {
        const alertTopic = generateTopic(config.alertTopicPattern, houseUuid);
        const alertMessage = {
            alert: "high_temperature",
            house_id: houseUuid,
            temperature: temperatura,
            timestamp: new Date().toISOString()
        };
        client.publish(alertTopic, JSON.stringify(alertMessage));
        console.log(`ALERTA: Temperatura fora dos limites (${temperatura} °C) publicado no tópico ${alertTopic}`);
    }
});
