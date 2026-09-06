const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const originalResolveRequest = config.resolver.resolveRequest;

// Mobile consumes the canonical, runtime Event presentation helpers from the
// repository shared package. Type-only imports do not reach Metro, so keep the
// shared source inside the explicit watch graph for native production exports.
config.watchFolders = [
  ...(config.watchFolders ?? []),
  path.resolve(__dirname, "../packages/shared"),
];

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
