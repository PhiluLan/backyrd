const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

module.exports = function withFixReactNativeMapsPodfile(config) {
  return withDangerousMod(config, [
    "ios",
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, "Podfile");
      let contents = fs.readFileSync(podfilePath, "utf-8");

      // ❌ Entferne ALLE fehlerhaften Zeilen
      contents = contents.replace(/^\s*pod\s+'react-native-google-maps'.*?\n/gm, "");

      // ✅ Sichere Zeile für react-native-maps einfügen, falls nicht vorhanden
      if (!contents.includes("pod 'react-native-maps'")) {
        contents = contents.replace(
          /use_react_native!\([\s\S]*?\)\n/,
          (match) =>
            match +
            "  pod 'react-native-maps', :path => '../node_modules/react-native-maps'\n"
        );
      }

      fs.writeFileSync(podfilePath, contents);
      console.log("✅ Podfile erfolgreich gepatcht durch Plugin.");
      return config;
    },
  ]);
};
