// app/maptest.tsx
import React, { useEffect, useState } from "react";
import { Platform, View, Text, StyleSheet } from "react-native";

export default function MapTest() {
  const [MapView, setMapView] = useState<any>(null);
  const [Marker, setMarker] = useState<any>(null);

  useEffect(() => {
    if (Platform.OS !== "web") {
      // Dynamischer Import nur auf iOS/Android
      import("react-native-maps").then((maps) => {
        setMapView(() => maps.default);
        setMarker(() => maps.Marker);
      });
    }
  }, []);

  if (Platform.OS === "web") {
    return (
      <View style={styles.center}>
        <Text>Diese Seite ist auf Web deaktiviert 🧭</Text>
      </View>
    );
  }

  if (!MapView || !Marker) return null;

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        initialRegion={{
          latitude: 48.137154,
          longitude: 11.576124,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
        showsUserLocation
      >
        <Marker
          coordinate={{ latitude: 48.137154, longitude: 11.576124 }}
          title="München"
          description="Google Maps funktioniert 🎉"
        />
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
});
