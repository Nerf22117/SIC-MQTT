// subscribers/alerts/src/index.js

require('dotenv').config();
const mqtt = require('mqtt');
const Config = require('../config/config');
const AlertManager = require('./alertManager');

class AlertSubscriber {
    constructor() {
        this.client = null;
        this.alertManager = new AlertManager();
        this.subscriptions = new Map();
        this.connectionRetries = 0;
        this.maxRetries = 5;
    }

    async connect() {
        try {
            this.client = mqtt.connect(Config.brokerConfig.url, {
                ...Config.brokerConfig.options,
                will: {
                    topic: 'system/alerts/status',
                    payload: JSON.stringify({
                        status: 'disconnected',
                        timestamp: new Date().toISOString()
                    }),
                    qos: 1,
                    retain: true
                }
            });

            this.client.on('connect', () => {
                console.log('Sistema de Alertas conectado ao broker');
                this.connectionRetries = 0;
                this.announceStatus('connected');
                this.setupSubscriptions();
            });

            this.client.on('message', (topic, message) => {
                this.handleMessage(topic, message).catch(error => {
                    console.error(`Erro ao processar mensagem: ${error.message}`);
                });
            });

            this.client.on('error', (error) => {
                console.error(`Erro no sistema de alertas: ${error.message}`);
                this.handleConnectionError();
            });

            this.client.on('close', () => {
                console.log('Conexão fechada. Tentando reconectar...');
                this.handleConnectionError();
            });

        } catch (error) {
            console.error(`Erro ao conectar sistema de alertas: ${error.message}`);
            this.handleConnectionError();
            throw error;
        }
    }

    handleConnectionError() {
        this.connectionRetries++;
        if (this.connectionRetries >= this.maxRetries) {
            console.error('Número máximo de tentativas de reconexão atingido.');
            this.cleanup();
            process.exit(1);
        }
    }

    announceStatus(status) {
        if (!this.client) return;

        this.client.publish(
            'system/alerts/status',
            JSON.stringify({
                status,
                timestamp: new Date().toISOString()
            }),
            { qos: 1, retain: true }
        );
    }

    setupSubscriptions() {
        const houses = Object.keys(Config.houseConfigs);
        
        houses.forEach(houseUuid => {
            const temperatureTopic = Config.formatTopic(Config.topicPatterns.TEMPERATURE, {
                house_uuid: houseUuid
            });

            this.client.subscribe(temperatureTopic, { qos: 1 }, (err) => {
                if (err) {
                    console.error(`Erro ao subscrever tópico ${temperatureTopic}: ${err.message}`);
                } else {
                    console.log(`Subscrito ao tópico: ${temperatureTopic}`);
                    this.subscriptions.set(temperatureTopic, {
                        type: 'temperature',
                        houseUuid
                    });
                }
            });
        });
    }

    async handleMessage(topic, message) {
        const subscription = this.subscriptions.get(topic);
        if (!subscription) return;

        const { type, houseUuid } = subscription;
        
        try {
            const data = JSON.parse(message.toString());

            let alert = null;
            if (type === 'temperature') {
                alert = this.alertManager.processTemperatureAlert(
                    houseUuid, 
                    parseFloat(data.temperature)
                );
            }

            if (alert) {
                await this.publishAlert(houseUuid, alert);
            }

        } catch (error) {
            console.error(`Erro ao processar mensagem do tópico ${topic}: ${error.message}`);
            // Se for erro de parse, registrar a mensagem problemática
            if (error instanceof SyntaxError) {
                console.error('Mensagem inválida:', message.toString());
            }
        }
    }

    async publishAlert(houseUuid, alert) {
        const alertTopic = Config.formatTopic(Config.topicPatterns.ALERTS, {
            house_uuid: houseUuid
        });

        const formattedAlert = this.alertManager.formatAlertMessage(alert);

        return new Promise((resolve, reject) => {
            this.client.publish(
                alertTopic,
                JSON.stringify(formattedAlert),
                { qos: 1 },
                (err) => {
                    if (err) {
                        console.error(`Erro ao publicar alerta: ${err.message}`);
                        reject(err);
                    } else {
                        if (Config.environmentConfig.isDevelopment) {
                            console.log(`Alerta publicado no tópico ${alertTopic}:`, formattedAlert);
                        } else {
                            console.log(`Alerta de ${formattedAlert.type} publicado para casa ${houseUuid}`);
                        }
                        resolve();
                    }
                }
            );
        });
    }

    cleanup() {
        this.announceStatus('disconnecting');
        
        if (this.client) {
            try {
                this.client.end(true);
            } catch (error) {
                console.error(`Erro ao limpar recursos: ${error.message}`);
            }
        }
    }
}

// Inicializar o sistema de alertas
if (require.main === module) {
    const alertSystem = new AlertSubscriber();
    alertSystem.connect().catch(console.error);

    // Gestão de encerramento gracioso
    process.on('SIGINT', () => {
        console.log('Encerrando sistema de alertas...');
        alertSystem.cleanup();
        process.exit(0);
    });
}

module.exports = AlertSubscriber;