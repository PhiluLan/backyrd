import React, { ErrorInfo, PropsWithChildren } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { reportAnalyticsError } from "../lib/analytics";

type State = {
  hasError: boolean;
};

export class AnalyticsErrorBoundary extends React.Component<PropsWithChildren, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportAnalyticsError({
      error,
      errorType: "react_render_error",
      severity: "fatal",
      handled: false,
      context: {
        component_stack: info.componentStack,
      },
    });
  }

  private retry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <View style={styles.root}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>BACKYRD</Text>
        </View>
        <Text style={styles.title}>Etwas ist schiefgelaufen.</Text>
        <Text style={styles.body}>
          Der Fehler wurde automatisch gemeldet. Starte die Ansicht einfach neu.
        </Text>
        <Pressable onPress={this.retry} style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
          <Text style={styles.buttonText}>Erneut versuchen</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: 28,
    backgroundColor: "#09090A",
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "rgba(255,125,167,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,125,167,0.28)",
    marginBottom: 24,
  },
  badgeText: {
    color: "#FF7DA7",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.4,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "800",
    textAlign: "center",
  },
  body: {
    marginTop: 12,
    color: "rgba(255,255,255,0.62)",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  button: {
    marginTop: 26,
    minHeight: 52,
    paddingHorizontal: 24,
    borderRadius: 18,
    backgroundColor: "#FF7DA7",
    alignItems: "center",
    justifyContent: "center",
  },
  buttonPressed: { opacity: 0.86, transform: [{ scale: 0.98 }] },
  buttonText: { color: "#09090A", fontSize: 15, fontWeight: "800" },
});
