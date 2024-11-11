// test/productScenarios.js

const RFIDSensor = require('../publishers/rfid-reader/src');
const WeightSensor = require('../publishers/weight-sensor/src');
const AlertSubscriber = require('../subscribers/alerts/src');
const AppSubscriber = require('../subscribers/app/src');

class ProductTestScenarios {
    static async runScenario(name, config) {
      console.log(`\n=== Iniciando Cenário: ${name} ===\n`);
  
      const houseUuid = "12345";
      const shelfId = "A1";
  
      // Inicializar sensores e subscribers
      const rfidSensor = new RFIDSensor(houseUuid, shelfId);
      const weightSensor = new WeightSensor(houseUuid, shelfId);
      const alertSystem = new AlertSubscriber();
      const appSystem = new AppSubscriber();
  
      // Configurar sequências de teste
      if (config.rfidSequence) {
        rfidSensor.setTestSequence(config.rfidSequence.map(reading => ({
          ...reading,
          type: 'rfid_event',
          shelf_id: shelfId,
          timestamp: new Date().toISOString()
        })));
      }
  
      if (config.weightSequence) {
        weightSensor.setTestSequence(config.weightSequence);
      }
  
      // Conectar componentes
      await Promise.all([
        rfidSensor.connect(),
        weightSensor.connect(),
        alertSystem.connect(),
        appSystem.connect()
      ]);
  
      // Calcular duração do teste
      const testDuration = Math.max(
        config.rfidSequence?.length || 0,
        config.weightSequence?.length || 0
      ) * 1000 + 2000; // 1 segundo por evento + 2 segundos de margem
  
      // Aguardar execução
      await new Promise(resolve => setTimeout(resolve, testDuration));
  
      // Limpar recursos
      console.log(`\n=== Finalizando Cenário: ${name} ===\n`);
      rfidSensor.cleanup();
      weightSensor.cleanup();
      alertSystem.cleanup();
      appSystem.cleanup();
    }
  
    static async runAllScenarios() {
      try {
        // Cenário 1: Adição de Produto Registrado
        await this.runScenario("Adição de Produto Registrado", {
          rfidSequence: [{
            rfid_tag: "1234567890",
            action: "add"
          }],
          weightSequence: [0, 1950, 2000]
        });
  
        // Cenário 2: Remoção Parcial - Stock Baixo
        await this.runScenario("Remoção Parcial - Stock Baixo", {
          rfidSequence: [{
            rfid_tag: "1234567890",
            action: "remove"
          }],
          weightSequence: [2000, 1200, 450]
        });
  
        // Cenário 3: Produto Não Registrado
        await this.runScenario("Produto Não Registrado", {
          rfidSequence: [{
            rfid_tag: "ABCD123456",
            action: "add"
          }],
          weightSequence: [0, 1450, 1500]
        });
  
        // Cenário 4: Reabastecimento
        await this.runScenario("Reabastecimento de Produto", {
          rfidSequence: [{
            rfid_tag: "1234567890",
            action: "add"
          }],
          weightSequence: [450, 1750, 2000]
        });
  
      } catch (error) {
        console.error("Erro durante execução dos cenários:", error);
      }
    }
  }

// Executar cenários se chamado diretamente
if (require.main === module) {
    ProductTestScenarios.runAllScenarios()
        .catch(console.error)
        .finally(() => process.exit(0));
}

module.exports = ProductTestScenarios;