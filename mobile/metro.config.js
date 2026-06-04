const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const originalResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === "web") {
    if (moduleName === "react-native-maps") {
      return {
        filePath: path.resolve(__dirname, "web-shims/react-native-maps.tsx"),
        type: "sourceFile",
      };
    }

    if (moduleName === "react-native-map-clustering") {
      return {
        filePath: path.resolve(__dirname, "web-shims/react-native-map-clustering.tsx"),
        type: "sourceFile",
      };
    }
  }

  if (typeof originalResolveRequest === "function") {
    return originalResolveRequest(context, moduleName, platform);
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
