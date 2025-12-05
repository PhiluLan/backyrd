// mobile/components/AchievementUnlockModal.tsx
import React, { useEffect, useRef } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Animated,
  Easing,
} from "react-native";

export function AchievementUnlockModal({ achievements, onClose }) {
  const scale = useRef(new Animated.Value(0.6)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(scale, {
        toValue: 1,
        duration: 350,
        easing: Easing.out(Easing.back(1.4)),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Modal visible transparent animationType="fade">
      <View style={styles.overlay}>
        <Animated.View style={[styles.container, { opacity, transform: [{ scale }] }]}>
          <Text style={styles.title}>🎉 Neues Achievement!</Text>

          {achievements.map(a => (
            <View key={a.id} style={styles.row}>
              {a.public_icon_url ? (
                <Image source={{ uri: a.public_icon_url }} style={styles.icon} />
              ) : (
                <View style={styles.iconPlaceholder}><Text style={{ fontSize: 24 }}>🏅</Text></View>
              )}

              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{a.name}</Text>
                {a.description ? <Text style={styles.desc}>{a.description}</Text> : null}
              </View>
            </View>
          ))}

          <TouchableOpacity style={styles.button} onPress={onClose}>
            <Text style={styles.buttonText}>Weiter</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    padding: 20,
  },
  container: {
    backgroundColor: "#17191d",
    borderRadius: 20,
    padding: 20,
    borderColor: "#4ade80",
    borderWidth: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "white",
    textAlign: "center",
    marginBottom: 14,
  },
  row: {
    flexDirection: "row",
    marginBottom: 12,
    alignItems: "center",
    gap: 12,
  },
  icon: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  iconPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#111",
    justifyContent: "center",
    alignItems: "center",
  },
  name: { color: "white", fontSize: 16, fontWeight: "600" },
  desc: { color: "#9ca3af", fontSize: 13 },
  button: {
    backgroundColor: "#4ade80",
    paddingVertical: 10,
    borderRadius: 999,
    marginTop: 18,
  },
  buttonText: {
    color: "#064e3b",
    textAlign: "center",
    fontWeight: "700",
    fontSize: 14,
  },
});
