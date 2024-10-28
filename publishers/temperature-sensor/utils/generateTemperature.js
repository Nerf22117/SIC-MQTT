const temperatureData = require("../data/data");

const generateTemperature = () => {
  const randomIndex = Math.floor(Math.random() * temperatureData.length);
  return temperatureData[randomIndex];
};

module.exports = generateTemperature;
