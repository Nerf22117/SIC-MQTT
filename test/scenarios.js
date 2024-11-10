// test/scenarios.js
const TemperatureSensor = require('../publishers/temperature-sensor/src');
const AlertSubscriber = require('../subscribers/alerts/src');
const AppSubscriber = require('../subscribers/app/src');

class TestScenarios {
    static async runScenario(name, temperatures) {
        console.log(`\n=== Iniciando Cenário: ${name} ===\n`);
        
        // Configurar sensor com temperaturas específicas
        const sensor = new TemperatureSensor('12345');
        sensor.setTestTemperatures(temperatures);

        // Iniciar componentes
        const alertSystem = new AlertSubscriber();
        const app = new AppSubscriber();

        await Promise.all([
            sensor.connect(),
            alertSystem.connect(),
            app.connect()
        ]);

        // Aguardar execução do cenário
        await new Promise(resolve => setTimeout(resolve, 
            (temperatures.length + 2) * 5000));

        // Limpar
        sensor.cleanup();
        alertSystem.cleanup();
        app.cleanup();

        console.log(`\n=== Fim do Cenário: ${name} ===\n`);
    }

    static async runAllScenarios() {
        // Cenário 1: Aproximação do Limite
        await this.runScenario('Aproximação do Limite', [
            15.0, 14.9, 14.8, 14.7
        ]);

        // Cenário 2: Alerta de Temperatura Alta
        await this.runScenario('Alerta de Temperatura Alta', [
            16.0, 16.2, 16.3, 16.4
        ]);

        // Cenário 3: Normalização
        await this.runScenario('Normalização', [
            16.4, 16.2, 15.8, 15.5, 15.4, 15.3
        ]);
    }
}

// Executar todos os cenários
if (require.main === module) {
    TestScenarios.runAllScenarios()
        .catch(console.error)
        .finally(() => process.exit(0));
}