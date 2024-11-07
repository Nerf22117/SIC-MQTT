// publishers/weight-sensor/src/index.js

const mqtt = require('mqtt');
const config = require('../config/config.js');
const client = mqtt.connect(config.brokerUrl);

class WeightSensor {
    constructor(houseUuid, shelfId) {
        this.houseUuid = houseUuid;
        this.shelfId = shelfId;
        this.lastWeight = 0;
        this.lastStableWeight = 0;
        this.weightBuffer = [];
    }

    // Gera tópico para a prateleira
    generateTopic() {
        return `house/${this.houseUuid}/pantry/${this.shelfId}/weight`;
    }

    // Processa nova leitura de peso
    processWeight(weight) {
        this.weightBuffer.push(weight);
        
        // Manter buffer com últimas 5 leituras
        if (this.weightBuffer.length > 5) {
            this.weightBuffer.shift();
        }

        // Publicar apenas se o peso estiver estável e houver mudança significativa
        if (this.isWeightStable() && this.hasSignificantChange()) {
            const avgWeight = this.calculateAverageWeight();
            this.publishWeight(avgWeight);
            this.lastStableWeight = avgWeight;
        }

        this.lastWeight = weight;
    }

    // Verifica se o peso está estável
    isWeightStable() {
        if (this.weightBuffer.length < 5) return false;
        
        const maxDiff = Math.max(...this.weightBuffer) - Math.min(...this.weightBuffer);
        return maxDiff < config.weightThresholds.minWeightChange;
    }

    // Verifica se houve mudança significativa de peso
    hasSignificantChange() {
        const avgWeight = this.calculateAverageWeight();
        return Math.abs(avgWeight - this.lastStableWeight) > config.weightThresholds.minWeightChange;
    }

    // Calcula média do peso
    calculateAverageWeight() {
        const sum = this.weightBuffer.reduce((acc, val) => acc + val, 0);
        return Math.round(sum / this.weightBuffer.length);
    }

    // Publica peso atual
    publishWeight(weight) {
        const message = {
            weight,
            previous_weight: this.lastStableWeight,
            weight_change: weight - this.lastStableWeight,
            shelfId: this.shelfId,
            timestamp: new Date().toISOString()
        };
        
        client.publish(this.generateTopic(), JSON.stringify(message), { qos: 1 });
        console.log(`[Prateleira ${this.shelfId}] Mudança de peso detectada:`);
        console.log(`  - Peso atual: ${weight}g`);
        console.log(`  - Peso anterior: ${this.lastStableWeight}g`);
        console.log(`  - Variação: ${message.weight_change}g`);
    }
}

// Inicializar sensores para cada prateleira
const weightSensors = new Map();

// Criar sensores para cada prateleira configurada
config.shelves["12345"].forEach(shelf => {
    weightSensors.set(shelf.id, new WeightSensor("12345", shelf.id));
});

// Função para simular mudança gradual de peso
function simulateGradualChange(sensor, targetChange, duration) {
    const startWeight = sensor.lastStableWeight;
    const endWeight = startWeight + targetChange;
    const steps = duration / config.readingInterval;
    const weightStep = targetChange / steps;
    let currentStep = 0;

    const interval = setInterval(() => {
        if (currentStep >= steps) {
            clearInterval(interval);
            return;
        }

        const currentWeight = startWeight + (weightStep * currentStep);
        // Adicionar ruído se habilitado
        const noise = config.simulation.noise.enabled ? 
            (Math.random() - 0.5) * config.simulation.noise.maxVariation * 2 : 
            0;

        sensor.processWeight(currentWeight + noise);
        currentStep++;
    }, config.readingInterval);
}

// Função para executar cenários de simulação
function runSimulationScenarios(sensor) {
    config.simulation.scenarios.forEach(scenario => {
        setTimeout(() => {
            console.log(`\n=== Iniciando Cenário: ${scenario.description} ===`);
            simulateGradualChange(sensor, scenario.weightChange, scenario.duration);
        }, scenario.delay);
    });
}

client.on('connect', () => {
    console.log('Sistema de Sensores de Peso Conectado');
    
    if (config.simulation.enabled) {
        console.log('Iniciando simulação de cenários...');
        // Usar primeira prateleira para simulação
        const primarySensor = weightSensors.get("A1");
        runSimulationScenarios(primarySensor);
        
        // Simular pequenas variações aleatórias nas outras prateleiras
        weightSensors.forEach((sensor, shelfId) => {
            if (shelfId !== "A1") {
                setInterval(() => {
                    const smallChange = (Math.random() - 0.5) * 20;
                    sensor.processWeight(Math.max(0, sensor.lastStableWeight + smallChange));
                }, 2000);
            }
        });
    }
});

// Gestão de encerramento gracioso
process.on('SIGINT', () => {
    console.log('\nDesligando sensores de peso...');
    setTimeout(() => process.exit(0), 500);
});