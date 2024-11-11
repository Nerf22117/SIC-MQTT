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
        
        // Carregar configurações
        this.sensorConfig = Config.sensorConfig;
        this.rfidConfig = Config.getShelfRFIDConfig(shelfId);
        this.testTags = null;
        this.testIndex = 0;
    }

    /**
     * Estabelece conexão com o broker MQTT
     * @throws {Error} Se ocorrer erro na conexão
     */
    async connect() {
        try {
            this.client = mqtt.connect(Config.brokerConfig.url, Config.brokerConfig.options);

            this.client.on('connect', () => {
                console.log(`Sensor RFID conectado para prateleira ${this.shelfId}`);
                this.startPublishing();
            });

            this.client.on('error', error => {
                console.error(`Erro no sensor RFID: ${error.message}`);
                this.cleanup();
            });
        } catch (error) {
            console.error(`Erro ao conectar sensor RFID: ${error.message}`);
            throw error;
        }
    }

    /**
     * Define uma sequência de tags para teste
     * @param {Object[]} sequence - Sequência de eventos RFID
     */
    setTestSequence(sequence) {
        this.testTags = sequence;
        this.testIndex = 0;
    }

    /**
     * Simula uma leitura RFID
     * @returns {Object|null} Evento RFID ou null
     */
    simulateRFIDReading() {
        // Usar sequência de teste se disponível
        if (this.testTags) {
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
            return {
                error: true,
                code: 'read_error',
                message: 'Erro na leitura do RFID'
            };
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
     */
    getRandomRegisteredTag() {
        const validTags = this.rfidConfig.validProducts;
        return validTags[Math.floor(Math.random() * validTags.length)];
    }

    /**
     * Gera uma tag RFID não registada
     * @returns {string} Tag RFID gerada
     */
    generateUnregisteredTag() {
        return Array.from({ length: 10 }, () => 
            Math.floor(Math.random() * 16).toString(16)
        ).join('').toUpperCase();
    }

    /**
     * Inicia a publicação de leituras RFID
     */
    startPublishing() {
        if (this.publishInterval) return;

        const topic = Config.formatTopic(Config.TOPIC_PATTERNS.SHELF_PRODUCTS, {
            house_uuid: this.houseUuid,
            shelf_id: this.shelfId
        });

        let lastPublishedReading = null;

        this.publishInterval = setInterval(() => {
            const reading = this.simulateRFIDReading();
            if (!reading) return;

            if (reading.error) {
                console.error(`${reading.message} na prateleira ${this.shelfId}`);
                return;
            }

            // Validar tag RFID
            const validation = Config.validationRules.rfid.validateTag(reading.rfid_tag);
            if (!validation.isValid) {
                console.error(`Tag RFID inválida detetada: ${reading.rfid_tag}`);
                return;
            }

            // Evitar leituras duplicadas em sequência
            const readingKey = `${reading.rfid_tag}_${reading.action}`;
            if (lastPublishedReading === readingKey) {
                return;
            }

            this.client.publish(topic, JSON.stringify(reading), { qos: 1 }, error => {
                if (error) {
                    console.error(`Erro ao publicar leitura RFID: ${error.message}`);
                } else if (Config.environmentConfig.isDevelopment) {
                    console.log(`Leitura RFID: ${reading.action === 'add' ? 'Adicionada' : 'Removida'} tag ${reading.rfid_tag}`);
                }
            });

            lastPublishedReading = readingKey;
        }, this.sensorConfig.publishInterval);
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
                console.error(`Erro ao limpar recursos RFID: ${error.message}`);
            }
        }
    }
}

module.exports = RFIDSensor;