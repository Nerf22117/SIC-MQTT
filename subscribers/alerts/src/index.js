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
        client.subscribe(temperatureTopic); // Subscreve para monitorizar temperaturas
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

    // Verificar se a temperatura está fora dos limites
    if (temperatura < minTemp) {
        publishTemperatureAlert("low_temperature", houseUuid, temperatura);
    } else if (temperatura > maxTemp) {
        publishTemperatureAlert("high_temperature", houseUuid, temperatura);
    }
});

// Função para publicar um alerta
function publishTemperatureAlert(type, houseUuid, temperatura) {
    const alertTopic = generateTopic(config.alertTopicPattern, houseUuid);
    const alertMessage = {
        alert: type,
        house_id: houseUuid,
        temperature: temperatura,
        timestamp: new Date().toISOString()
    };

    client.publish(alertTopic, JSON.stringify(alertMessage));
    console.log(`ALERTA (${type.toUpperCase()}): Temperatura fora dos limites (${temperatura} °C) publicado no tópico ${alertTopic}`);
}
