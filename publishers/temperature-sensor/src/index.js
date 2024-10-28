/* const mqtt = require("mqtt");
const config = require("../config/config");

const client = mqtt.connect(config.brokerUrl);

client.on("connect", () => {
  console.log("Conectado ao broker");

  setInterval(() => {
    const message = JSON.stringify({ message: "Hello from Publisher 1!" });
    client.publish(config.topic, message, (err) => {
      if (!err) {
        console.log(`Mensagem enviada: ${message}`);
      } else {
        console.error("Erro ao enviar mensagem:", err);
      }
    });
  }, config.publishInterval);
});

client.on("close", () => {
  console.log("Desconectado do broker");
});
 */
