module.exports = {
    brokerUrl: "mqtt://localhost:1883",
    houseUuids: ["12345"], // IDs das casas monitorizadas para alertas e dados de temperatura
    temperatureTopicPattern: "house/{house_uuid}/temperature", // Padrão de tópico para dados de temperatura
    alertTopicPattern: "house/{house_uuid}/alerts", // Padrão de tópico para alertas
    
    // Limites para deteção de alertas de temperatura
    temperatureThresholds: {
      "12345": { min: 2.0, max: 18.0 }  // Casa com ID 12345
    },
    defaultAlertThresholds: { min: 0.0, max: 22.0 } // Limites padrão, caso uma casa específica não tenha limites definidos
};
