import React from "react";
import { View, Image, ActivityIndicator, StyleSheet, Platform } from "react-native";

export default function SplashScreen() {
  return (
    <View style={styles.container}>
      <Image
        source={require("../assets/icon.png")}
        style={styles.logo}
        resizeMode="contain"
      />
      <ActivityIndicator size="small" color="#ffffff" style={styles.loader} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0B0B0C",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  logo: {
    width: Platform.OS === "web" ? 120 : 132,
    height: Platform.OS === "web" ? 120 : 132,
  },
  loader: {
    marginTop: 18,
  },
});