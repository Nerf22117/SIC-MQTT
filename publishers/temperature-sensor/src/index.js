/**
 * This script connects to an MQTT broker, subscribes to a topic to receive a house ID,
 * and periodically publishes temperature updates to a specific topic.
 */

const mqtt = require("mqtt");
const config = require("../config/config");

const client = mqtt.connect(config.brokerUrl);

const getRandomTemperature = require("../utils/generateRandomTemperature");

// Variable to store the house_id
let houseId = null;

/**
 * Event handler for when the client connects to the broker.
 * Logs a message and subscribes to the "house" topic to receive house_id updates.
 */
client.on("connect", () => {
  console.log("Connected to the broker");

  // Subscribing to the house topic to receive house_id
  client.subscribe("house", (err) => {
    if (!err) {
      console.log("Subscribed to house updates");
    } else {
      console.error("Error subscribing:", err);
    }
  });

  /**
   * Publishes temperature updates every 5 seconds if houseId is defined.
   * Uses the getRandomTemperature function to generate a random temperature.
   */
  setInterval(() => {
    if (houseId) {
      const temperature = getRandomTemperature();
      const message = JSON.stringify({ temperature });

      // Publish to the topic house/{house_id}/pantry/temperature
      client.publish(`house/${houseId}/pantry/temperature`, message, (err) => {
        if (!err) {
          console.log(
            `Temperature update sent for house ${houseId}: ${message}`
          );
        } else {
          console.error("Error sending message:", err);
        }
      });
    }
  }, 5000);
});

/**
 * Event handler for when a message is received.
 * Updates the houseId if the message contains a house_id.
 */
client.on("message", (topic, message) => {
  const data = JSON.parse(message.toString());

  if (data.house_id) {
    houseId = data.house_id; // Update the houseId
    console.log(`House ID updated: ${houseId}`);
  }
});

/**
 * Event handler for when the client disconnects from the broker.
 * Logs a message indicating disconnection.
 */
client.on("close", () => {
  console.log("Disconnected from the broker");
});
