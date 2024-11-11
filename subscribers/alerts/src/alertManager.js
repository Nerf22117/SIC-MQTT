// subscribers/alerts/src/alertManager.js

const Config = require('../config/alertConfig');
const WeightSensorConfig = require('../../../publishers/weight-sensor/config/weightSensorConfig');

/**
 * Gestor de Alertas do Sistema StockWise
 * Responsável pela análise e geração de alertas baseados em eventos dos sensores
 */
class AlertManager {
    /**
     * Inicializa o gestor de alertas
     */
    constructor() {
        // Estado do sistema
        this.alertCache = new Map();        // Cache de alertas ativos
        this.temperatureReadings = new Map(); // Histórico de temperaturas
        this.pendingEvents = new Map();     // Eventos pendentes para correlação
        this.productStates = new Map();     // Estado atual dos produtos
        this.weightReadings = new Map();    // Leituras de peso por prateleira

        // Configurar limpeza automática
        this.setupCacheCleanup();
        this.setupEventCleanup();

        // Garantir acesso às constantes de peso
        this.weightConstants = WeightSensorConfig.WEIGHT_CONSTANTS;
    }

    /**
     * Configura limpeza periódica do cache de alertas
     * @private
     */
    setupCacheCleanup() {
        setInterval(() => {
            const now = Date.now();
            for (const [key, alert] of this.alertCache) {
                const cooldown = alert.type.includes('temperature') 
                    ? Config.alertConfig.types.TEMPERATURE.cooldown
                    : Config.alertConfig.types.PRODUCT.cooldown;
                    
                if (now - alert.timestamp > cooldown) {
                    this.alertCache.delete(key);
                }
            }
        }, Config.eventCorrelationConfig.cleanupInterval);
    }

    /**
     * Configura limpeza periódica de eventos pendentes
     * @private
     */
    setupEventCleanup() {
        setInterval(() => {
            const now = Date.now();
            for (let [key, event] of this.pendingEvents) {
                if (now - event.timestamp > Config.eventCorrelationConfig.timeWindow) {
                    this.pendingEvents.delete(key);
                }
            }
        }, Config.eventCorrelationConfig.cleanupInterval);
    }

    /**
     * Processa eventos RFID
     * @param {string} houseUuid - Identificador da casa
     * @param {Object} data - Dados do evento RFID
     */
    handleRFIDEvent(houseUuid, data) {
        const eventKey = `${houseUuid}_${data.shelf_id}_${data.rfid_tag}`;
        this.pendingEvents.set(eventKey, {
            type: 'rfid',
            data: data,
            timestamp: Date.now()
        });
        this.correlateEvents(eventKey, houseUuid);
    }

    /**
     * Processa eventos de peso
     * @param {string} houseUuid - Identificador da casa
     * @param {Object} data - Dados do evento de peso
     */
    handleWeightEvent(houseUuid, data) {
        if (!data || !data.is_stable) return;

        // Armazenar leitura de peso
        this.weightReadings.set(data.shelf_id, {
            weight: data.weight,
            timestamp: new Date(data.timestamp)
        });

        // Verificar alterações significativas
        const previousReading = this.getPreviousWeight(data.shelf_id);
        if (Math.abs(data.weight - previousReading) >= this.weightConstants.MIN_WEIGHT_CHANGE) {
            this.checkPendingEventsForShelf(houseUuid, data.shelf_id);
        }
    }

    /**
     * Verifica eventos pendentes para uma prateleira
     * @param {string} houseUuid - Identificador da casa
     * @param {string} shelfId - Identificador da prateleira
     * @private
     */
    checkPendingEventsForShelf(houseUuid, shelfId) {
        for (let [key, event] of this.pendingEvents) {
            if (key.includes(`${houseUuid}_${shelfId}`)) {
                this.correlateEvents(key, houseUuid);
            }
        }
    }

    /**
     * Obtém peso anterior de uma prateleira
     * @param {string} shelfId - Identificador da prateleira
     * @returns {number} Peso anterior ou 0
     * @private
     */
    getPreviousWeight(shelfId) {
        const reading = this.weightReadings.get(shelfId);
        return reading ? reading.weight : 0;
    }

    /**
     * Processa produtos não registados
     * @param {string} houseUuid - Identificador da casa
     * @param {Object} event - Evento RFID
     * @param {Object} weightData - Dados de peso
     * @returns {Object|null} Alerta gerado ou null
     * @private
     */
    handleUnregisteredProduct(houseUuid, event, weightData) {
        if (event.data.action !== "add") return;

        const previousWeight = this.getPreviousWeight(event.data.shelf_id);
        const weightChange = Math.abs(weightData.weight - previousWeight);

        if (weightChange < this.weightConstants.MIN_WEIGHT_CHANGE) {
            console.debug('Alteração de peso insignificante para produto não registado');
            return;
        }

        return this.generateAlert({
            type: 'unregistered_product',
            severity: 'medium',
            house_uuid: houseUuid,
            shelf_id: event.data.shelf_id,
            rfid_tag: event.data.rfid_tag,
            weight_change: weightChange,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Correlaciona eventos RFID com alterações de peso
     * @param {string} eventKey - Chave do evento
     * @param {string} houseUuid - Identificador da casa
     * @private
     */
    correlateEvents(eventKey, houseUuid) {
        const event = this.pendingEvents.get(eventKey);
        if (!event || event.type !== 'rfid') return;

        const weightData = this.weightReadings.get(event.data.shelf_id);
        if (!weightData) {
            console.debug('A aguardar leitura de peso para correlação');
            return;
        }

        if (Math.abs(Date.now() - event.timestamp) > 
            WeightSensorConfig.sensorConfig.simulationConfig.stabilizationTime) {
            console.debug('Evento fora da janela de correlação');
            this.pendingEvents.delete(eventKey);
            return;
        }

        const product = this.findProduct(event.data.rfid_tag);
        if (product) {
            this.handleRegisteredProduct(houseUuid, event, weightData);
        } else {
            this.handleUnregisteredProduct(houseUuid, event, weightData);
        }

        this.pendingEvents.delete(eventKey);
    }

    /**
     * Processa produtos registados
     * @param {string} houseUuid - Identificador da casa
     * @param {Object} event - Evento RFID
     * @param {Object} weightData - Dados de peso
     * @private
     */
    handleRegisteredProduct(houseUuid, event, weightData) {
        const product = this.findProduct(event.data.rfid_tag);
        const productState = this.productStates.get(product.id);
        const isAdd = event.data.action === 'add';
        const lastWeight = productState?.lastKnownWeight || 0;
        const weightDiff = weightData.weight - lastWeight;

        // Validar alteração de peso
        const expectedWeight = isAdd ? product.container_weight : productState?.lastKnownWeight || 0;
        const weightValidation = Config.productValidationRules.weight.validateChange(
            Math.abs(weightDiff), 
            expectedWeight
        );

        // Gerar alerta se peso não corresponder ao esperado
        if (!weightValidation.isValid) {
            this.generateAlert({
                type: Config.alertConfig.types.PRODUCT.WEIGHT_MISMATCH,
                severity: Config.alertConfig.severity.MEDIUM,
                house_uuid: houseUuid,
                product_id: product.id,
                shelf_id: event.data.shelf_id,
                expected_weight: expectedWeight,
                actual_weight: Math.abs(weightDiff),
                timestamp: new Date().toISOString()
            });
            return;
        }

        // Atualizar estado do produto
        const newWeight = Math.max(0, isAdd ? weightDiff : weightData.weight);
        this.productStates.set(product.id, {
            lastKnownWeight: newWeight,
            lastUpdate: weightData.timestamp,
            shelf_id: event.data.shelf_id
        });

        // Verificar stock baixo
        if (newWeight <= product.min_stock) {
            this.generateAlert({
                type: Config.alertConfig.types.PRODUCT.LOW_STOCK,
                severity: Config.alertConfig.severity.HIGH,
                house_uuid: houseUuid,
                product_id: product.id,
                shelf_id: event.data.shelf_id,
                current_weight: newWeight,
                min_stock: product.min_stock,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Localiza um produto pelo RFID
     * @param {string} rfidTag - Tag RFID
     * @returns {Object|null} Produto encontrado ou null
     * @private
     */
    findProduct(rfidTag) {
        const houseConfig = Config.houseConfigs[this.currentHouse];
        return houseConfig.products.find(product => product.rfid_tag === rfidTag);
    }

    /**
     * Gera um alerta
     * @param {Object} alert - Dados do alerta
     * @returns {Object|null} Alerta gerado ou null
     * @private
     */
    generateAlert(alert) {
        const key = this.generateAlertKey(alert.house_uuid, alert.type, {
            shelf_id: alert.shelf_id
        });

        if (this.isAlertInCooldown(key)) return null;

        const cooldown = alert.type.includes('temperature')
            ? Config.alertConfig.types.TEMPERATURE.cooldown
            : Config.alertConfig.types.PRODUCT.cooldown;

        this.cacheAlert(key, alert.type, cooldown);
        return alert;
    }

    /**
     * Gera uma chave única para um alerta
     * @param {string} houseUuid - Identificador da casa
     * @param {string} type - Tipo de alerta
     * @param {Object} metadata - Metadados adicionais
     * @returns {string} Chave do alerta
     * @private
     */
    generateAlertKey(houseUuid, type, metadata = {}) {
        return `${houseUuid}_${type}_${JSON.stringify(metadata)}`;
    }

    /**
     * Verifica se um alerta está em período de cooldown
     * @param {string} key - Chave do alerta
     * @returns {boolean} Verdadeiro se em cooldown
     * @private
     */
    isAlertInCooldown(key) {
        const cachedAlert = this.alertCache.get(key);
        if (!cachedAlert) return false;

        const now = Date.now();
        return (now - cachedAlert.timestamp) < cachedAlert.cooldown;
    }

    /**
     * Armazena um alerta em cache
     * @param {string} key - Chave do alerta
     * @param {string} type - Tipo de alerta
     * @param {number} cooldown - Período de cooldown
     * @private
     */
    cacheAlert(key, type, cooldown) {
        this.alertCache.set(key, {
            type,
            timestamp: Date.now(),
            cooldown
        });
    }
}

module.exports = AlertManager;