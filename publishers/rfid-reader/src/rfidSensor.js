// publishers/rfid-reader/src/rfidSensor.js

const mqtt = require('mqtt');
const Config = require('../config/rfidSensorConfig');

/**
 * Implementação do sensor RFID
 * Responsável por simular e publicar leituras de etiquetas RFID
 */
class RFIDSensor {
    /**
     * Inicializa o sensor RFID
     * @param {string} houseUuid - Identificador único da casa
     * @param {string} shelfId - Identificador da prateleira
     */
    constructor(houseUuid, shelfId) {
        this.houseUuid = houseUuid;
        this.shelfId = shelfId;
        this.client = null;
        this.publishInterval = null;
        this.lastReadings = new Map();
        this.consecutiveErrors = 0;
        
        // Carregar configurações
        this.sensorConfig = Config.sensorConfig;
        this.rfidConfig = Config.getShelfRFIDConfig(shelfId);
        
        // Sequência de teste
        this.testTags = null;
        this.testIndex = 0;

        // Tópico MQTT
        this.topic = Config.formatTopic(Config.topicPatterns.SHELF_PRODUCTS, {
            house_uuid: houseUuid,
            shelf_id: shelfId
        });
    }

    /**
     * Estabelece conexão com o broker MQTT
     * @throws {Error} Se ocorrer erro na conexão
     */
    async connect() {
        try {
            this.client = mqtt.connect(Config.brokerConfig.url, {
                ...Config.brokerConfig.options,
                clientId: `rfid_${this.rfidConfig.readerId}_${Date.now()}`
            });

            this.client.on('connect', () => {
                console.log(`Sensor RFID ${this.rfidConfig.readerId} conectado`);
                this.startPublishing();
            });

            this.client.on('error', error => {
                console.error(`Erro no sensor RFID ${this.rfidConfig.readerId}:`, error);
                this.handleError(error);
            });

            this.client.on('close', () => {
                console.log(`Sensor RFID ${this.rfidConfig.readerId} desconectado`);
            });

        } catch (error) {
            console.error(`Erro ao conectar sensor RFID ${this.rfidConfig.readerId}:`, error);
            throw error;
        }
    }

    /**
     * Define uma sequência de tags para teste
     * @param {Array} sequence - Sequência de eventos RFID
     */
    setTestSequence(sequence) {
        this.testTags = sequence;
        this.testIndex = 0;
    }

    /**
     * Simula uma leitura RFID
     * @returns {Object|null} Evento RFID ou null
     * @private
     */
    simulateRFIDReading() {
        // Usar sequência de teste se disponível
        if (this.testTags && this.testTags.length > 0) {
            const reading = this.testTags[this.testIndex];
            this.testIndex = (this.testIndex + 1) % this.testTags.length;
            return reading;
        }

        const { simulationConfig: config } = this.sensorConfig;

        // Simular probabilidade de leitura
        if (Math.random() > config.readProbability) {
            return null;
        }

        // Simular erro de leitura
        if (Math.random() < config.readErrorRate) {
            this.handleError(new Error('Erro simulado de leitura'));
            return null;
        }

        // Determinar ação (adição/remoção)
        const isAdd = Math.random() < config.movementPatterns.addProbability;

        // Gerar tag (90% registada, 10% não registada)
        let rfidTag = Math.random() > 0.1 
            ? this.getRandomRegisteredTag() 
            : this.generateUnregisteredTag();

        return {
            type: 'rfid_event',
            shelf_id: this.shelfId,
            reader_id: this.rfidConfig.readerId,
            rfid_tag: rfidTag,
            action: isAdd ? 'add' : 'remove',
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Obtém uma tag registada aleatória
     * @returns {string} Tag RFID registada
     * @private
     */
    getRandomRegisteredTag() {
        const validTags = this.rfidConfig.validProducts;
        return validTags[Math.floor(Math.random() * validTags.length)];
    }

    /**
     * Gera uma tag RFID não registada
     * @returns {string} Tag RFID gerada
     * @private
     */
    generateUnregisteredTag() {
        return Array.from({ length: 10 }, () => 
            Math.floor(Math.random() * 16).toString(16)
        ).join('').toUpperCase();
    }

    /**
     * Inicia a publicação de leituras RFID
     * @private
     */
    startPublishing() {
        if (this.publishInterval) return;

        let lastPublishedReading = null;

        this.publishInterval = setInterval(() => {
            const reading = this.simulateRFIDReading();
            if (!reading) return;

            // Validar tag RFID
            const validation = Config.validationRules.rfid.validateTag(reading.rfid_tag);
            if (!validation.isValid) {
                console.warn(`Tag RFID inválida: ${reading.rfid_tag}`);
                return;
            }

            // Evitar duplicados em sequência
            const readingKey = `${reading.rfid_tag}_${reading.action}`;
            if (lastPublishedReading === readingKey) {
                return;
            }

            this.publishReading(reading);
            lastPublishedReading = readingKey;

        }, this.sensorConfig.publishInterval);
    }

    /**
     * Publica uma leitura RFID
     * @param {Object} reading - Leitura a publicar
     * @private
     */
    publishReading(reading) {
        if (!this.client || !this.topic) {
            console.error('Cliente MQTT não inicializado ou tópico inválido');
            return;
        }

        this.client.publish(
            this.topic, 
            JSON.stringify(reading), 
            { qos: 1 }, 
            this.handlePublishCallback.bind(this)
        );
    }

    /**
     * Processa callback de publicação
     * @param {Error} error - Erro se houver
     * @private
     */
    handlePublishCallback(error) {
        if (error) {
            console.error(`Erro ao publicar leitura RFID:`, error);
            this.handleError(error);
        } else if (Config.environmentConfig.isDevelopment) {
            this.consecutiveErrors = 0;
            console.log(`Leitura RFID publicada com sucesso`);
        }
    }

    /**
     * Processa erros do sensor
     * @param {Error} error - Erro ocorrido
     * @private
     */
    handleError(error) {
        this.consecutiveErrors++;
        
        if (this.consecutiveErrors >= this.rfidConfig.errorHandling.maxConsecutiveErrors) {
            console.error(`Número máximo de erros consecutivos atingido. Reiniciando sensor...`);
            this.cleanup();
            
            // Tentar reconectar após o tempo de recuperação
            setTimeout(() => {
                this.connect().catch(console.error);
            }, this.rfidConfig.errorHandling.recoveryTime);
        }
    }

    /**
     * Limpa recursos e encerra conexões
     */
    cleanup() {
        if (this.publishInterval) {
            clearInterval(this.publishInterval);
            this.publishInterval = null;
        }

        if (this.client) {
            try {
                this.client.end(true);
            } catch (error) {
                console.error(`Erro ao limpar recursos RFID:`, error);
            }
        }
    }
}

module.exports = RFIDSensor;