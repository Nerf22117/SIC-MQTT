// test/productScenarios.js

const RFIDSensor = require('../publishers/rfid-reader/src/rfidSensor');
const WeightSensor = require('../publishers/weight-sensor/src/weightSensor');
const AlertSubscriber = require('../subscribers/alerts/src/alertSubscriber');
const AppSubscriber = require('../subscribers/app/src/appSubscriber');

/**
 * Cenários de Teste para Produtos e Sensores
 * Simula diferentes interações entre RFID e sensores de peso
 */
class ProductTestScenarios {
    /**
     * Executa um cenário específico de teste
     * @param {string} name - Nome do cenário
     * @param {Object} config - Configuração do cenário
     * @returns {Promise<void>}
     */
    static async runScenario(name, config) {
        console.log(`\n=== A iniciar Cenário: ${name} ===\n`);
        console.log(`Descrição: ${config.description || 'N/A'}`);

        const houseUuid = "12345";
        const shelfId = "A1";

        // Componentes do sistema
        let components = {
            rfidSensor: null,
            weightSensor: null,
            alertSystem: null,
            appSystem: null
        };

        try {
            // Inicializar sensores e subscribers
            components = await this.initializeComponents(houseUuid, shelfId, config);

            // Calcular duração do teste
            const testDuration = this.calculateTestDuration(config);

            // Aguardar execução do cenário
            await new Promise(resolve => setTimeout(resolve, testDuration));

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
        const components = {
            rfidSensor: new RFIDSensor(houseUuid, shelfId),
            weightSensor: new WeightSensor(houseUuid, shelfId),
            alertSystem: new AlertSubscriber(),
            appSystem: new AppSubscriber()
        };

        // Configurar sequências de teste
        if (config.rfidSequence) {
            components.rfidSensor.setTestSequence(config.rfidSequence.map(reading => ({
                ...reading,
                type: 'rfid_event',
                shelf_id: shelfId,
                timestamp: new Date().toISOString()
            })));
        }

        if (config.weightSequence) {
            components.weightSensor.setTestSequence(config.weightSequence);
        }

        // Conectar todos os componentes
        await Promise.all([
            components.rfidSensor.connect(),
            components.weightSensor.connect(),
            components.alertSystem.connect(),
            components.appSystem.connect()
        ]);

        return components;
    }

    /**
     * Calcula duração do teste baseada na configuração
     * @param {Object} config - Configuração do cenário
     * @returns {number} Duração em milissegundos
     * @private
     */
    static calculateTestDuration(config) {
        const maxEvents = Math.max(
            config.rfidSequence?.length || 0,
            config.weightSequence?.length || 0
        );
        
        // Base: 1 segundo por evento + 2 segundos de margem
        return (maxEvents * 1000) + 2000;
    }

    /**
     * Limpa recursos dos componentes
     * @param {Object} components - Componentes do sistema
     * @returns {Promise<void>}
     * @private
     */
    static async cleanupComponents(components) {
        for (const [name, component] of Object.entries(components)) {
            if (component && typeof component.cleanup === 'function') {
                try {
                    await component.cleanup();
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
            {
                name: "Adição de Produto Registado",
                description: "Simula adição de um produto registado com peso esperado",
                rfidSequence: [{
                    rfid_tag: "1234567890",
                    action: "add"
                }],
                weightSequence: [0, 1950, 2000]
            },
            {
                name: "Remoção Parcial - Stock Baixo",
                description: "Simula remoção parcial que resulta em alerta de stock baixo",
                rfidSequence: [{
                    rfid_tag: "1234567890",
                    action: "remove"
                }],
                weightSequence: [2000, 1200, 450]
            },
            {
                name: "Produto Não Registado",
                description: "Testa deteção e alerta de produto não registado",
                rfidSequence: [{
                    rfid_tag: "ABCD123456",
                    action: "add"
                }],
                weightSequence: [0, 1450, 1500]
            },
            {
                name: "Reabastecimento",
                description: "Simula reabastecimento de produto com stock baixo",
                rfidSequence: [{
                    rfid_tag: "1234567890",
                    action: "add"
                }],
                weightSequence: [450, 1750, 2000]
            }
        ];

        for (const scenario of scenarios) {
            try {
                await this.runScenario(scenario.name, scenario);
                console.log(`✓ Cenário "${scenario.name}" concluído com sucesso`);
            } catch (error) {
                console.error(`✗ Falha no cenário "${scenario.name}":`, error);
            }
        }
    }
}

// Executar cenários se chamado diretamente
if (require.main === module) {
    ProductTestScenarios.runAllScenarios()
        .catch(error => {
            console.error('Erro durante execução dos testes:', error);
            process.exit(1);
        })
        .finally(() => {
            console.log('\nTestes de produtos concluídos');
            process.exit(0);
        });
}

module.exports = ProductTestScenarios;