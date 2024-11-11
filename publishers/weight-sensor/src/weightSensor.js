// publishers/weight-sensor/src/weightSensor.js

const mqtt = require('mqtt');
const Config = require('../config/weightSensorConfig');

/**
 * Implementação do sensor de peso
 * Responsável por simular e publicar leituras de peso das prateleiras
 */
class WeightSensor {
    /**
     * Inicializa o sensor de peso
     * @param {string} houseUuid - Identificador único da casa
     * @param {string} shelfId - Identificador da prateleira
     */
    constructor(houseUuid, shelfId) {
        this.houseUuid = houseUuid;
        this.shelfId = shelfId;
        this.client = null;
        this.publishInterval = null;
        this.lastReading = null;
        this.lastPublishedReading = null;
        this.stabilizationTimer = null;
        this.weightConfig = Config.getShelfWeightConfig(shelfId);
        this.isStabilizing = false;
        this.testWeights = null;
        this.testIndex = 0;
        
        // Armazenar tópico na construção
        this.topic = Config.formatTopic(Config.topicPatterns.SHELF_WEIGHT, {
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
            this.client = mqtt.connect(Config.brokerConfig.url, Config.brokerConfig.options);

            this.client.on('connect', () => {
                console.log(`Sensor de peso conectado para prateleira ${this.shelfId}`);
                this.startPublishing();
            });

            this.client.on('error', error => {
                console.error(`Erro no sensor de peso: ${error.message}`);
                this.cleanup();
            });
        } catch (error) {
            console.error(`Erro ao conectar sensor de peso: ${error.message}`);
            throw error;
        }
    }

    /**
     * Define uma sequência de pesos para teste
     * @param {number[]} sequence - Sequência de pesos
     */
    setTestSequence(sequence) {
        this.testWeights = sequence;
        this.testIndex = 0;
    }

    /**
     * Simula uma leitura de peso
     * @returns {Object|null} Leitura de peso ou null
     */
    simulateWeightReading() {
        // Usar sequência de teste se disponível
        if (this.testWeights) {
            const weight = this.testWeights[this.testIndex];
            this.testIndex = (this.testIndex + 1) % this.testWeights.length;
            return { weight, isStable: true };
        }

        const config = Config.sensorConfig;

        // Primeira leitura
        if (this.lastReading === null) {
            return { weight: 0, isStable: true };
        }

        let reading = this.lastReading;

        // Simular instabilidade ou ruído
        if (this.isStabilizing) {
            const oscillation = (Math.random() - 0.5) * config.simulationConfig.movementPatterns.oscillationRange;
            reading += oscillation;
        } else {
            const noise = (Math.random() - 0.5) * config.noiseLevel;
            const drift = (Math.random() * config.driftRate) / 3600;
            reading += noise + drift;
        }

        // Validar leitura
        const validation = Config.validationRules.weight.validateReading(reading, this.lastReading);
        if (!validation.isValid) {
            console.warn(`Leitura inválida detetada: ${validation.reason}`);
            return null;
        }

        const isStable = Math.abs(reading - this.lastReading) < config.validation.stabilityThreshold;
        return { weight: validation.value, isStable };
    }

    /**
     * Processa alteração de peso
     * @param {Object} reading - Leitura de peso
     * @returns {Object} Leitura processada
     */
    processWeightChange(reading) {
        const config = Config.sensorConfig;
        const minWeightChange = config.validation.minWeightChange;
        
        const significantChange = this.lastPublishedReading && 
            Math.abs(reading.weight - this.lastPublishedReading) > minWeightChange;

        if (significantChange) {
            this.isStabilizing = true;
            if (this.stabilizationTimer) {
                clearTimeout(this.stabilizationTimer);
            }
            this.stabilizationTimer = setTimeout(() => {
                this.isStabilizing = false;
                this.publishWeightReading(reading.weight, true);
            }, config.simulationConfig.stabilizationTime);
        }

        return reading;
    }

    /**
     * Inicia a publicação de leituras de peso
     */
    startPublishing() {
        if (this.publishInterval) return;

        this.publishInterval = setInterval(() => {
            const reading = this.simulateWeightReading();
            if (!reading) return;

            this.lastReading = reading.weight;
            const processedReading = this.processWeightChange(reading);

            if (processedReading.isStable || Config.environmentConfig.isDevelopment) {
                this.publishWeightReading(processedReading.weight, processedReading.isStable);
            }
        }, Config.sensorConfig.publishInterval);
    }

    /**
     * Publica uma leitura de peso no broker MQTT
     * @param {number} weight - Peso medido
     * @param {boolean} isStable - Indicador de estabilidade
     */
    publishWeightReading(weight, isStable) {
        const event = {
            type: 'weight_event',
            shelf_id: this.shelfId,
            sensor_id: this.weightConfig.sensorId,
            weight: weight,
            is_stable: isStable,
            timestamp: new Date().toISOString()
        };

        if (!this.client || !this.topic) {
            console.error('Cliente MQTT não inicializado ou tópico inválido');
            return;
        }

        this.client.publish(this.topic, JSON.stringify(event), { qos: 1 }, error => {
            if (error) {
                console.error(`Erro ao publicar leitura de peso: ${error.message}`);
            } else {
                this.lastPublishedReading = weight;
                if (Config.environmentConfig.isDevelopment) {
                    console.log(`Leitura de peso publicada: ${JSON.stringify(event)}`);
                }
            }
        });
    }

    /**
     * Limpa recursos e encerra conexões
     */
    cleanup() {
        if (this.publishInterval) {
            clearInterval(this.publishInterval);
            this.publishInterval = null;
        }

        if (this.stabilizationTimer) {
            clearTimeout(this.stabilizationTimer);
            this.stabilizationTimer = null;
        }

        if (this.client) {
            try {
                this.client.end(true);
            } catch (error) {
                console.error(`Erro ao limpar recursos do sensor de peso: ${error.message}`);
            }
        }
    }
}

module.exports = WeightSensor;