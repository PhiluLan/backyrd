import React from "react";
import MapView, { Marker } from "react-native-maps";
import { StyleSheet } from "react-native";

export default function Map() {
  return (
    <MapView style={styles.map}>
      <Marker coordinate={{ latitude: 47.5596, longitude: 7.5886 }} />
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1 },
});
