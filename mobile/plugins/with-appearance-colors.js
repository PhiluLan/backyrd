const { withAndroidColors, withAndroidColorsNight } = require("@expo/config-plugins");
const { assignColorValue } = require("@expo/config-plugins/build/android/Colors");
const palette = require("../theme/appearance-colors.json");

function addPalette(config, mode) {
  const colors = palette[mode];
  for (const [name, value] of Object.entries(colors)) {
    const resourceName = name.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    // Android XML uses #AARRGGBB; React Native and CSS use #RRGGBBAA.
    const androidValue = value.length === 9 ? `#${value.slice(7)}${value.slice(1, 7)}` : value;
    config.modResults = assignColorValue(config.modResults, { name: `backyrd_${resourceName}`, value: androidValue });
  }
  return config;
}

module.exports = config => withAndroidColorsNight(
  withAndroidColors(config, mod => addPalette(mod, "light")),
  mod => addPalette(mod, "dark"),
);
