const mqtt = require('mqtt');
const config = require('../config/config.js');
const client = mqtt.connect(config.brokerUrl);

let alertActive = false; // Controla o estado de alerta

// Função para gerar o tópico baseado no padrão, usando o house_uuid
function generateTopic(pattern, houseUuid) {
    return pattern.replace("{house_uuid}", houseUuid);
}

client.on('connect', () => {
    console.log('Subscritor Conectado ao Broker');

    // Subscrever aos tópicos de temperatura e alertas para cada house_uuid
    config.houseUuids.forEach(houseUuid => {
        const temperatureTopic = generateTopic(config.temperatureTopicPattern, houseUuid);
        const alertTopic = generateTopic(config.alertTopicPattern, houseUuid);

        // Subscreve permanentemente aos tópicos de temperatura e alertas
        client.subscribe(temperatureTopic);
        console.log(`Subscrito ao tópico de temperatura: ${temperatureTopic}`);
        
        client.subscribe(alertTopic);
        console.log(`Subscrito ao tópico de alertas: ${alertTopic}`);
    });
});

client.on('message', (topic, message) => {
    const parsedMessage = JSON.parse(message.toString());

    if (topic.includes('/alerts')) {
        console.log("A receber alerta!!!");

        // Processa mensagem de alerta e ativa `alertActive` se ainda não estiver ativo
        if (!alertActive) {
            alertActive = true;
            console.log(`ALERTA RECEBIDO - Tópico: ${topic} - Detalhes:`, parsedMessage);
        }
    } else if (topic.includes('/temperature')) {
        const temperatura = parseFloat(parsedMessage.temperature);
        console.log(`A receber temperatura!!!!`);

        // Verifica se a temperatura está dentro dos limites e se há um alerta ativo
        const { min, max } = config.temperatureThresholds[config.houseUuids[0]] || config.defaultAlertThresholds;

        if (!alertActive) {
            // Caso normal: processa temperatura quando `alertActive` está false
            console.log(`Temperatura normal recebida: ${temperatura} °C - Tópico: ${topic}`);
        } else if (temperatura >= min && temperatura <= max) {
            // Caso de retorno ao normal: desativa alerta
            alertActive = false;
            console.log(`Temperatura voltou ao normal: ${temperatura} °C - Estado de alerta desativado.`);
        }
    }
});
