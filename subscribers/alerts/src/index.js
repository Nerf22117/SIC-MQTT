// subscribers/alerts/src/index.js
const mqtt = require('mqtt');
const config = require('../config/config.js');
const client = mqtt.connect(config.brokerUrl);

// Função para gerar o tópico baseado no padrão
function generateTopic(pattern, houseUuid) {
    return pattern.replace("{house_uuid}", houseUuid);
}

// Função para obter os limites de temperatura para uma casa específica
function getTemperatureThresholds(houseUuid) {
    return config.temperatureThresholds[houseUuid] || config.defaultAlertThresholds;
}

// Função para determinar o tipo de alerta baseado na temperatura
function getAlertType(temperature, thresholds) {
    if (temperature > thresholds.max) return "high_temperature";
    if (temperature < thresholds.min) return "low_temperature";
    return null;
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

    // Extrair o house_uuid do tópico
    const match = topic.match(/house\/([^/]+)\/temperature/);
    const houseUuid = match ? match[1] : null;

    if (!houseUuid) return;

    // Obter limites de temperatura
    const thresholds = getTemperatureThresholds(houseUuid);
    const alertType = getAlertType(temperatura, thresholds);

    if (alertType) {
        const alertTopic = generateTopic(config.alertTopicPattern, houseUuid);
        const alertMessage = {
            alert: alertType,
            house_id: houseUuid,
            temperature: temperatura,
            threshold: alertType === "high_temperature" ? thresholds.max : thresholds.min,
            timestamp: new Date().toISOString()
        };
        client.publish(alertTopic, JSON.stringify(alertMessage));
        console.log(`ALERTA: ${alertType} (${temperatura} °C) publicado no tópico ${alertTopic}`);
    }
});