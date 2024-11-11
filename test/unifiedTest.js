// test/unifiedTest.js

const TemperatureSensor = require("../publishers/temperature-sensor/src");
const RFIDSensor = require("../publishers/rfid-reader/src");
const WeightSensor = require("../publishers/weight-sensor/src");
const AlertSubscriber = require("../subscribers/alerts/src");
const AppSubscriber = require("../subscribers/app/src");

class UnifiedTestScenarios {
  static async runScenario(name, config) {
    console.log(`\n=== Iniciando Cenário: ${name} ===\n`);

    const houseUuid = "12345";
    const shelfId = "A1";

    // Inicializar sensores e subscribers
    const tempSensor = new TemperatureSensor(houseUuid);
    const rfidSensor = new RFIDSensor(houseUuid, shelfId);
    const weightSensor = new WeightSensor(houseUuid, shelfId);
    const alertSystem = new AlertSubscriber();
    const appSystem = new AppSubscriber();

    // Configurar sequências de teste
    if (config.temperatures) {
      tempSensor.setTestTemperatures(config.temperatures);
    }

    // Configurar sequência RFID com a estrutura correta
    if (config.rfidSequence) {
      const formattedRFIDSequence = config.rfidSequence.map(item => ({
        rfid_tag: item.rfid_tag,
        action: item.action,
        shelf_id: shelfId,
        reader_id: `RFID-${shelfId}`,
        type: 'rfid_event',
        timestamp: new Date().toISOString()
      }));
      rfidSensor.setTestSequence(formattedRFIDSequence);
    }

    if (config.weightSequence) {
      weightSensor.setTestSequence(config.weightSequence);
    }

    // Conectar todos os componentes
    await Promise.all([
      tempSensor.connect(),
      rfidSensor.connect(),
      weightSensor.connect(),
      alertSystem.connect(),
      appSystem.connect()
    ]);

    // Calcular duração do teste
    const maxLength = Math.max(
      config.temperatures?.length || 0,
      config.rfidSequence?.length || 0,
      config.weightSequence?.length || 0
    );
    const testDuration = (maxLength + 2) * 5000;

    // Aguardar execução do cenário
    await new Promise(resolve => setTimeout(resolve, testDuration));

    // Limpar recursos
    tempSensor.cleanup();
    rfidSensor.cleanup();
    weightSensor.cleanup();
    alertSystem.cleanup();
    appSystem.cleanup();

    console.log(`\n=== Fim do Cenário: ${name} ===\n`);
  }

  static async runAllScenarios() {
    try {
      // Cenários de Produtos
      await this.runScenario("Produtos - Adição de Produto Registrado", {
        rfidSequence: [
          { rfid_tag: "1234567890", action: "add" }
        ],
        weightSequence: [0, 1950, 2000],
        temperatures: [15.0, 15.1, 15.0]
      });

      await this.runScenario("Produtos - Remoção Parcial com Alerta de Stock", {
        rfidSequence: [
          { rfid_tag: "1234567890", action: "remove" }
        ],
        weightSequence: [2000, 1200, 450],
        temperatures: [15.0, 15.1, 15.0]
      });

      await this.runScenario("Produtos - Produto Não Registrado", {
        rfidSequence: [
          { rfid_tag: "ABCD123456", action: "add" }
        ],
        weightSequence: [0, 1450, 1500],
        temperatures: [15.0, 15.1, 15.0]
      });

      // Cenários Combinados
      await this.runScenario("Combinado - Temperatura Alta e Movimentação de Produto", {
        temperatures: [16.0, 16.2, 16.3],
        rfidSequence: [
          { rfid_tag: "1234567890", action: "add" }
        ],
        weightSequence: [0, 1800, 2000]
      });

      await this.runScenario("Combinado - Normalização e Reabastecimento", {
        temperatures: [16.2, 15.8, 15.5],
        rfidSequence: [
          { rfid_tag: "1234567890", action: "add" }
        ],
        weightSequence: [450, 1750, 2000]
      });

    } catch (error) {
      console.error("Erro durante execução dos cenários:", error);
    }
  }
}

// Executar todos os cenários se executado diretamente
if (require.main === module) {
  UnifiedTestScenarios.runAllScenarios()
    .catch(console.error)
    .finally(() => process.exit(0));
}

module.exports = UnifiedTestScenarios;