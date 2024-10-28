const mqtt = require("mqtt");
const config = require("../config/config");

const client = mqtt.connect(config.brokerUrl);

const generateTemperature = require("../utils/generateTemperature");

client.on("connect", () => {
  console.log("Connected to the broker");

  setInterval(() => {
    const randomTemperature = generateTemperature();
    const message = JSON.stringify({
      temperature: `Temperature: ${randomTemperature}`,
    });
    client.publish(config.topic, message, (err) => {
      if (!err) {
        console.log(`Message sent: ${message}`);
      } else {
        console.error("Error sending message:", err);
      }
    });
  }, config.publishInterval);
});

client.on("close", () => {
  console.log("Disconnected from the broker");
});
