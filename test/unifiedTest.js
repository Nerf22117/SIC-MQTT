// test/unifiedTests.js

const TemperatureSensor = require('../publishers/temperature-sensor/src/temperatureSensor');
const RFIDSensor = require('../publishers/rfid-reader/src/rfidSensor');
const WeightSensor = require('../publishers/weight-sensor/src/weightSensor');
const AlertSubscriber = require('../subscribers/alerts/src/alertSubscriber');
const AppSubscriber = require('../subscribers/app/src/appSubscriber');
const CommonConfig = require('../config/commonConfig');

/**
 * Cenários de Teste Unificados do StockWise
 * Integra testes de temperatura, RFID e peso num fluxo único
 */
class UnifiedTestScenarios {
    /**
     * Executa um cenário específico de teste
     * @param {string} name - Nome do cenário
     * @param {Object} config - Configuração do cenário
     * @returns {Promise<void>}
     */
    static async runScenario(name, config) {
        console.log(`\n=== A iniciar Cenário: ${name} ===\n`);
        console.log(`Descrição: ${config.description || 'N/A'}`);

        const houseUuid = CommonConfig.currentHouse;
        const shelfId = "A1";  // Usar primeira prateleira para testes

        let components = {};

        try {
            // Inicializar e conectar componentes
            components = await this.initializeComponents(houseUuid, shelfId, config);

            // Executar cenário
            await this.executeScenario(components, config);

            console.log(`\n=== Conclusão do Cenário: ${name} ===\n`);
        } catch (error) {
            console.error(`Erro durante execução do cenário ${name}:`, error);
            throw error;
        } finally {
            // Garantir limpeza de recursos
            await this.cleanupComponents(components);
        }
    }

    /**
     * Inicializa componentes do sistema para teste
     * @param {string} houseUuid - Identificador da casa
     * @param {string} shelfId - Identificador da prateleira
     * @param {Object} config - Configuração do cenário
     * @returns {Promise<Object>} Componentes inicializados
     * @private
     */
    static async initializeComponents(houseUuid, shelfId, config) {
        console.log('Iniciando componentes do sistema...');

        const components = {
            tempSensor: new TemperatureSensor(houseUuid),
            rfidSensor: new RFIDSensor(houseUuid, shelfId),
            weightSensor: new WeightSensor(houseUuid, shelfId),
            alertSystem: new AlertSubscriber(),
            appSystem: new AppSubscriber()
        };

        // Configurar sequências de teste
        if (config.temperatures) {
            console.log('Configurando sequência de temperaturas:', config.temperatures);
            components.tempSensor.setTestTemperatures(config.temperatures);
        }

        if (config.rfidSequence) {
            console.log('Configurando sequência RFID:', config.rfidSequence);
            components.rfidSensor.setTestSequence(config.rfidSequence.map(item => ({
                rfid_tag: item.rfid_tag,
                action: item.action,
                shelf_id: shelfId,
                type: 'rfid_event',
                timestamp: new Date().toISOString()
            })));
        }

        if (config.weightSequence) {
            console.log('Configurando sequência de peso:', config.weightSequence);
            components.weightSensor.setTestSequence(config.weightSequence);
        }

        // Conectar todos os componentes
        try {
            await Promise.all(Object.values(components).map(component => 
                component.connect()
            ));
            console.log('Todos os componentes conectados com sucesso');
        } catch (error) {
            console.error('Erro ao conectar componentes:', error);
            throw error;
        }

        return components;
    }

    /**
     * Executa o cenário configurado
     * @param {Object} components - Componentes do sistema
     * @param {Object} config - Configuração do cenário
     * @returns {Promise<void>}
     * @private
     */
    static async executeScenario(components, config) {
        // Calcular duração do teste
        const testDuration = this.calculateTestDuration(config);

        // Aguardar execução do cenário
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(resolve, testDuration);

            // Monitorizar erros críticos
            process.on('unhandledRejection', (error) => {
                clearTimeout(timeout);
                reject(error);
            });
        });
    }

    /**
     * Calcula duração do teste baseada na configuração
     * @param {Object} config - Configuração do cenário
     * @returns {number} Duração em milissegundos
     * @private
     */
    static calculateTestDuration(config) {
        const maxEvents = Math.max(
            config.temperatures?.length || 0,
            config.rfidSequence?.length || 0,
            config.weightSequence?.length || 0
        );
        
        // Base: 5 segundos por evento + 2 segundos de margem
        return (maxEvents * 5000) + 2000;
    }

    /**
     * Limpa recursos dos componentes
     * @param {Object} components - Componentes do sistema
     * @returns {Promise<void>}
     * @private
     */
    static async cleanupComponents(components) {
        console.log('Iniciando limpeza dos componentes...');
        
        for (const [name, component] of Object.entries(components)) {
            if (component && typeof component.cleanup === 'function') {
                try {
                    await component.cleanup();
                    console.log(`Componente ${name} limpo com sucesso`);
                } catch (error) {
                    console.error(`Erro ao limpar componente ${name}:`, error);
                }
            }
        }
    }

    /**
     * Executa todos os cenários de teste
     * @returns {Promise<void>}
     */
    static async runAllScenarios() {
        const scenarios = [
            // Cenários de Produtos
            {
                name: "Produtos - Adição de Produto Registado",
                description: "Simula adição de produto com monitorização de temperatura normal",
                rfidSequence: [
                    { rfid_tag: "1234567890", action: "add" }
                ],
                weightSequence: [0, 1950, 2000],
                temperatures: [15.0, 15.1, 15.0]
            },
            {
                name: "Produtos - Remoção Parcial com Alerta de Stock",
                description: "Simula remoção que gera alerta de stock baixo",
                rfidSequence: [
                    { rfid_tag: "1234567890", action: "remove" }
                ],
                weightSequence: [2000, 1200, 450],
                temperatures: [15.0, 15.1, 15.0]
            },
            {
                name: "Produtos - Produto Não Registado",
                description: "Testa deteção de produto desconhecido",
                rfidSequence: [
                    { rfid_tag: "ABCD123456", action: "add" }
                ],
                weightSequence: [0, 1450, 1500],
                temperatures: [15.0, 15.1, 15.0]
            },
            // Cenários Combinados
            {
                name: "Combinado - Temperatura Alta e Movimentação",
                description: "Testa correlação entre alertas de temperatura e movimentação de produtos",
                temperatures: [16.0, 16.2, 16.3],
                rfidSequence: [
                    { rfid_tag: "1234567890", action: "add" }
                ],
                weightSequence: [0, 1800, 2000]
            },
            {
                name: "Combinado - Normalização e Reabastecimento",
                description: "Simula normalização de temperatura durante reabastecimento",
                temperatures: [16.2, 15.8, 15.5],
                rfidSequence: [
                    { rfid_tag: "1234567890", action: "add" }
                ],
                weightSequence: [450, 1750, 2000]
            },
            {
                name: "Combinado - Múltiplos Eventos",
                description: "Testa comportamento do sistema com múltiplos eventos simultâneos",
                temperatures: [15.0, 15.5, 15.8, 16.0],
                rfidSequence: [
                    { rfid_tag: "1234567890", action: "add" },
                    { rfid_tag: "0987654321", action: "add" }
                ],
                weightSequence: [0, 1000, 2000, 3000]
            }
        ];

        console.log('\nIniciando execução de cenários unificados...\n');

        for (const scenario of scenarios) {
            try {
                console.log(`\nIniciando cenário: ${scenario.name}`);
                await this.runScenario(scenario.name, scenario);
                console.log(`✓ Cenário "${scenario.name}" concluído com sucesso`);
            } catch (error) {
                console.error(`✗ Falha no cenário "${scenario.name}":`, error);
                // Continuar com próximo cenário mesmo em caso de falha
                continue;
            }
        }
    }
}

// Executar cenários se chamado diretamente
if (require.main === module) {
    UnifiedTestScenarios.runAllScenarios()
        .catch(error => {
            console.error('Erro durante execução dos testes:', error);
            process.exit(1);
        })
        .finally(() => {
            console.log('\nTestes unificados concluídos');
            process.exit(0);
        });
}

module.exports = UnifiedTestScenarios;