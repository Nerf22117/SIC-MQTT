/**
 * This module provides a function to generate a random temperature value
 * from a predefined set of temperature data.
 */

const temperatureData = require("../data/data");

/**
 * Generates a random temperature value from the temperatureData array.
 *
 * @returns {number} A random temperature value from the temperatureData array.
 */
const generateRandomTemperature = () => {
  const randomIndex = Math.floor(Math.random() * temperatureData.length);
  return temperatureData[randomIndex];
};

module.exports = generateRandomTemperature;
