const mqtt = require("mqtt");
const config = require("../config/config");

const client = mqtt.connect(config.brokerUrl);

client.on("connect", () => {
  console.log("Connected to the broker");

  client.subscribe(config.topic, (err) => {
    if (!err) {
      console.log(`Subscribed to the topic: ${config.topic}`);
    } else {
      console.error("Error subscribing to the topic:", err);
    }
  });
});

client.on("message", (topic, temperature) => {
  console.log(
    `Message received on the topic ${topic}: ${temperature.toString()}`
  );
});

client.on("close", () => {
  console.log("Disconnected from the broker");
});
