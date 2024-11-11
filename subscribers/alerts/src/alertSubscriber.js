// subscribers/alerts/src/alertSubscriber.js

const mqtt = require('mqtt');
const Config = require('../config/alertConfig');
const AlertManager = require('./alertManager');

/**
 * Subscritor de Alertas do Sistema StockWise
 * Responsável por monitorizar eventos dos sensores e gerar alertas conforme necessário
 */
class AlertSubscriber {
    /**
     * Inicializa o subscritor de alertas
     */
    constructor() {
        // Componentes principais
        this.client = null;
        this.alertManager = new AlertManager();
        
        // Estado do sistema
        this.subscriptions = new Map();
        this.connectionRetries = 0;
        this.maxRetries = 5;
        
        // Inicializar gestores de tópicos
        this.topicHandlers = this.initializeTopicHandlers();
        
        if (Config.environmentConfig.isDevelopment) {
            console.log('Padrões de tópicos carregados:', Config.TOPIC_PATTERNS);
        }
    }
    
    /**
     * Inicializa os gestores de tópicos por tipo de evento
     * @returns {Object} Mapa de gestores de tópicos
     * @private
     */
    initializeTopicHandlers() {
        return {
            temperature: this.handleTemperatureMessage.bind(this),
            rfid: this.handleRFIDMessage.bind(this),
            weight: this.handleWeightMessage.bind(this)
        };
    }
    
    /**
     * Configura as subscrições para todas as casas registadas
     * @throws {Error} Se ocorrer erro na configuração
     */
    setupSubscriptions() {
        const houses = Object.keys(Config.houseConfigs);
        
        houses.forEach(houseUuid => {
            try {
                console.log(`\nA configurar subscrições para Casa ${houseUuid}:`);
                
                // Tópicos base
                const topics = [
                    { 
                        type: 'temperatura', 
                        topic: Config.formatTopic(Config.TOPIC_PATTERNS.TEMPERATURE, { house_uuid: houseUuid }) 
                    },
                    { 
                        type: 'alertas', 
                        topic: Config.formatTopic(Config.TOPIC_PATTERNS.ALERTS, { house_uuid: houseUuid }) 
                    }
                ];
        
                // Tópicos das prateleiras
                Config.houseConfigs[houseUuid].shelves.forEach(shelf => {
                    topics.push(
                        { 
                            type: 'peso', 
                            topic: Config.formatTopic(Config.TOPIC_PATTERNS.SHELF_WEIGHT, 
                                { house_uuid: houseUuid, shelf_id: shelf.id }) 
                        },
                        { 
                            type: 'produtos', 
                            topic: Config.formatTopic(Config.TOPIC_PATTERNS.SHELF_PRODUCTS, 
                                { house_uuid: houseUuid, shelf_id: shelf.id }) 
                        }
                    );
                });
        
                // Subscrever todos os tópicos
                topics.forEach(({type, topic}) => this.subscribeTopic(topic));
                
                console.log(`✓ ${topics.length} tópicos configurados com sucesso\n`);
            } catch (error) {
                console.error(`Erro ao configurar subscrições para casa ${houseUuid}:`, error);
                throw error;
            }
        });
    }
    
    /**
     * Subscreve um tópico específico
     * @param {string} topic - Tópico a subscrever
     * @throws {Error} Se ocorrer erro na subscrição
     */
    subscribeTopic(topic) {
        if (!this.client) {
            throw new Error('Cliente MQTT não inicializado');
        }
    
        this.client.subscribe(topic, { qos: 1 }, error => {
            if (error) {
                console.error(`Erro ao subscrever ${topic}: ${error.message}`);
                throw error;
            }
            
            if (Config.environmentConfig.isDevelopment) {
                console.log(`Subscrito ao tópico: ${topic}`);
            }
        });
    }
    
    /**
     * Estabelece conexão com o broker MQTT
     * @throws {Error} Se ocorrer erro na conexão
     */
    async connect() {
        try {
            // Configurar cliente com Last Will
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
            
            // Configurar eventos do cliente
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
    
    /**
     * Determina o tipo de tópico
     * @param {string} topic - Tópico a analisar
     * @returns {string|null} Tipo de tópico ou null
     * @private
     */
    getTopicType(topic) {
        if (topic.includes('/temperature')) return 'temperature';
        if (topic.includes('/rfid')) return 'rfid';
        if (topic.includes('/weight')) return 'weight';
        return null;
    }
    
    /**
     * Processa mensagens recebidas
     * @param {string} topic - Tópico da mensagem
     * @param {Buffer} message - Conteúdo da mensagem
     * @throws {Error} Se ocorrer erro no processamento
     */
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
    
    /**
     * Processa mensagens de temperatura
     * @param {string} houseUuid - Identificador da casa
     * @param {Object} data - Dados de temperatura
     * @returns {Promise<Object>} Alerta gerado
     * @private
     */
    async handleTemperatureMessage(houseUuid, data) {
        return this.alertManager.processTemperatureAlert(
            houseUuid,
            parseFloat(data.temperature)
        );
    }
    
    /**
     * Processa mensagens RFID
     * @param {string} houseUuid - Identificador da casa
     * @param {Object} data - Dados RFID
     * @returns {Promise<null>} Sem alerta imediato
     * @private
     */
    async handleRFIDMessage(houseUuid, data) {
        this.alertManager.handleRFIDEvent(houseUuid, data);
        return null; // Alertas serão gerados após correlação com peso
    }
    
    /**
     * Processa mensagens de peso
     * @param {string} houseUuid - Identificador da casa
     * @param {Object} data - Dados de peso
     * @returns {Promise<null>} Sem alerta imediato
     * @private
     */
    async handleWeightMessage(houseUuid, data) {
        this.alertManager.handleWeightEvent(houseUuid, data);
        return null; // Alertas serão gerados após correlação com RFID
    }
    
    /**
     * Publica um alerta no broker
     * @param {string} houseUuid - Identificador da casa
     * @param {Object} alert - Alerta a publicar
     * @returns {Promise<void>}
     * @throws {Error} Se ocorrer erro na publicação
     */
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
        
    /**
     * Limpa recursos e encerra conexões
     */
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
    
    /**
     * Gere erros de conexão
     * @private
     */
    handleConnectionError() {
        this.connectionRetries++;
        if (this.connectionRetries >= this.maxRetries) {
            console.error('Número máximo de tentativas de reconexão atingido.');
            this.cleanup();
            process.exit(1);
        }
    }
    
    /**
     * Anuncia estado do sistema
     * @param {string} status - Estado a anunciar
     * @private
     */
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
    
    // Gerir encerramento gracioso
    process.on('SIGINT', () => {
        console.log('A encerrar sistema de alertas...');
        alertSystem.cleanup();
        process.exit(0);
    });
}

module.exports = AlertSubscriber;