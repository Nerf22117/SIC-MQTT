// subscribers/alerts/src/alertManager.js

require('dotenv').config();
const Config = require('../config/config');

class AlertManager {
    constructor() {
        this.alertCache = new Map();
        this.temperatureReadings = new Map();
        this.setupCacheCleanup();
    }

    setupCacheCleanup() {
        setInterval(() => {
            const now = Date.now();
            // Limpar cache de alertas
            for (const [key, value] of this.alertCache) {
                if (now - value.timestamp > Config.alertCacheConfig.expiryTime) {
                    this.alertCache.delete(key);
                }
            }
            // Limpar histórico de leituras
            for (const [houseUuid, readings] of this.temperatureReadings) {
                this.temperatureReadings.set(
                    houseUuid,
                    readings.filter(reading => 
                        now - new Date(reading.timestamp).getTime() < Config.alertCacheConfig.expiryTime
                    )
                );
            }
        }, Config.alertCacheConfig.cleanupInterval);
    }

    generateAlertKey(houseUuid, type, metadata = {}) {
        return `${houseUuid}_${type}_${JSON.stringify(metadata)}`;
    }

    isAlertInCooldown(key) {
        const cached = this.alertCache.get(key);
        if (!cached) return false;
        
        const now = Date.now();
        return (now - cached.timestamp) < cached.cooldown;
    }

    cacheAlert(key, type, cooldown) {
        if (this.alertCache.size >= Config.alertCacheConfig.maxSize) {
            // Remove o alerta mais antigo
            const oldestKey = Array.from(this.alertCache.entries())
                .sort(([, a], [, b]) => a.timestamp - b.timestamp)[0][0];
            this.alertCache.delete(oldestKey);
        }

        this.alertCache.set(key, {
            timestamp: Date.now(),
            cooldown: cooldown,
            type: type
        });
    }

    addTemperatureReading(houseUuid, temperature, timestamp) {
        if (!this.temperatureReadings.has(houseUuid)) {
            this.temperatureReadings.set(houseUuid, []);
        }

        const readings = this.temperatureReadings.get(houseUuid);
        readings.push({ temperature, timestamp });

        // Manter apenas as leituras necessárias para validação
        const maxReadings = Config.alertConfig.types.TEMPERATURE.requiredReadingsForAlert * 2;
        if (readings.length > maxReadings) {
            readings.shift();
        }
    }

    processTemperatureAlert(houseUuid, temperature) {
        const thresholds = Config.getHouseAlertThresholds(houseUuid);
        const timestamp = new Date().toISOString();
        
        // Adicionar leitura ao histórico
        this.addTemperatureReading(houseUuid, temperature, timestamp);
        
        // Obter todas as leituras para esta casa
        const readings = (this.temperatureReadings.get(houseUuid) || [])
            .map(r => r.temperature);

        // Validar se devemos gerar um alerta
        const validation = Config.validateTemperatureForAlert(
            temperature,
            readings,
            thresholds
        );

        if (!validation.shouldAlert) return null;

        const alertKey = this.generateAlertKey(houseUuid, validation.type, {
            threshold: validation.threshold
        });

        if (this.isAlertInCooldown(alertKey)) {
            return null;
        }

        this.cacheAlert(
            alertKey,
            validation.type,
            Config.alertConfig.types.TEMPERATURE.cooldown
        );

        return {
            type: validation.type,
            house_uuid: houseUuid,
            temperature: temperature,
            threshold: validation.threshold,
            severity: Config.alertConfig.types.TEMPERATURE.severity,
            consecutive_readings: Config.alertConfig.types.TEMPERATURE.requiredReadingsForAlert,
            readings_history: readings.slice(-Config.alertConfig.types.TEMPERATURE.requiredReadingsForAlert),
            timestamp: timestamp
        };
    }

    formatAlertMessage(alert) {
        return {
            ...alert,
            source: 'StockWise Alert System',
            version: '1.0',
            environment: Config.environmentConfig.isDevelopment ? 'development' : 'production'
        };
    }
}

module.exports = AlertManager;