// plugins/with-podfile-fix.js
const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

module.exports = function withPodfileFix(config) {
  return withDangerousMod(config, [
    "ios",
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, "Podfile");
      let contents = fs.readFileSync(podfilePath, "utf-8");

      // Ersetze die fehlerhafte google-maps Zeile durch die korrekte react-native-maps Zeile
      contents = contents.replace(
        /pod 'react-native-google-maps'.*?\n/g,
        "  pod 'react-native-maps', :path => '../node_modules/react-native-maps'\n"
      );

      fs.writeFileSync(podfilePath, contents);
      return config;
    },
  ]);
};
