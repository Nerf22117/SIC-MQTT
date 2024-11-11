// subscribers\alerts\src\alertSubscriber.js

const mqtt = require('mqtt');
const Config = require('../config/alertConfig');
const AlertManager = require('./alertManager');

class AlertSubscriber {
    constructor() {
        this.client = null;
        this.alertManager = new AlertManager();
        this.subscriptions = new Map();
        this.connectionRetries = 0;
        this.maxRetries = 5;
        this.topicHandlers = this.initializeTopicHandlers();
        console.log('Topic patterns loaded:', Config.TOPIC_PATTERNS);
    }
    
    initializeTopicHandlers() {
        return {
            temperature: this.handleTemperatureMessage.bind(this),
            rfid: this.handleRFIDMessage.bind(this),
            weight: this.handleWeightMessage.bind(this)
        };
    }
    
    setupSubscriptions() {
        const houses = Object.keys(Config.houseConfigs);
        
        houses.forEach(houseUuid => {
          try {
            console.log(`\nConfigurando subscrições para Casa ${houseUuid}:`);
            
            // Base topics
            const topics = [
              { type: 'temperatura', topic: Config.formatTopic(Config.TOPIC_PATTERNS.TEMPERATURE, { house_uuid: houseUuid }) },
              { type: 'alertas', topic: Config.formatTopic(Config.TOPIC_PATTERNS.ALERTS, { house_uuid: houseUuid }) }
            ];
    
            // Shelf topics
            Config.houseConfigs[houseUuid].shelves.forEach(shelf => {
              topics.push(
                { 
                  type: 'peso', 
                  topic: Config.formatTopic(Config.TOPIC_PATTERNS.SHELF_WEIGHT, { house_uuid: houseUuid, shelf_id: shelf.id }) 
                },
                { 
                  type: 'produtos', 
                  topic: Config.formatTopic(Config.TOPIC_PATTERNS.SHELF_PRODUCTS, { house_uuid: houseUuid, shelf_id: shelf.id }) 
                }
              );
            });
    
            // Subscribe to all topics
            topics.forEach(({type, topic}) => this.subscribeTopic(topic));
            
            // Log summary
            console.log(`✓ ${topics.length} tópicos configurados com sucesso\n`);
          } catch (error) {
            console.error(`Erro ao configurar subscrições para casa ${houseUuid}:`, error);
          }
        });
      }
    
      subscribeTopic(topic) {
        if (!this.client) {
          console.error('Cliente MQTT não inicializado');
          return;
        }
    
        this.client.subscribe(topic, { qos: 1 }, error => {
          if (error) {
            console.error(`Erro ao subscrever ${topic}: ${error.message}`);
          }
        });
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
            
            this.client.on('error', error => {
                console.error(`Erro no sistema de alertas: ${error.message}`);
                this.handleConnectionError();
            });
            
        } catch (error) {
            console.error(`Erro ao conectar sistema de alertas: ${error.message}`);
            this.handleConnectionError();
            throw error;
        }
    }
    
    
    getTopicType(topic) {
        if (topic.includes('/temperature')) return 'temperature';
        if (topic.includes('/rfid')) return 'rfid';
        if (topic.includes('/weight')) return 'weight';
        return null;
    }
    
    async handleMessage(topic, message) {
        const subscription = this.subscriptions.get(topic);
        if (!subscription) return;
        
        const { type, houseUuid } = subscription;
        const handler = this.topicHandlers[type];
        
        if (!handler) {
            console.warn(`Tipo de tópico não suportado: ${type}`);
            return;
        }
        
        try {
            const data = JSON.parse(message.toString());
            const alert = await handler(houseUuid, data);
            
            if (alert) {
                await this.publishAlert(houseUuid, alert);
            }
        } catch (error) {
            console.error(`Erro ao processar mensagem do tópico ${topic}: ${error.message}`);
            if (error instanceof SyntaxError) {
                console.error('Mensagem inválida:', message.toString());
            }
            throw error;
        }
    }
    
    async handleTemperatureMessage(houseUuid, data) {
        return this.alertManager.processTemperatureAlert(
            houseUuid,
            parseFloat(data.temperature)
        );
    }
    
    async handleRFIDMessage(houseUuid, data) {
        this.alertManager.handleRFIDEvent(houseUuid, data);
        return null; // Alertas serão gerados após correlação com peso
    }
    
    async handleWeightMessage(houseUuid, data) {
        this.alertManager.handleWeightEvent(houseUuid, data);
        return null; // Alertas serão gerados após correlação com RFID
    }
    
    async publishAlert(houseUuid, alert) {
        const topic = Config.formatTopic(Config.topicPatterns.ALERTS, {
            house_uuid: houseUuid
        });
        
        const formattedAlert = this.alertManager.formatAlertMessage(alert);
        
        return new Promise((resolve, reject) => {
            this.client.publish(topic, JSON.stringify(formattedAlert), 
            { qos: 1 }, (err) => {
                if (err) {
                    console.error(`Erro ao publicar alerta: ${err.message}`);
                    reject(err);
                } else {
                    if (Config.environmentConfig.isDevelopment) {
                        console.log(`Alerta publicado no tópico ${topic}:`, 
                            formattedAlert);
                        } else {
                            console.log(
                                `Alerta de ${formattedAlert.type} publicado para casa ${houseUuid}`
                            );
                        }
                        resolve();
                    }
                });
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
    }
    
    // Inicializar o sistema de alertas
    if (require.main === module) {
        const alertSystem = new AlertSubscriber();
        alertSystem.connect().catch(console.error);
        
        process.on('SIGINT', () => {
            console.log('Encerrando sistema de alertas...');
            alertSystem.cleanup();
            process.exit(0);
        });
    }
    
    module.exports = AlertSubscriber;