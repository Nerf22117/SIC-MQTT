const mqtt = require("mqtt");
const config = require("../config/config"); // Importa as configurações do subscritor

const client = mqtt.connect(config.brokerUrl);

client.on("connect", () => {
  console.log("Conectado ao broker");

  client.subscribe(config.topic, (err) => {
    if (!err) {
      console.log(`Inscrito no tópico: ${config.topic}`);
    } else {
      console.error("Erro ao inscrever-se no tópico:", err);
    }
  });
});

client.on("message", (topic, message) => {
  console.log(`Mensagem recebida no tópico ${topic}: ${message.toString()}`);
});

client.on("close", () => {
  console.log("Desconectado do broker");
});
