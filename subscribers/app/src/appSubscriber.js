// subscribers/app/src/appSubscriber.js

const mqtt = require('mqtt');
const Config = require('../config/appConfig');

/**
* Subscritor Principal da Aplicação StockWise
* Responsável por monitorizar e processar eventos de todos os sensores,
* mantendo o estado do sistema e correlacionando eventos
*/
class AppSubscriber {
  /**
  * Inicializa o subscritor principal
  */
  constructor() {
    // Componentes principais
    this.client = null;
    
    // Estado do sistema
    this.houseData = new Map();          // Dados por casa
    this.alertStates = new Map();        // Estado dos alertas
    this.lastDisplayTimes = new Map();   // Controlo de apresentação
    this.productStates = new Map();      // Estado dos produtos
    
    // Inicializar estruturas de dados
    this.setupDataStructures();
    
    // Mapa de gestores de mensagens por tipo
    this.messageHandlers = {
      temperature: this.handleTemperatureMessage.bind(this),
      weight: this.handleWeightMessage.bind(this),
      product: this.handleProductMessage.bind(this),
      // alert: this.handleAlertMessage.bind(this)
    };
  }
  
  /**
  * Inicializa as estruturas de dados para todas as casas registadas
  * @private
  */
  setupDataStructures() {
    Object.keys(Config.houseConfigs).forEach(houseUuid => {
      // Inicializar estrutura base da casa
      this.houseData.set(houseUuid, {
        temperature: null,
        lastUpdate: null,
        shelves: new Map(),
        history: {
          temperature: [],
          products: [],
          alerts: [],
          weight_changes: []
        }
      });
      
      // Inicializar estado dos alertas
      this.alertStates.set(houseUuid, {
        temperature: {
          active: false,
          lastAlert: null,
          type: null,
          lastNotification: null,
          normalReadingsCount: 0
        },
        products: new Map()
      });
      
      // Inicializar tempos de apresentação
      this.lastDisplayTimes.set(houseUuid, {
        temperature: null,
        status: null,
        product: new Map()
      });
      
      // Inicializar dados das prateleiras
      this.setupShelvesData(houseUuid);
    });
  }
  
  /**
  * Inicializa dados das prateleiras para uma casa específica
  * @param {string} houseUuid - Identificador da casa
  * @private
  */
  setupShelvesData(houseUuid) {
    const houseConfig = Config.houseConfigs[houseUuid];
    const houseData = this.houseData.get(houseUuid);
    
    houseConfig.shelves.forEach(shelf => {
      houseData.shelves.set(shelf.id, {
        weight: null,
        lastUpdate: null,
        products: new Map(),
        rfidReadings: []
      });
    });
  }
  
  /**
  * Estabelece conexão com o broker MQTT
  * @throws {Error} Se ocorrer erro na conexão
  */
  async connect() {
    try {
      this.client = mqtt.connect(Config.brokerConfig.url, {
        ...Config.brokerConfig.options,
        will: {
          topic: 'system/app/status',
          payload: JSON.stringify({
            status: 'disconnected',
            timestamp: new Date().toISOString()
          }),
          qos: 1,
          retain: true
        }
      });
      
      // Configurar eventos do cliente
      this.client.on('connect', () => {
        console.log('Aplicação conectada ao broker MQTT');
        this.announceStatus('connected');
        this.setupSubscriptions();
      });
      
      this.client.on('message', (topic, message) => {
     
        this.handleMessage(topic, message).catch(error => {
          console.error(`Erro ao processar mensagem: ${error.message}`);
        });
      });
      
      this.client.on('error', error => {
        console.error(`Erro na conexão MQTT: ${error.message}`);
        this.cleanup();
      });
      
      // Iniciar limpeza automática do histórico
      this.startHistoryCleanup();
      
    } catch (error) {
      console.error(`Erro ao conectar aplicação: ${error.message}`);
      throw error;
    }
  }
  
  /**
  * Anuncia estado do sistema
  * @param {string} status - Estado a anunciar
  * @private
  */
  announceStatus(status) {
    if (!this.client) return;
    
    this.client.publish(
      'system/app/status',
      JSON.stringify({
        status,
        timestamp: new Date().toISOString()
      }),
      { qos: 1, retain: true }
    );
  }
  
  /**
  * Configura as subscrições MQTT iniciais
  * @private
  */
  setupSubscriptions() {
    Object.keys(Config.houseConfigs).forEach(houseUuid => {
      // Subscrever tópicos base
      const baseTopic = Config.formatTopic(Config.topicPatterns.BASE, { 
        house_uuid: houseUuid 
      });
      this.subscribeTopic(`${baseTopic}/#`);
      
      // Configurar subscrições para cada prateleira
      this.setupShelfTopics(houseUuid);
    });
  }
  
  /**
  * Configura tópicos para prateleiras de uma casa
  * @param {string} houseUuid - Identificador da casa
  * @private
  */
  setupShelfTopics(houseUuid) {
    const houseConfig = Config.houseConfigs[houseUuid];
    if (!houseConfig?.shelves) {
      console.warn(`Configuração de prateleiras não encontrada para casa ${houseUuid}`);
      return;
    }
    
    houseConfig.shelves.forEach(shelf => {
      // Subscrever tópicos de peso
      const weightTopic = Config.formatTopic(Config.topicPatterns.SHELF_WEIGHT, {
        house_uuid: houseUuid,
        shelf_id: shelf.id
      });
      this.subscribeTopic(weightTopic);
      
      // Subscrever tópicos de produtos
      const productTopic = Config.formatTopic(Config.topicPatterns.SHELF_PRODUCTS, {
        house_uuid: houseUuid,
        shelf_id: shelf.id
      });
      this.subscribeTopic(productTopic);
    });
  }
  
    /**
     * Subscreve um tópico específico
     * @param {string} topic - Tópico a subscrever
     * @throws {Error} Se ocorrer erro na subscrição
     */
    subscribeTopic(topic) {
      if (!this.client) {
          throw new Error('Cliente MQTT não inicializado');
      }
  
      this.client.subscribe(topic, { qos: 1 }, error => {
          if (error) {
              console.error(`Erro ao subscrever ${topic}: ${error.message}`);
              throw error;
          }
          
          if (Config.environmentConfig.isDevelopment) {
              console.log(`Subscrito ao tópico: ${topic}`);
          }
      });
  }

  /**
  * Processa mensagens recebidas
  * @param {string} topic - Tópico da mensagem
  * @param {Buffer} message - Conteúdo da mensagem
  * @throws {Error} Se ocorrer erro no processamento
  */
  async handleMessage(topic, message) {
    try {

      // Extrair identificadores do tópico
      const houseUuid = this.extractHouseUuid(topic);
      const shelfId = this.extractShelfId(topic);
      
      if (!houseUuid || !this.houseData.has(houseUuid)) {
        console.warn(`UUID de casa inválido ou não encontrado: ${houseUuid}`);
        return;
      }
      
      // Processar mensagem conforme o tipo
      const data = JSON.parse(message.toString());
      
      if (this.isTemperatureTopic(topic)) {
        await this.handleTemperatureMessage(houseUuid, data);
      } else if (this.isWeightTopic(topic) && shelfId) {
        await this.handleWeightMessage(houseUuid, shelfId, data);
      } else if (this.isProductTopic(topic) && shelfId) {
        await this.handleProductMessage(houseUuid, shelfId, data);
      } 
      /*           else if (this.isAlertTopic(topic)) {
      await this.handleAlertMessage(houseUuid, data);
      } */
    } catch (error) {
      console.error(`Erro ao processar mensagem: ${error.message}`);
      if (error instanceof SyntaxError) {
        console.error("Mensagem inválida:", message.toString());
      }
      throw error;
    }
  }
  

/**
 * Extrai o UUID da casa do tópico MQTT
 * @param {string} topic - Tópico MQTT completo
 * @returns {string|null} UUID da casa ou null se não encontrado
 * @private
 */
extractHouseUuid(topic) {
  // Exemplo de tópico: house/12345/temperature
  const match = topic.match(/house\/([^/]+)/);
  return match ? match[1] : null;
}

/**
 * Extrai o ID da prateleira do tópico MQTT
 * @param {string} topic - Tópico MQTT completo
 * @returns {string|null} ID da prateleira ou null se não encontrado
 * @private
 */
extractShelfId(topic) {
  // Exemplo de tópico: stockwise/houses/{house_uuid}/shelves/{shelf_id}/weight
  const match = topic.match(/shelves\/([^/]+)/);
  return match ? match[1] : null;
}

/**
 * Verifica se o tópico é relacionado à temperatura
 * @param {string} topic - Tópico MQTT completo
 * @returns {boolean} Verdadeiro se for tópico de temperatura
 * @private
 */
isTemperatureTopic(topic) {
  // Exemplo de tópico: house/12345/temperature
  return topic.endsWith('/temperature');
}

/**
 * Verifica se o tópico é relacionado a peso
 * @param {string} topic - Tópico MQTT completo
 * @returns {boolean} Verdadeiro se for tópico de peso
 * @private
 */
isWeightTopic(topic) {
  return topic.endsWith('/weight');
}

/**
 * Verifica se o tópico é relacionado a produtos
 * @param {string} topic - Tópico MQTT completo
 * @returns {boolean} Verdadeiro se for tópico de produtos
 * @private
 */
isProductTopic(topic) {
  return topic.endsWith('/products');
}

  /**
  * Processa mensagens de temperatura
  * @param {string} houseUuid - Identificador da casa
  * @param {Object} data - Dados de temperatura
  * @private
  */
  async handleTemperatureMessage(houseUuid, data) {
    const houseData = this.houseData.get(houseUuid);
    const alertState = this.alertStates.get(houseUuid).temperature;
    const temperature = parseFloat(data.temperature);
    const thresholds = this.getHouseAlertThresholds(houseUuid);
    const previousTemp = houseData.temperature;
    
    // Validar temperatura
    if (isNaN(temperature)) {
      console.error(`Temperatura inválida recebida: ${data.temperature}`);
      return;
    }
    
    // Atualizar dados de temperatura
    houseData.temperature = temperature;
    houseData.lastUpdate = new Date(data.timestamp || new Date());
    
    // Verificar se temperatura está dentro dos limites normais
    const isNormal = this.isTemperatureNormal(temperature, thresholds);
    
    if (isNormal) {
      alertState.normalReadingsCount++;
      if (alertState.active && alertState.normalReadingsCount >= 3) {
        this.normalizeTemperatureState(houseUuid, temperature);
      }
    } else {
      alertState.normalReadingsCount = 0;
      // Verificar necessidade de alerta
      await this.checkTemperatureAlert(houseUuid, temperature, thresholds);
    }
    
    // Apresentar atualização se necessário
    if (this.shouldDisplayTemperature(temperature, previousTemp, houseUuid)) {
      this.displayTemperature(houseUuid, temperature, thresholds);
      this.updateLastDisplayTime(houseUuid, 'temperature');
    }
    
    // Adicionar ao histórico
    this.addToHistory(houseUuid, 'temperature', {
      value: temperature,
      timestamp: data.timestamp || new Date().toISOString(),
      isNormal
    });
  }

  /**
 * Obtém os limiares de alerta de temperatura para uma casa
 * @param {string} houseUuid - Identificador da casa
 * @returns {Object} Limiares de temperatura
 * @private
 */
getHouseAlertThresholds(houseUuid) {
  const houseConfig = Config.houseConfigs[houseUuid];
  if (!houseConfig?.temperature) {
    throw new Error(`Configuração de temperatura não encontrada para casa ${houseUuid}`);
  }

  return {
    min: houseConfig.temperature.min,
    max: houseConfig.temperature.max,
    bufferZone: houseConfig.temperature.bufferZone
  };
}
  
  /**
  * Processa e apresenta atualização de temperatura
  * @param {string} houseUuid - Identificador da casa
  * @param {number} temperature - Temperatura atual
  * @param {Object} thresholds - Limites de temperatura
  * @private
  */
  displayTemperature(houseUuid, temperature, thresholds) {
    console.log(`
[Casa ${houseUuid}] 🌡️ Atualização de Temperatura
Temperatura: ${Config.formatTemperature(temperature)}°C
Limites: ${thresholds.min}°C - ${thresholds.max}°C
Timestamp: ${new Date().toLocaleString()}
`);
    }
    
    /**
    * Verifica se a temperatura está dentro dos limites normais
    * @param {number} temperature - Temperatura atual
    * @param {Object} thresholds - Limites de temperatura
    * @returns {boolean} Verdadeiro se temperatura normal
    * @private
    */
    isTemperatureNormal(temperature, thresholds) {
      const minTemp = thresholds.min + thresholds.bufferZone;
      const maxTemp = thresholds.max - thresholds.bufferZone;
      return temperature >= minTemp && temperature <= maxTemp;
    }
    
    /**
    * Verifica necessidade de gerar alerta de temperatura
    * @param {string} houseUuid - Identificador da casa
    * @param {number} temperature - Temperatura atual
    * @param {Object} thresholds - Limites de temperatura
    * @private
    */
    async checkTemperatureAlert(houseUuid, temperature, thresholds) {
      const alertState = this.alertStates.get(houseUuid).temperature;
      const now = Date.now();
      
      // Verificar período de cooldown
      if (alertState.lastNotification && 
        (now - alertState.lastNotification) < Config.notificationConfig.alerts.temperature.minTimeBetweenNotifications) {
          return;
        }
        
        // Determinar tipo de alerta
        const alertType = temperature > thresholds.max ? 'high_temperature' : 'low_temperature';
        const threshold = temperature > thresholds.max ? thresholds.max : thresholds.min;
        
        // Gerar alerta
        alertState.active = true;
        alertState.lastAlert = now;
        alertState.type = alertType;
        alertState.lastNotification = now;
        
        // Criar mensagem de alerta
        const alert = {
          type: alertType,
          temperature,
          threshold,
          timestamp: new Date().toISOString(),
          readings_history: this.getRecentTemperatureReadings(houseUuid)
        };
        
        // Adicionar ao histórico e apresentar
        this.addToHistory(houseUuid, 'alerts', alert);
        this.displayTemperatureAlert(houseUuid, alert);
      }
      
      /**
      * Obtém leituras recentes de temperatura
      * @param {string} houseUuid - Identificador da casa
      * @param {number} count - Número de leituras a retornar
      * @returns {number[]} Array de temperaturas recentes
      * @private
      */
      getRecentTemperatureReadings(houseUuid, count = 5) {
        const history = this.houseData.get(houseUuid).history.temperature;
        return history
        .slice(-count)
        .map(reading => reading.value);
      }
      
      /**
      * Normaliza estado de temperatura após período de alerta
      * @param {string} houseUuid - Identificador da casa
      * @param {number} temperature - Temperatura atual
      * @private
      */
      normalizeTemperatureState(houseUuid, temperature) {
        const alertState = this.alertStates.get(houseUuid).temperature;
        const thresholds = this.getHouseAlertThresholds(houseUuid);
        
        alertState.active = false;
        alertState.type = null;
        
        console.log(`
[Casa ${houseUuid}] ✓ Temperatura normalizada após ${alertState.normalReadingsCount} leituras normais
Temperatura atual: ${Config.formatTemperature(temperature)}°C
Limites: ${thresholds.min}°C - ${thresholds.max}°C
Zona de buffer: ±${thresholds.bufferZone}°C
`);
          
          alertState.normalReadingsCount = 0;
        }
        
        /**
        * Verifica se deve apresentar atualização de temperatura
        * @param {number} temperature - Nova temperatura
        * @param {number} previousTemp - Temperatura anterior
        * @param {string} houseUuid - Identificador da casa
        * @returns {boolean} Verdadeiro se deve apresentar
        * @private
        */
        shouldDisplayTemperature(temperature, previousTemp, houseUuid) {
          const alertState = this.alertStates.get(houseUuid).temperature;
          if (alertState.active) return false;
          
          const lastDisplayTime = this.lastDisplayTimes.get(houseUuid).temperature;
          return Config.shouldDisplayTemperature(temperature, previousTemp, lastDisplayTime);
        }
        
        /**
        * Atualiza timestamp da última apresentação
        * @param {string} houseUuid - Identificador da casa
        * @param {string} type - Tipo de apresentação
        * @private
        */
        updateLastDisplayTime(houseUuid, type) {
          const displayTimes = this.lastDisplayTimes.get(houseUuid);
          if (displayTimes) {
            displayTimes[type] = Date.now();
          }
        }
        
        /**
        * Processa mensagens de peso
        * @param {string} houseUuid - Identificador da casa
        * @param {string} shelfId - Identificador da prateleira
        * @param {Object} data - Dados do sensor de peso
        * @private
        */
        async handleWeightMessage(houseUuid, shelfId, data) {
          const shelfData = this.houseData.get(houseUuid)?.shelves.get(shelfId);
          if (!shelfData) {
            console.error(`Dados da prateleira não encontrados: ${shelfId}`);
            return;
          }
          
          // Validar dados de peso
          const weight = parseFloat(data.weight);
          if (isNaN(weight)) {
            console.error(`Peso inválido recebido: ${data.weight}`);
            return;
          }
          
          const previousWeight = shelfData.weight;
          shelfData.weight = weight;
          shelfData.lastUpdate = new Date(data.timestamp || new Date());
          
          // Processar apenas leituras estáveis
          if (data.is_stable) {
            const weightChange = weight - (previousWeight || 0);
            const minWeightChange = Config.dataManagementConfig.products.minWeightChange;
            
            if (Math.abs(weightChange) >= minWeightChange) {
              // Correlacionar com eventos RFID recentes
              const recentRFIDEvents = this.correlateRFIDEvents(
                shelfData.rfidReadings,
                data.timestamp,
                Config.eventCorrelationConfig.timeWindow
              );
              
              if (Config.environmentConfig.isDevelopment) {
                console.log(`
Alteração de peso detetada:
Prateleira: ${shelfId}
Variação: ${weightChange.toFixed(1)}g
Eventos RFID correlacionados: ${recentRFIDEvents.length}
`);
                }
                
                await this.processWeightChange(houseUuid, shelfId, weightChange, data, recentRFIDEvents);
              }
            }
          }
          
          /**
          * Processa alterações significativas de peso
          * @param {string} houseUuid - Identificador da casa
          * @param {string} shelfId - Identificador da prateleira
          * @param {number} weightChange - Variação de peso
          * @param {Object} data - Dados completos da leitura
          * @param {Array} correlatedEvents - Eventos RFID correlacionados
          * @private
          */
          async processWeightChange(houseUuid, shelfId, weightChange, data, correlatedEvents) {
            const shelfData = this.houseData.get(houseUuid).shelves.get(shelfId);
            const houseConfig = Config.houseConfigs[houseUuid];
            
            // Verificar eventos correlacionados
            if (correlatedEvents.length > 0) {
              for (const event of correlatedEvents) {
                const product = this.findProduct(houseUuid, event.rfid_tag);
                if (product) {
                  await this.validateProductWeight(houseUuid, shelfId, product, weightChange, event);
                }
              }
            }
            
            // Verificar produtos ativos na prateleira
            for (const [productId, state] of shelfData.products.entries()) {
              const product = houseConfig.products.find(p => p.id === productId);
              if (product && state.lastAction === 'add') {
                // Atualizar peso estimado
                const estimatedWeight = Math.max(0, data.weight - (product.container_weight || 0));
                state.weight = estimatedWeight;
                
                // Verificar stock baixo e gerar alerta se necessário
                if (estimatedWeight <= product.min_stock) {
                  await this.handleLowStock(houseUuid, shelfId, product, estimatedWeight);
                }
              }
            }
            
            // Adicionar ao histórico
            this.addToHistory(houseUuid, 'weight_changes', {
              shelf_id: shelfId,
              change: weightChange,
              total_weight: data.weight,
              timestamp: data.timestamp || new Date().toISOString(),
              correlated_events: correlatedEvents.length
            });
          }
          
          /**
          * Valida peso do produto contra evento RFID
          * @param {string} houseUuid - Identificador da casa
          * @param {string} shelfId - Identificador da prateleira
          * @param {Object} product - Dados do produto
          * @param {number} weightChange - Variação de peso detetada
          * @param {Object} rfidEvent - Evento RFID correlacionado
          * @private
          */
          async validateProductWeight(houseUuid, shelfId, product, weightChange, rfidEvent) {
            const expectedWeight = rfidEvent.action === 'add' ? 
            product.container_weight : 
            -product.container_weight;
            
            const weightDeviation = Math.abs(weightChange - expectedWeight);
            const maxDeviation = Config.dataManagementConfig.products.maxWeightDeviation;
            
            if (weightDeviation > maxDeviation) {
              // Gerar alerta de divergência de peso
              const alert = {
                type: 'weight_mismatch',
                product_id: product.id,
                product_name: product.name,
                shelf_id: shelfId,
                expected_weight: expectedWeight,
                actual_weight: weightChange,
                details: `Desvio de ${weightDeviation.toFixed(1)}g detetado`
              };
              
              await this.displayProductAlert(houseUuid, alert);
              this.addToHistory(houseUuid, 'alerts', alert);
            }
          }
          
          /**
          * Processa mensagens RFID
          * @param {string} houseUuid - Identificador da casa
          * @param {string} shelfId - Identificador da prateleira
          * @param {Object} data - Dados do sensor RFID
          * @private
          */
          async handleProductMessage(houseUuid, shelfId, data) {
            const shelfData = this.houseData.get(houseUuid)?.shelves.get(shelfId);
            if (!shelfData) return;
            
            // Processar evento RFID
            if (data.type === "rfid_event") {
              const product = this.findProduct(houseUuid, data.rfid_tag);
              
              if (product) {
                await this.handleRegisteredProduct(houseUuid, shelfId, product, data);
              } else {
                await this.handleUnregisteredProduct(houseUuid, shelfId, data);
              }
              
              // Adicionar ao histórico de leituras RFID
              this.updateRFIDReadings(shelfData, data);
            }
          }
          
          /**
          * Atualiza histórico de leituras RFID
          * @param {Object} shelfData - Dados da prateleira
          * @param {Object} data - Dados da leitura RFID
          * @private
          */
          updateRFIDReadings(shelfData, data) {
            shelfData.rfidReadings.push({
              rfid_tag: data.rfid_tag,
              action: data.action,
              timestamp: data.timestamp
            });
            
            // Limitar tamanho do histórico
            if (shelfData.rfidReadings.length > Config.displayConfig.maxHistoryItems) {
              shelfData.rfidReadings.splice(
                0, 
                shelfData.rfidReadings.length - Config.displayConfig.maxHistoryItems
              );
            }
          }
          
          /**
          * Processa produto registado
          * @param {string} houseUuid - Identificador da casa
          * @param {string} shelfId - Identificador da prateleira
          * @param {Object} product - Dados do produto
          * @param {Object} data - Dados do evento RFID
          * @private
          */
          async handleRegisteredProduct(houseUuid, shelfId, product, data) {
            const shelfData = this.houseData.get(houseUuid).shelves.get(shelfId);
            const productState = this.getOrCreateProductState(shelfData, product.id);
            
            // Atualizar estado do produto
            productState.lastAction = data.action;
            productState.lastUpdate = new Date(data.timestamp);
            
            // Atualizar histórico de movimentações
            this.updateProductMovementHistory(productState, data);
            
            // Adicionar ao histórico geral
            this.addToHistory(houseUuid, "products", {
              product_id: product.id,
              name: product.name,
              action: data.action,
              shelf_id: shelfId,
              timestamp: data.timestamp
            });
            
            // Apresentar movimentação
            this.displayProductMovement(houseUuid, shelfId, product, data.action);
          }
          
          /**
          * Obtém ou cria estado de um produto
          * @param {Object} shelfData - Dados da prateleira
          * @param {string} productId - Identificador do produto
          * @returns {Object} Estado do produto
          * @private
          */
          getOrCreateProductState(shelfData, productId) {
            if (!shelfData.products.has(productId)) {
              shelfData.products.set(productId, {
                lastAction: null,
                lastUpdate: null,
                weight: 0,
                movementHistory: []
              });
            }
            return shelfData.products.get(productId);
          }
          
          /**
          * Atualiza histórico de movimentações de um produto
          * @param {Object} productState - Estado do produto
          * @param {Object} data - Dados do evento
          * @private
          */
          updateProductMovementHistory(productState, data) {
            productState.movementHistory.push({
              action: data.action,
              timestamp: data.timestamp
            });
            
            // Limitar tamanho do histórico
            if (productState.movementHistory.length > Config.displayConfig.maxHistoryItems) {
              productState.movementHistory.splice(
                0, 
                productState.movementHistory.length - Config.displayConfig.maxHistoryItems
              );
            }
          }
          
          /**
          * Processa produto não registado
          * @param {string} houseUuid - Identificador da casa
          * @param {string} shelfId - Identificador da prateleira
          * @param {Object} data - Dados do evento RFID
          * @private
          */
          async handleUnregisteredProduct(houseUuid, shelfId, data) {
            if (data.action === "add") {
              const alert = {
                type: 'unregistered_product',
                shelf_id: shelfId,
                rfid_tag: data.rfid_tag,
                timestamp: new Date().toISOString()
              };
              
              // Apresentar alerta e adicionar ao histórico
              await this.displayProductAlert(houseUuid, alert);
              this.addToHistory(houseUuid, 'alerts', alert);
            }
          }
          /**
          * Adiciona evento ao histórico
          * @param {string} houseUuid - Identificador da casa
          * @param {string} type - Tipo de evento
          * @param {Object} data - Dados do evento
          * @private
          */
          addToHistory(houseUuid, type, data) {
            const houseData = this.houseData.get(houseUuid);
            if (!houseData) {
              console.warn(`Dados da casa ${houseUuid} não encontrados`);
              return;
            }
            
            // Garantir que o tipo de histórico existe
            if (!houseData.history[type]) {
              houseData.history[type] = [];
            }
            
            // Adicionar novo evento
            const newItem = {
              ...data,
              timestamp: data.timestamp || new Date().toISOString()
            };
            
            houseData.history[type].push(newItem);
            
            // Limitar tamanho do histórico
            const maxItems = this.getMaxHistoryItems(type);
            if (houseData.history[type].length > maxItems) {
              houseData.history[type] = houseData.history[type].slice(-maxItems);
            }
          }
          
          /**
          * Obtém número máximo de itens para cada tipo de histórico
          * @param {string} type - Tipo de histórico
          * @returns {number} Número máximo de itens
          * @private
          */
          getMaxHistoryItems(type) {
            switch(type) {
              case 'weight_changes':
              return 100;  // Mantém mais entradas para mudanças de peso
              case 'temperature':
              return 50;   // Mantém menos entradas para temperatura
              default:
              return Config.displayConfig.maxHistoryItems;
            }
          }
          
          /**
          * Inicia limpeza periódica do histórico
          * @private
          */
          startHistoryCleanup() {
            setInterval(() => {
              const maxAge = Date.now() - Config.dataManagementConfig.history.maxStorageTime;
              
              this.houseData.forEach((house, houseUuid) => {
                Object.keys(house.history).forEach(type => {
                  // Remover eventos antigos
                  house.history[type] = house.history[type].filter(item => 
                    new Date(item.timestamp).getTime() > maxAge
                  );
                  
                  // Verificar e corrigir timestamps inválidos
                  house.history[type].forEach(item => {
                    if (isNaN(new Date(item.timestamp).getTime())) {
                      item.timestamp = new Date().toISOString();
                      console.warn(`Timestamp inválido corrigido em ${type} para casa ${houseUuid}`);
                    }
                  });
                });
              });
            }, Config.dataManagementConfig.history.cleanupInterval);
          }
          
          /**
          * Correlaciona eventos RFID com alterações de peso
          * @param {Array} readings - Leituras RFID
          * @param {string} timestamp - Timestamp do evento
          * @param {number} timeWindow - Janela de tempo em ms
          * @returns {Array} Eventos correlacionados
          * @private
          */
          correlateRFIDEvents(readings, timestamp, timeWindow = 5000) {
            const eventTime = new Date(timestamp).getTime();
            const recentEvents = readings.filter(reading => 
              Math.abs(new Date(reading.timestamp).getTime() - eventTime) <= timeWindow
            );
            
            // Log de correlação para debug
            if (Config.environmentConfig.isDevelopment && recentEvents.length > 0) {
              console.log(`
Eventos RFID correlacionados:
Timestamp referência: ${new Date(timestamp).toLocaleString()}
Eventos encontrados: ${recentEvents.length}
Janela de tempo: ${timeWindow}ms
`);
              }
              
              return recentEvents;
            }
            
            /**
            * Processa alerta de stock baixo
            * @param {string} houseUuid - Identificador da casa
            * @param {string} shelfId - Identificador da prateleira
            * @param {Object} product - Dados do produto
            * @param {number} currentWeight - Peso atual
            * @private
            */
            async handleLowStock(houseUuid, shelfId, product, currentWeight) {
              const alertState = this.alertStates.get(houseUuid).products.get(product.id);
              const now = Date.now();
              const cooldown = Config.notificationConfig.alerts.product.minTimeBetweenNotifications;
              
              if (!alertState || (now - alertState.lastNotification >= cooldown)) {
                const alert = {
                  type: 'low_stock',
                  product_id: product.id,
                  product_name: product.name,
                  shelf_id: shelfId,
                  current_weight: currentWeight,
                  min_stock: product.min_stock,
                  timestamp: new Date().toISOString()
                };
                
                // Apresentar alerta e adicionar ao histórico
                await this.displayProductAlert(houseUuid, alert);
                this.addToHistory(houseUuid, 'alerts', alert);
                
                // Atualizar estado do alerta
                this.alertStates.get(houseUuid).products.set(product.id, {
                  lastNotification: now,
                  type: 'low_stock'
                });
              }
            }
            
            /**
            * Apresenta movimentação de produto
            * @param {string} houseUuid - Identificador da casa
            * @param {string} shelfId - Identificador da prateleira
            * @param {Object} product - Dados do produto
            * @param {string} action - Tipo de ação
            * @private
            */
            displayProductMovement(houseUuid, shelfId, product, action) {
              const actionText = action === "add" ? "adicionado à" : "removido da";
              console.log(`
[Casa ${houseUuid}] 📦 Produto ${actionText} prateleira
Produto: ${product.name}
Prateleira: ${shelfId}
Timestamp: ${new Date().toLocaleString()}
`);
              }
              
              /**
              * Apresenta alerta de produto
              * @param {string} houseUuid - Identificador da casa
              * @param {Object} data - Dados do alerta
              * @private
              */
              displayProductAlert(houseUuid, data) {
                const alertTypes = {
                  "low_stock": "Stock Baixo",
                  "weight_mismatch": "Divergência de Peso",
                  "unregistered_product": "Produto Não Registado"
                };
                
                const alertMessage = `
[ALERTA - Casa ${houseUuid}] ⚠️ ${alertTypes[data.type]}
                ${data.product_name ? `Produto: ${data.product_name}` : `Tag RFID: ${data.rfid_tag}`}
Prateleira: ${data.shelf_id}
                ${data.current_weight ? `Peso atual: ${data.current_weight.toFixed(1)}g` : ''}
                ${data.min_stock ? `Stock mínimo: ${data.min_stock}g` : ''}
                ${data.details ? `\nDetalhes: ${data.details}` : ''}
Timestamp: ${new Date(data.timestamp).toLocaleString()}
`;
                
                console.log(alertMessage);
                
                // Notificar através do sistema de eventos se em modo de desenvolvimento
                if (Config.environmentConfig.isDevelopment) {
                  this.announceStatus('alert', {
                    house_uuid: houseUuid,
                    alert_type: data.type,
                    details: alertMessage
                  });
                }
              }
              
              /**
              * Apresenta alerta de temperatura
              * @param {string} houseUuid - Identificador da casa
              * @param {Object} data - Dados do alerta
              * @private
              */
              displayTemperatureAlert(houseUuid, data) {
                const tempType = data.type === "high_temperature" ? "alta" : "baixa";
                console.log(`
[ALERTA - Casa ${houseUuid}] ❗ Temperatura ${tempType} detetada
Temperatura: ${Config.formatTemperature(data.temperature)}°C (Limite: ${data.threshold}°C)
                  ${data.readings_history ? 
                    `Últimas leituras: ${data.readings_history.map(t => 
      Config.formatTemperature(t)).join(", ")}°C` : 
                      ''}
                    
ℹ️ Sistema aguardará 3 leituras normais consecutivas para normalizar o estado.
`);
                  }
                  
                  /**
                  * Limpa recursos e encerra conexões
                  */
                  cleanup() {
                    if (this.client) {
                      try {
                        this.announceStatus('disconnecting');
                        this.client.end(true);
                      } catch (error) {
                        console.error(`Erro ao limpar recursos: ${error.message}`);
                      }
                    }
                  }
                }
                
                // Exportar classe
                module.exports = AppSubscriber;