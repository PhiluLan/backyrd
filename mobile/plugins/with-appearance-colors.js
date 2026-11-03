const { withAndroidColors, withAndroidColorsNight } = require("@expo/config-plugins");
const { assignColorValue } = require("@expo/config-plugins/build/android/Colors");
const palette = require("../theme/appearance-colors.json");

function addPalette(config, mode) {
  const colors = palette[mode];
  for (const [name, value] of Object.entries(colors)) {
    const resourceName = name.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    config.modResults = assignColorValue(config.modResults, { name: `backyrd_${resourceName}`, value });
  }
  return config;
}

module.exports = config => withAndroidColorsNight(
  withAndroidColors(config, mod => addPalette(mod, "light")),
  mod => addPalette(mod, "dark"),
);
