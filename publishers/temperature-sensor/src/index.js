// publishers/temperature-sensor/src/index.js

require('dotenv').config();
const mqtt = require('mqtt');
const Config = require('../config/config');

class TemperatureSensor {
    constructor(houseUuid) {
        this.houseUuid = houseUuid;
        this.client = null;
        this.lastTemperature = null;
        this.lastPublishTime = null;
        this.publishInterval = null;
        this.isStabilizing = false;
        this.testTemperatures = null;
        this.textIndex = 0;
    }

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
                console.log('Conexão fechada. Tentando reconectar...');
                this.cleanup();
            });
        } catch (error) {
            console.error(`Erro ao conectar: ${error.message}`);
            throw error;
        }
    }

    setTestTemperatures(temperatures) {
        this.testTemperatures = temperatures;
        this.testIndex = 0;
    }

    generateTemperature() {
        if (this.testTemperatures !== null) {
            // Se houver temperaturas de teste definidas, usar a próxima temperatura da lista
            const newTemp = this.testTemperatures[this.testIndex].toFixed(2);
            this.testIndex = (this.testIndex + 1) % this.testTemperatures.length;
            this.lastTemperature = newTemp;
            return newTemp;
        }

        else {
        const { min, max, variance } = Config.sensorConfig.simulationConfig;
        let newTemp;

        if (this.lastTemperature === null) {
            // Primeira leitura - começar com um valor médio
            newTemp = ((max + min) / 2).toFixed(2);
        } else {
            // Gerar uma variação realista baseada na última temperatura
            const variation = (Math.random() * 2 - 1) * variance;
            newTemp = (parseFloat(this.lastTemperature) + variation).toFixed(2);
        }

        // Validar a temperatura gerada
        const validation = Config.validationRules.temperature;
        const rangeCheck = validation.validateRange(parseFloat(newTemp));
        
        if (!rangeCheck.isValid) {
            newTemp = rangeCheck.value.toFixed(2);
        }

        // Validar a taxa de mudança se não for a primeira leitura
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
        return newTemp;}
    }

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
                        now - this.lastPublishTime >= Config.loggingConfig.temperatureLogInterval) {
                        console.log(`Temperatura publicada: ${temperature}°C no tópico ${topic}`);
                        this.lastPublishTime = now;
                    }
                }
            });

            // Verificar se ainda está em período de estabilização
            if (this.isStabilizing && now - this.lastPublishTime >= Config.sensorConfig.simulationConfig.stabilizationTime) {
                this.isStabilizing = false;
            }
        }, Config.sensorConfig.publishInterval);
    }

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

// Iniciar sensores para cada casa configurada
async function initializeSensors() {
    const houses = Object.keys(Config.houseConfigs);
    
    for (const houseUuid of houses) {
        try {
            const sensor = new TemperatureSensor(houseUuid);
            await sensor.connect();
        } catch (error) {
            console.error(`Falha ao inicializar sensor para casa ${houseUuid}: ${error.message}`);
        }
    }
}

// Iniciar apenas se não estivermos em modo de teste
if (require.main === module) {
    initializeSensors().catch(console.error);

    process.on('SIGINT', () => {
        console.log('Encerrando sensores de temperatura...');
        process.exit(0);
    });
}

module.exports = TemperatureSensor;