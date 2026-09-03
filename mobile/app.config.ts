import "dotenv/config";

const APP_VERSION = "1.1.0";
const IOS_PRODUCTION_BUNDLE_IDENTIFIER = "com.philipplanger.backyrd";
const IOS_DEVELOPMENT_BUNDLE_IDENTIFIER = `${IOS_PRODUCTION_BUNDLE_IDENTIFIER}.dev`;

function requiredReleaseValue(name = "", value = "", nativeBuildOnly = false) {
  const isNativeProductionBuild =
    process.env.EAS_BUILD === "true" && process.env.APP_VARIANT === "prod";
  const isProductionOta =
    !nativeBuildOnly && process.env.BACKYRD_RELEASE_BUILD === "1";
  const isReleaseBuild = isNativeProductionBuild || isProductionOta;

  if (isReleaseBuild && !value?.trim()) {
    throw new Error(`Missing required production runtime configuration: ${name}`);
  }

  return value?.trim();
}

export default (context = { config: {} }) => {
  const config = context.config;
  const variant = process.env.APP_VARIANT ?? "prod";
  const isDev = variant === "dev";
  const supabaseUrl = requiredReleaseValue(
    "EXPO_PUBLIC_SUPABASE_URL",
    process.env.EXPO_PUBLIC_SUPABASE_URL ?? ""
  );
  const supabaseAnonKey = requiredReleaseValue(
    "EXPO_PUBLIC_SUPABASE_ANON_KEY",
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? ""
  );
  const googleMapsKey = requiredReleaseValue(
    "EXPO_PUBLIC_GOOGLE_MAPS_KEY",
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY ?? "",
    true
  );
  const googleIosClientId = requiredReleaseValue(
    "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID",
    process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? "",
    true
  );
  const googleWebClientId = requiredReleaseValue(
    "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID",
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "",
    true
  );

  return {
    ...config,
    name: isDev ? "Backyrd (dev)" : "Backyrd",
    slug: "backyrd",
    scheme: "backyrd",
    owner: "philipplanger",
    version: APP_VERSION,

    runtimeVersion: {
      policy: "appVersion",
    },

    icon: "./assets/icon.png",

    splash: {
      image: "./assets/icon.png",
      resizeMode: "contain",
      backgroundColor: "#0B0B0C",
    },

    ios: {
      bundleIdentifier: isDev
        ? IOS_DEVELOPMENT_BUNDLE_IDENTIFIER
        : IOS_PRODUCTION_BUNDLE_IDENTIFIER,
      usesAppleSignIn: true,
      supportsTablet: false,
      config: {
        googleMapsApiKey: googleMapsKey,
      },
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        NSLocationWhenInUseUsageDescription:
          "Backyrd nutzt deinen Standort, um passende Spots in deiner Nähe vorzuschlagen.",
        NSCameraUsageDescription:
          "Backyrd benötigt die Kamera, um Fotos für Reviews aufzunehmen.",
        NSPhotoLibraryAddUsageDescription:
          "Backyrd speichert deine Review-Fotos in der Mediathek.",
      },
    },

    android: {
      package: isDev ? "com.backyrd.app.dev" : "com.backyrd.app",
      adaptiveIcon: {
        foregroundImage: "./assets/icon.png",
        backgroundColor: "#0B0B0C",
      },
      config: {
        googleMaps: {
          apiKey: googleMapsKey,
        },
      },
      permissions: [
        "CAMERA",
        "ACCESS_FINE_LOCATION",
        "ACCESS_COARSE_LOCATION",
        "READ_EXTERNAL_STORAGE",
        "WRITE_EXTERNAL_STORAGE",
      ],
    },

    plugins: [
      "expo-router",
      "expo-camera",
      "expo-secure-store",
      "expo-web-browser",
      "expo-font",
      "./plugins/with-ios-link-handoff",
    ],

    extra: {
      appVariant: variant,
      eas: {
        projectId: "7779ff79-6fa4-4d0e-b592-9c19c5f87881",
      },
      supabaseUrl,
      supabaseAnonKey,
      googleMapsKey,
      googleIosClientId,
      googleAndroidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID?.trim(),
      googleWebClientId,
    },

    updates: {
      enabled: true,
      url: "https://u.expo.dev/7779ff79-6fa4-4d0e-b592-9c19c5f87881",
      checkAutomatically: "ON_LOAD",
      fallbackToCacheTimeout: 0,
    },
  };
};
