// publishers/temperature-sensor/config/config.js

const CommonConfig = require('../../../config/commonConfig');

class TemperatureSensorConfig extends CommonConfig {
    static get sensorConfig() {
        const isDevMode = this.environmentConfig.isDevelopment;
        
        return {
            publishInterval: isDevMode ? 5000 : 300000, // 5s dev / 5min prod
            simulationConfig: {
                min: 5.0,
                max: 25.0,
                variance: 0.2,                // Variação máxima mais realista
                stabilizationTime: 300000     // 5 minutos para estabilizar após mudança significativa
            },
            validation: {
                maxRateOfChange: 0.5,         // Mudança máxima aceitável por minuto
                stabilityThreshold: 0.1       // Variação considerada estável
            }
        };
    }

    static getHouseAlertThresholds(houseUuid) {
        return this.houseConfigs[houseUuid]?.temperature || {
            min: 2.0,
            max: 18.0,
            bufferZone: 1.0,
            alertCooldown: 900000,    // 15 minutos
            readingInterval: 300000   // 5 minutos
        };
    }

    static get validationRules() {
        return {
            temperature: {
                validateRange: (temp) => {
                    const config = this.sensorConfig.simulationConfig;
                    return {
                        isValid: temp >= config.min && temp <= config.max,
                        value: Math.min(Math.max(temp, config.min), config.max)
                    };
                },
                validateChange: (currentTemp, lastTemp, timeDiff) => {
                    if (!lastTemp) return { isValid: true, value: currentTemp };
                    
                    const config = this.sensorConfig.validation;
                    const maxChange = (config.maxRateOfChange * timeDiff) / 60000; // por minuto
                    const actualChange = Math.abs(currentTemp - lastTemp);
                    
                    if (actualChange > maxChange) {
                        const direction = currentTemp > lastTemp ? 1 : -1;
                        return {
                            isValid: false,
                            value: lastTemp + (maxChange * direction)
                        };
                    }
                    
                    return { isValid: true, value: currentTemp };
                }
            }
        };
    }
}

module.exports = TemperatureSensorConfig;