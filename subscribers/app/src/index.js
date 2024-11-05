// subscribers/app/src/index.js
const mqtt = require('mqtt');
const config = require('../config/config.js');
const client = mqtt.connect(config.brokerUrl);

function generateTopic(pattern, houseUuid) {
    return pattern.replace("{house_uuid}", houseUuid);
}

// Mapa para controlar o estado de alerta de cada casa
const houseAlertStates = {};

client.on('connect', () => {
    console.log('Subscritor App Conectado ao Broker');

    // Subscrever aos tópicos de temperatura e alertas para cada house_uuid
    config.houseUuids.forEach(houseUuid => {
        const temperatureTopic = generateTopic(config.temperatureTopicPattern, houseUuid);
        const alertTopic = generateTopic(config.alertTopicPattern, houseUuid);
        
        client.subscribe(temperatureTopic);
        client.subscribe(alertTopic);
        
        // Inicializar estado de alerta para cada casa
        houseAlertStates[houseUuid] = false;

        console.log(`Subscrito aos tópicos - Temperatura: ${temperatureTopic}, Alertas: ${alertTopic}`);
    });
});

client.on('message', (topic, message) => {
    const parsedMessage = JSON.parse(message.toString());
    const match = topic.match(/house\/([^/]+)\/(temperature|alerts)/);
    
    if (!match) return;
    
    const [, houseUuid, messageType] = match;

    if (messageType === 'alerts') {
        // Ativar estado de alerta para esta casa
        houseAlertStates[houseUuid] = true;
        const alertType = parsedMessage.alert === 'high_temperature' ? 'alta' : 'baixa';
        console.log(`ALERTA: Temperatura ${alertType} detectada na casa ${houseUuid}`);
        console.log(`Temperatura: ${parsedMessage.temperature}°C (Threshold: ${parsedMessage.threshold}°C)`);
        console.log(`Timestamp: ${parsedMessage.timestamp}`);
    } else if (messageType === 'temperature') {
        const temperatura = parseFloat(parsedMessage.temperature);
        const thresholds = config.temperatureThresholds[houseUuid] || config.defaultAlertThresholds;

        // Verificar se a temperatura está dentro dos limites
        const isTemperatureNormal = temperatura >= thresholds.min && temperatura <= thresholds.max;

        if (isTemperatureNormal) {
            // Se a temperatura voltou ao normal, desativar estado de alerta
            if (houseAlertStates[houseUuid]) {
                console.log(`Temperatura normalizada para casa ${houseUuid}`);
                houseAlertStates[houseUuid] = false;
            }
            // Só exibir temperatura normal se não houver alerta ativo
            console.log(`Temperatura normal: ${temperatura}°C (Casa: ${houseUuid})`);
        }
        // Se temperatura anormal, não exibir nada pois será tratado pelo tópico de alertas
    }
});