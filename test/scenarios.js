// test/scenarios.js

const TemperatureSensor = require('../publishers/temperature-sensor/src/temperatureSensor');
const AlertSubscriber = require('../subscribers/alerts/src/alertSubscriber');
const AppSubscriber = require('../subscribers/app/src/appSubscriber');
const Config = require('../publishers/temperature-sensor/config/temperatureSensorConfig');

/**
 * Cenários de Teste para Monitorização de Temperatura
 * Simula diferentes situações de temperatura para validar o sistema
 */
class TestScenarios {
    /**
     * Executa um cenário específico de teste
     * @param {string} name - Nome do cenário
     * @param {number[]} temperatures - Sequência de temperaturas a simular
     * @returns {Promise<void>}
     */
    static async runScenario(name, temperatures) {
        console.log(`\n=== A iniciar Cenário: ${name} ===\n`);
        
        // Configurar limites de temperatura para teste
        const testConfig = {
            min: 14.0,  // Temperatura mínima aceitável
            max: 16.0,  // Temperatura máxima aceitável
            bufferZone: 1.0,  // Zona de tolerância
            alertCooldown: 900000,  // 15 minutos
            readingInterval: 300000  // 5 minutos
        };

        try {
            // Configurar sensor com temperaturas específicas e configuração de teste
            const sensor = new TemperatureSensor('12345', testConfig);
            sensor.setTestTemperatures(temperatures);

            // Iniciar componentes
            const alertSystem = new AlertSubscriber();
            const app = new AppSubscriber();

            // Conectar todos os componentes
            await Promise.all([
                sensor.connect(),
                alertSystem.connect(),
                app.connect()
            ]);

            // Calcular duração com base no número de leituras
            const scenarioDuration = (temperatures.length + 2) * 5000;

            // Aguardar execução do cenário
            await new Promise(resolve => setTimeout(resolve, scenarioDuration));

            // Limpar recursos
            sensor.cleanup();
            alertSystem.cleanup();
            app.cleanup();

            console.log(`\n=== Fim do Cenário: ${name} ===\n`);
        } catch (error) {
            console.error(`Erro durante execução do cenário ${name}:`, error);
            throw error;
        }
    }

    /**
     * Executa todos os cenários de teste
     * @returns {Promise<void>}
     */
    static async runAllScenarios() {
        const scenarios = [
            {
                name: 'Aproximação do Limite',
                description: 'Testa comportamento quando temperatura se aproxima do limite',
                temperatures: [15.0, 14.9, 14.8, 14.7]
            },
            {
                name: 'Alerta de Temperatura Alta',
                description: 'Valida geração de alertas para temperatura acima do limite',
                temperatures: [16.0, 16.2, 16.3, 16.4]
            },
            {
                name: 'Normalização',
                description: 'Verifica processo de normalização após alerta',
                temperatures: [16.4, 16.2, 15.8, 15.5, 15.4, 15.3]
            }
        ];

        for (const scenario of scenarios) {
            try {
                console.log(`\nExecutando cenário: ${scenario.name}`);
                console.log(`Descrição: ${scenario.description}`);
                
                await this.runScenario(
                    scenario.name,
                    scenario.temperatures
                );
                
                console.log(`✓ Cenário "${scenario.name}" concluído com sucesso`);
            } catch (error) {
                console.error(`✗ Falha no cenário ${scenario.name}:`, error);
            }
        }
    }
}

// Executar todos os cenários se executado diretamente
if (require.main === module) {
    TestScenarios.runAllScenarios()
        .catch(error => {
            console.error('Erro durante execução dos testes:', error);
            process.exit(1);
        })
        .finally(() => {
            console.log('\nTestes concluídos');
            process.exit(0);
        });
}

module.exports = TestScenarios;