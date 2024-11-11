// publishers/temperature-sensor/src/temperatureSensor.js

const mqtt = require('mqtt');
const Config = require('../config/temperatureSensorConfig');

/**
 * Implementação do sensor de temperatura
 * Responsável por simular e publicar leituras de temperatura
 */
class TemperatureSensor {
    /**
     * Inicializa o sensor de temperatura
     * @param {string} houseUuid - Identificador único da casa
     */
    constructor(houseUuid) {
        this.houseUuid = houseUuid;
        this.client = null;
        this.lastTemperature = null;
        this.lastPublishTime = null;
        this.publishInterval = null;
        this.isStabilizing = false;
        this.testTemperatures = null;
        this.testIndex = 0;

        // Carregar configurações
        this.sensorConfig = Config.sensorConfig;
        this.houseConfig = Config.getHouseTemperatureConfig(houseUuid);
    }

    /**
     * Estabelece conexão com o broker MQTT
     * @throws {Error} Se ocorrer erro na conexão
     */
    async connect() {
        try {
            this.client = mqtt.connect(Config.brokerConfig.url, Config.brokerConfig.options);

            this.client.on('connect', () => {
                console.log(`Sensor de Temperatura conectado para casa ${this.houseUuid}`);
                this.startPublishing();
            });

            this.client.on('error', (error) => {
                console.error(`Erro no sensor de temperatura: ${error.message}`);
                this.cleanup();
            });

            this.client.on('close', () => {
                console.log('Conexão fechada. A tentar reconectar...');
                this.cleanup();
            });
        } catch (error) {
            console.error(`Erro ao conectar: ${error.message}`);
            throw error;
        }
    }

    /**
     * Define uma sequência de temperaturas para teste
     * @param {number[]} temperatures - Temperaturas de teste
     */
    setTestTemperatures(temperatures) {
        this.testTemperatures = temperatures;
        this.testIndex = 0;
    }

    /**
     * Gera uma nova leitura de temperatura
     * @returns {string} Temperatura gerada
     */
    generateTemperature() {
        // Usar temperaturas de teste se disponíveis
        if (this.testTemperatures !== null) {
            const newTemp = this.testTemperatures[this.testIndex].toFixed(2);
            this.testIndex = (this.testIndex + 1) % this.testTemperatures.length;
            this.lastTemperature = newTemp;
            return newTemp;
        }

        // Gerar temperatura simulada
        const { min, max, variance } = this.sensorConfig.simulationConfig;
        let newTemp;

        if (this.lastTemperature === null) {
            // Primeira leitura - começar com valor médio
            newTemp = ((max + min) / 2).toFixed(2);
        } else {
            // Gerar variação realista
            const variation = (Math.random() * 2 - 1) * variance;
            newTemp = (parseFloat(this.lastTemperature) + variation).toFixed(2);
        }

        // Validar a temperatura gerada
        const validation = Config.validationRules.temperature;
        const rangeCheck = validation.validateRange(parseFloat(newTemp));
        
        if (!rangeCheck.isValid) {
            newTemp = rangeCheck.value.toFixed(2);
        }

        // Validar taxa de mudança
        if (this.lastTemperature !== null && this.lastPublishTime !== null) {
            const timeDiff = Date.now() - this.lastPublishTime;
            const changeCheck = validation.validateChange(
                parseFloat(newTemp),
                parseFloat(this.lastTemperature),
                timeDiff
            );
            
            if (!changeCheck.isValid) {
                newTemp = changeCheck.value.toFixed(2);
                this.isStabilizing = true;
            }
        }

        this.lastTemperature = newTemp;
        return newTemp;
    }

    /**
     * Inicia a publicação de leituras de temperatura
     */
    startPublishing() {
        if (this.publishInterval) return;

        const topic = Config.formatTopic(Config.topicPatterns.TEMPERATURE, {
            house_uuid: this.houseUuid
        });

        this.publishInterval = setInterval(() => {
            const temperature = this.generateTemperature();
            const now = Date.now();
            
            const message = {
                temperature: parseFloat(temperature),
                timestamp: new Date(now).toISOString(),
                sensor_id: `temp_${this.houseUuid}`,
                status: this.isStabilizing ? 'stabilizing' : 'stable'
            };

            this.client.publish(topic, JSON.stringify(message), { qos: 1 }, (err) => {
                if (err) {
                    console.error(`Erro ao publicar temperatura: ${err.message}`);
                } else {
                    if (Config.environmentConfig.isDevelopment || 
                        !this.lastPublishTime || 
                        now - this.lastPublishTime >= Config.sensorConfig.publishInterval) {
                        console.log(`Temperatura publicada: ${temperature}°C no tópico ${topic}`);
                        this.lastPublishTime = now;
                    }
                }
            });

            // Verificar se ainda está em período de estabilização
            if (this.isStabilizing && 
                now - this.lastPublishTime >= this.sensorConfig.simulationConfig.stabilizationTime) {
                this.isStabilizing = false;
            }
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
                console.error(`Erro ao limpar recursos: ${error.message}`);
            }
        }
    }
}

module.exports = TemperatureSensor;