// subscribers/app/src/index.js

const mqtt = require('mqtt');
const Config = require('../config/config');

class AppSubscriber {
    constructor() {
        this.client = null;
        this.houseData = new Map();
        this.alertStates = new Map();
        this.lastDisplayTimes = new Map();
        this.setupDataStructures();
    }

    setupDataStructures() {
        Object.keys(Config.houseConfigs).forEach(houseUuid => {
            this.houseData.set(houseUuid, {
                temperature: null,
                lastUpdate: null,
                history: {
                    temperature: [],
                    alerts: []
                }
            });

            this.alertStates.set(houseUuid, {
                temperature: {
                    active: false,
                    lastAlert: null,
                    type: null,
                    lastNotification: null,
                    normalReadingsCount: 0  // Contador para leituras normais consecutivas
                }
            });

            this.lastDisplayTimes.set(houseUuid, {
                temperature: null,
                status: null
            });
        });
    }

    async connect() {
        try {
            this.client = mqtt.connect(Config.brokerConfig.url, Config.brokerConfig.options);

            this.client.on('connect', () => {
                console.log('Aplicação conectada ao broker MQTT');
                this.setupSubscriptions();
            });

            this.client.on('message', (topic, message) => {
                this.handleMessage(topic, message).catch(error => {
                    console.error(`Erro ao processar mensagem: ${error.message}`);
                });
            });

            this.client.on('error', (error) => {
                console.error(`Erro na conexão MQTT: ${error.message}`);
            });

            this.startHistoryCleanup();

        } catch (error) {
            console.error(`Erro ao conectar aplicação: ${error.message}`);
            throw error;
        }
    }

    setupSubscriptions() {
        Object.keys(Config.houseConfigs).forEach(houseUuid => {
            [
                Config.formatTopic(Config.topicPatterns.TEMPERATURE, { house_uuid: houseUuid }),
                Config.formatTopic(Config.topicPatterns.ALERTS, { house_uuid: houseUuid })
            ].forEach(topic => {
                this.client.subscribe(topic, { qos: 1 }, (err) => {
                    if (err) {
                        console.error(`Erro ao subscrever ${topic}: ${err.message}`);
                    } else {
                        console.log(`Subscrito ao tópico: ${topic}`);
                    }
                });
            });
        });
    }

    async handleMessage(topic, message) {
        try {
            const data = JSON.parse(message.toString());
            const houseUuid = this.extractHouseUuid(topic);
            
            if (!houseUuid || !this.houseData.has(houseUuid)) {
                console.warn(`UUID de casa inválido ou não encontrado: ${houseUuid}`);
                return;
            }

            if (this.isTemperatureTopic(topic)) {
                await this.handleTemperatureMessage(houseUuid, data);
            } else if (this.isAlertTopic(topic)) {
                await this.handleAlertMessage(houseUuid, data);
            }

        } catch (error) {
            console.error(`Erro ao processar mensagem: ${error.message}`);
            if (error instanceof SyntaxError) {
                console.error('Mensagem inválida:', message.toString());
            }
        }
    }

    async handleTemperatureMessage(houseUuid, data) {
        const houseState = this.houseData.get(houseUuid);
        const alertState = this.alertStates.get(houseUuid).temperature;
        const temperature = parseFloat(data.temperature);
        const thresholds = Config.getHouseAlertThresholds(houseUuid);
        
        // Atualizar estado
        const lastTemp = houseState.temperature;
        houseState.temperature = temperature;
        houseState.lastUpdate = new Date();

        // Verificar normalização
        const isTemperatureNormal = temperature >= (thresholds.min + thresholds.bufferZone) && 
                                  temperature <= (thresholds.max - thresholds.bufferZone);

        if (isTemperatureNormal) {
            alertState.normalReadingsCount++;
            
            // Verificar se podemos normalizar o estado
            if (alertState.active && alertState.normalReadingsCount >= 3) {
                this.normalizeTemperatureState(houseUuid, temperature);
            }
        } else {
            alertState.normalReadingsCount = 0;
        }

        // Verificar se devemos exibir esta atualização
        const lastDisplayTime = this.lastDisplayTimes.get(houseUuid).temperature;
        if (!alertState.active && 
            Config.shouldDisplayTemperature(temperature, lastTemp, lastDisplayTime)) {
            this.displayTemperatureUpdate(houseUuid, temperature, thresholds);
            this.lastDisplayTimes.get(houseUuid).temperature = Date.now();
        }

        // Adicionar ao histórico
        this.addToHistory(houseUuid, 'temperature', {
            value: temperature,
            timestamp: data.timestamp || new Date().toISOString(),
            isNormal: isTemperatureNormal
        });
    }

    normalizeTemperatureState(houseUuid, temperature) {
        const alertState = this.alertStates.get(houseUuid).temperature;
        const thresholds = Config.getHouseAlertThresholds(houseUuid);

        alertState.active = false;
        alertState.type = null;
        
        console.log(`\n[Casa ${houseUuid}] ✅ Temperatura normalizada após ${alertState.normalReadingsCount} leituras normais`);
        console.log(`Temperatura atual: ${Config.formatTemperature(temperature)}°C`);
        console.log(`Limites: ${thresholds.min}°C - ${thresholds.max}°C`);
        console.log(`Zona de buffer: ±${thresholds.bufferZone}°C\n`);
        
        alertState.normalReadingsCount = 0;
    }

    async handleAlertMessage(houseUuid, data) {
        const alertState = this.alertStates.get(houseUuid);
        const now = Date.now();

        if (data.type.includes('temperature')) {
            const lastNotification = alertState.temperature.lastNotification;
            const minInterval = Config.notificationConfig.alerts.temperature.minTimeBetweenNotifications;

            // Verificar se podemos mostrar nova notificação
            if (!lastNotification || (now - lastNotification) >= minInterval) {
                alertState.temperature.active = true;
                alertState.temperature.lastAlert = now;
                alertState.temperature.type = data.type;
                alertState.temperature.lastNotification = now;
                alertState.temperature.normalReadingsCount = 0;  // Resetar contador

                this.addToHistory(houseUuid, 'alerts', {
                    type: data.type,
                    temperature: data.temperature,
                    threshold: data.threshold,
                    timestamp: data.timestamp,
                    readings_history: data.readings_history
                });

                this.displayAlert(houseUuid, data);
            }
        }
    }

    addToHistory(houseUuid, type, data) {
        const houseState = this.houseData.get(houseUuid);
        const history = houseState.history[type];
        
        history.push(data);

        // Limitar tamanho do histórico
        const maxItems = Config.displayConfig.maxHistoryItems;
        if (history.length > maxItems) {
            history.splice(0, history.length - maxItems);
        }
    }

    displayTemperatureUpdate(houseUuid, temperature, thresholds) {
        const alertState = this.alertStates.get(houseUuid).temperature;
        
        if (!alertState.active) {
            console.log(`[Casa ${houseUuid}] Temperatura atual: ${Config.formatTemperature(temperature)}°C`);
            
            // Verificar proximidade dos limites
            const isNearMax = Math.abs(temperature - thresholds.max) <= thresholds.bufferZone;
            const isNearMin = Math.abs(temperature - thresholds.min) <= thresholds.bufferZone;
            
            if (isNearMax || isNearMin) {
                console.log(`⚠️  Atenção: Temperatura próxima dos limites (${thresholds.min}°C - ${thresholds.max}°C)`);
                console.log(`Zona de buffer: ±${thresholds.bufferZone}°C`);
            }
        }
    }

    displayAlert(houseUuid, alertData) {
        const alertType = alertData.type === 'high_temperature' ? 'alta' : 'baixa';
        console.log(`\n[ALERTA - Casa ${houseUuid}] ❗ Temperatura ${alertType} detectada!`);
        console.log(`Temperatura: ${Config.formatTemperature(alertData.temperature)}°C (Limite: ${alertData.threshold}°C)`);
        
        if (alertData.readings_history) {
            console.log(`Últimas leituras: ${alertData.readings_history.map(t => Config.formatTemperature(t)).join(', ')}°C`);
        }

        // Adicionar informação sobre normalização
        console.log(`\nℹ️  Sistema aguardará 3 leituras normais consecutivas para normalizar o estado.`);
        console.log(`Monitorando temperatura...\n`);
    }

    startHistoryCleanup() {
        setInterval(() => {
            const maxAge = Date.now() - Config.dataManagementConfig.history.maxStorageTime;
            
            this.houseData.forEach((data, houseUuid) => {
                Object.keys(data.history).forEach(type => {
                    data.history[type] = data.history[type].filter(
                        record => new Date(record.timestamp).getTime() > maxAge
                    );
                });
            });
        }, Config.dataManagementConfig.history.cleanupInterval);
    }

    extractHouseUuid(topic) {
        const match = topic.match(/house\/([^/]+)/);
        return match ? match[1] : null;
    }

    isTemperatureTopic(topic) {
        return topic.endsWith('temperature');
    }

    isAlertTopic(topic) {
        return topic.endsWith('alerts');
    }

    cleanup() {
        if (this.client) {
            try {
                this.client.end(true);
            } catch (error) {
                console.error(`Erro ao limpar recursos: ${error.message}`);
            }
        }
    }
}

// Inicializar a aplicação se não estivermos em modo de teste
if (require.main === module) {
    const app = new AppSubscriber();
    app.connect().catch(console.error);

    // Gestão de encerramento gracioso
    process.on('SIGINT', () => {
        console.log('Encerrando aplicação...');
        app.cleanup();
        process.exit(0);
    });
}

module.exports = AppSubscriber;