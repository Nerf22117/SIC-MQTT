const mqtt = require("mqtt");
const config = require("../config/config");

const client = mqtt.connect(config.brokerUrl);

// Assuming the user has selected or provided a house_id
const houseId = "12345"; // This can be dynamic based on user input

// Event handler for when the client connects to the broker
client.on("connect", () => {
  console.log("Connected to the broker");

  // Publish the house_id
  const message = JSON.stringify({ house_id: houseId });
  client.publish(`house`, message, (err) => {
    if (!err) {
      console.log(`House ID sent: ${message}`);
    } else {
      console.error("Error sending house ID:", err);
    }
  });

  // Subscribe to the temperature topic
  client.subscribe(`house/${houseId}/pantry/temperature`, (err) => {
    if (!err) {
      console.log(`Subscribed to the temperature updates for house ${houseId}`);
    } else {
      console.error("Error subscribing to the topic:", err);
    }
  });
});

// Event handler for when a message is received
client.on("message", (topic, message) => {
  const data = JSON.parse(message.toString());
  console.log(
    `Message received on the topic ${topic}: Temperature: ${data.temperature}`
  );
});

// Event handler for when the client disconnects from the broker
client.on("close", () => {
  console.log("Disconnected from the broker");
});
