// publishers/rfid-reader/src/index.js

const mqtt = require('mqtt');
const config = require('../config/config.js');
const client = mqtt.connect(config.brokerUrl);

class RFIDReader {
    constructor(houseUuid, shelfId) {
        this.houseUuid = houseUuid;
        this.shelfId = shelfId;
        this.activeProducts = new Map(); // Tags atualmente na prateleira
        this.lastReadTime = new Map();   // Última leitura de cada tag
    }

    generateTopic(type) {
        return `house/${this.houseUuid}/pantry/${this.shelfId}/${type}`;
    }

    // Simula detecção de tag RFID
    processTag(tagId) {
        const currentTime = Date.now();
        
        // Verificar se é uma nova tag ou uma que saiu do alcance
        if (!this.lastReadTime.has(tagId)) {
            // Nova tag detectada
            this.handleNewTag(tagId, currentTime);
        }
        
        // Atualizar timestamp da última leitura
        this.lastReadTime.set(tagId, currentTime);
    }

    // Lidar com nova tag detectada
    handleNewTag(tagId, timestamp) {
        const productInfo = this.getProductInfo(tagId);
        
        if (productInfo) {
            // Produto conhecido
            this.activeProducts.set(tagId, productInfo);
            this.publishRFIDEvent(tagId, 'detected', productInfo);
        } else {
            // Produto não registrado
            this.publishRFIDEvent(tagId, 'unregistered');
        }
    }

    // Verificar tags que não são mais detectadas
    checkInactiveProducts() {
        const currentTime = Date.now();
        
        this.lastReadTime.forEach((lastRead, tagId) => {
            if (currentTime - lastRead > config.reader.timeout) {
                // Tag não detectada por tempo suficiente - produto removido
                if (this.activeProducts.has(tagId)) {
                    const productInfo = this.activeProducts.get(tagId);
                    this.publishRFIDEvent(tagId, 'removed', productInfo);
                    this.activeProducts.delete(tagId);
                }
                this.lastReadTime.delete(tagId);
            }
        });
    }

    // Buscar informações do produto pela tag
    getProductInfo(tagId) {
        return config.simulation.knownTags[tagId];
    }

    // Publicar evento RFID
    publishRFIDEvent(tagId, event, productInfo = null) {
        const rfidTopic = this.generateTopic('rfid');
        const actionTopic = this.generateTopic('action');
        
        // Mensagem básica de RFID
        const rfidMessage = {
            event,
            tag_id: tagId,
            shelf_id: this.shelfId,
            timestamp: new Date().toISOString()
        };

        // Adicionar informações do produto se disponíveis
        if (productInfo) {
            rfidMessage.product_id = productInfo.id;
            rfidMessage.product_name = productInfo.name;
            rfidMessage.expected_weight = productInfo.weight;
        }

        // Publicar evento RFID
        client.publish(rfidTopic, JSON.stringify(rfidMessage), { qos: 1 });
        console.log(`[RFID ${this.shelfId}] Evento: ${event}, Tag: ${tagId}`);

        // Publicar ação se for produto conhecido
        if (productInfo && (event === 'detected' || event === 'removed')) {
            const actionMessage = {
                action: event === 'detected' ? 'add' : 'remove',
                tag_id: tagId,
                product_id: productInfo.id,
                product_name: productInfo.name,
                expected_weight: productInfo.weight,
                timestamp: new Date().toISOString()
            };

            client.publish(actionTopic, JSON.stringify(actionMessage), { qos: 1 });
            console.log(`[RFID ${this.shelfId}] Ação: ${actionMessage.action} - Produto: ${productInfo.name}`);
        }
    }
}

// Inicializar leitores RFID
const rfidReaders = new Map();

// Criar leitores para cada prateleira
config.shelves["12345"].forEach(shelf => {
    rfidReaders.set(shelf.id, new RFIDReader("12345", shelf.id));
});

// Simulação de eventos RFID
function simulateRFIDEvents() {
    const readers = Array.from(rfidReaders.values());
    const reader = readers[0]; // Usar primeiro leitor para simulação principal
    
    // Simular sequência de eventos
    setTimeout(() => {
        console.log("\n=== Simulando adição de produto conhecido (Arroz) ===");
        reader.processTag("RFID001");
    }, 3000);

    setTimeout(() => {
        console.log("\n=== Simulando produto desconhecido ===");
        reader.processTag("RFID999");
    }, 8000);

    setTimeout(() => {
        console.log("\n=== Simulando remoção de produto (Arroz) ===");
        // Não processar a tag simula sua remoção
        // O checkInactiveProducts vai detectar a ausência
    }, 13000);

    setTimeout(() => {
        console.log("\n=== Simulando adição de outro produto (Massa) ===");
        reader.processTag("RFID002");
    }, 18000);

    // Verificar produtos inativos periodicamente
    setInterval(() => {
        readers.forEach(reader => reader.checkInactiveProducts());
    }, config.reader.readInterval);
}

// Conexão MQTT
client.on('connect', () => {
    console.log('Sistema RFID Conectado');
    
    if (config.simulation.enabled) {
        console.log('Iniciando simulação de eventos RFID...');
        simulateRFIDEvents();
    }
});

// Gestão de encerramento gracioso
process.on('SIGINT', () => {
    console.log('\nDesligando sistema RFID...');
    setTimeout(() => process.exit(0), 500);
});