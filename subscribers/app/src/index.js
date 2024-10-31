const mqtt = require('mqtt');
const config = require('../config/config.js');
const client = mqtt.connect(config.brokerUrl);

// Função para gerar o tópico baseado no padrão, usando o house_uuid
function generateTopic(pattern, houseUuid) {
    return pattern.replace("{house_uuid}", houseUuid);
}

let alertActive = false;

client.on('connect', () => {
    console.log('Subscritor Conectado ao Broker');

    // Subscrever ao tópico de temperatura e alertas para cada house_uuid
    config.houseUuids.forEach(houseUuid => {
        const temperatureTopic = generateTopic(config.temperatureTopicPattern, houseUuid);
        client.subscribe(temperatureTopic);
        console.log(`Subscrito ao tópico de temperatura: ${temperatureTopic}`);

        const alertTopic = generateTopic(config.alertTopicPattern, houseUuid);
        client.subscribe(alertTopic);
        console.log(`Subscrito ao tópico de alertas: ${alertTopic}`);
    });
});

client.on('message', (topic, message) => {
    const parsedMessage = JSON.parse(message.toString());

    if (topic.includes('/alerts')) {
        // Processa mensagem de alerta e define `alertActive` como verdadeiro
        alertActive = true;
        console.log(`ALERTA RECEBIDO - Tópico: ${topic} - Detalhes:`, parsedMessage);
    } else if (topic.includes('/temperature')) {
        const temperatura = parseFloat(parsedMessage.temperature);

        // Ignorar temperaturas fora do limite se um alerta estiver ativo
        if (!alertActive || (temperatura >= config.defaultAlertThresholds.min && temperatura <= config.defaultAlertThresholds.max)) {
            console.log(`Recebido - Tópico: ${topic} - Temperatura: ${temperatura} °C`);
            alertActive = false;
        }
    }
});