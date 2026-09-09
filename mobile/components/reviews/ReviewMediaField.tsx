import { useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";

import {
  reviewMediaProgressLabel,
  type ReviewMediaAsset,
  type ReviewMediaProgress,
} from "../../lib/review-media-upload";
import { backyrdTheme as theme } from "../../theme/backyrd";

type Source = "camera" | "library";

type Props = {
  assets: ReviewMediaAsset[];
  maxAssets?: number;
  disabled?: boolean;
  onChange: (assets: ReviewMediaAsset[]) => boolean | void | Promise<boolean | void>;
  onError?: (message: string) => void;
};

function pickerAsset(asset: ImagePicker.ImagePickerAsset): ReviewMediaAsset {
  return {
    uri: asset.uri,
    fileName: asset.fileName,
    fileSize: asset.fileSize,
    mimeType: asset.mimeType,
  };
}

export function ReviewMediaField({
  assets,
  maxAssets = 1,
  disabled = false,
  onChange,
  onError,
}: Props) {
  const [picking, setPicking] = useState(false);
  const [permissionMessage, setPermissionMessage] = useState<string | null>(null);

  async function pick(source: Source, replaceIndex: number | null = null) {
    if (disabled || picking) return;
    try {
      setPicking(true);
      setPermissionMessage(null);
      const permission = source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        const message = source === "camera"
          ? "Kamerazugriff ist nicht erlaubt. Du kannst ihn in den Geräteeinstellungen aktivieren."
          : "Zugriff auf deine Fotos ist nicht erlaubt. Du kannst ihn in den Geräteeinstellungen aktivieren.";
        setPermissionMessage(message);
        AccessibilityInfo.announceForAccessibility(message);
        return;
      }

      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.85,
      };
      const result = source === "camera"
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled || !result.assets.length) return;

      const nextAsset = pickerAsset(result.assets[0]);
      const next = [...assets];
      if (replaceIndex !== null) next[replaceIndex] = nextAsset;
      else if (maxAssets === 1) next.splice(0, next.length, nextAsset);
      else if (next.length < maxAssets) next.push(nextAsset);
      else {
        const message = `Du kannst maximal ${maxAssets} Bilder hinzufügen.`;
        onError?.(message);
        AccessibilityInfo.announceForAccessibility(message);
        return;
      }
      const changed = await onChange(next);
      if (changed === false) return;
      AccessibilityInfo.announceForAccessibility(
        replaceIndex === null ? "Bild hinzugefügt." : "Bild ersetzt.",
      );
    } catch {
      const message = "Das Bild konnte gerade nicht ausgewählt werden. Dein Entwurf bleibt erhalten.";
      onError?.(message);
      AccessibilityInfo.announceForAccessibility(message);
    } finally {
      setPicking(false);
    }
  }

  function replace(index: number) {
    Alert.alert("Bild ersetzen", "Woher soll das neue Bild kommen?", [
      { text: "Abbrechen", style: "cancel" },
      { text: "Kamera", onPress: () => void pick("camera", index) },
      { text: "Galerie", onPress: () => void pick("library", index) },
    ]);
  }

  async function remove(index: number) {
    if (disabled) return;
    const changed = await onChange(assets.filter((_, assetIndex) => assetIndex !== index));
    if (changed === false) return;
    AccessibilityInfo.announceForAccessibility("Bild entfernt.");
  }

  return (
    <View style={styles.root}>
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <Text style={styles.title}>Bild</Text>
          <Text style={styles.optional}>Optional · maximal {maxAssets}</Text>
        </View>
        {picking ? <ActivityIndicator accessibilityLabel="Bild wird vorbereitet" color={theme.color.pink} /> : null}
      </View>

      {assets.length ? (
        <View style={styles.previews}>
          {assets.map((asset, index) => (
            <View key={`${asset.uri}-${index}`} style={styles.previewWrap}>
              <Image
                source={{ uri: asset.uri }}
                style={styles.preview}
                accessibilityLabel={`Vorschau Bild ${index + 1}`}
              />
              <View style={styles.previewActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Bild ${index + 1} ersetzen`}
                  accessibilityState={{ disabled }}
                  disabled={disabled}
                  onPress={() => replace(index)}
                  style={styles.smallAction}
                >
                  <Ionicons name="camera-outline" size={18} color={theme.color.textPrimary} />
                  <Text style={styles.smallActionText}>Ersetzen</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Bild ${index + 1} entfernen`}
                  accessibilityState={{ disabled }}
                  disabled={disabled}
                  onPress={() => void remove(index)}
                  style={styles.smallAction}
                >
                  <Ionicons name="trash-outline" size={18} color={theme.color.danger} />
                  <Text style={[styles.smallActionText, { color: theme.color.danger }]}>Entfernen</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.empty} accessible accessibilityLabel="Noch kein Bild ausgewählt">
          <Ionicons name="image-outline" size={28} color={theme.color.textSecondary} />
          <Text style={styles.emptyText}>Deine Review funktioniert auch ohne Bild.</Text>
        </View>
      )}

      {assets.length < maxAssets ? (
        <View style={styles.sourceRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Bild aus Galerie hinzufügen"
            accessibilityState={{ disabled: disabled || picking }}
            disabled={disabled || picking}
            onPress={() => void pick("library")}
            style={({ pressed }) => [styles.sourceButton, pressed && styles.pressed]}
          >
            <Ionicons name="images-outline" size={20} color={theme.color.textPrimary} />
            <Text style={styles.sourceText}>Galerie</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Bild mit Kamera aufnehmen"
            accessibilityState={{ disabled: disabled || picking }}
            disabled={disabled || picking}
            onPress={() => void pick("camera")}
            style={({ pressed }) => [styles.sourceButton, pressed && styles.pressed]}
          >
            <Ionicons name="camera-outline" size={20} color={theme.color.textPrimary} />
            <Text style={styles.sourceText}>Kamera</Text>
          </Pressable>
        </View>
      ) : null}

      {permissionMessage ? (
        <View accessibilityRole="alert" style={styles.permissionState}>
          <Text style={styles.permissionText}>{permissionMessage}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Geräteeinstellungen öffnen"
            onPress={() => void Linking.openSettings()}
            style={styles.settingsButton}
          >
            <Text style={styles.settingsText}>Einstellungen öffnen</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

export function ReviewSubmissionStatus({
  progress,
  error,
  onRetry,
}: {
  progress: ReviewMediaProgress | null;
  error: string | null;
  onRetry: () => void;
}) {
  const progressLabel = reviewMediaProgressLabel(progress);
  if (!progressLabel && !error) return null;
  return (
    <View
      accessibilityRole={error ? "alert" : undefined}
      accessibilityLiveRegion="polite"
      style={[styles.status, error && styles.statusError]}
    >
      {progressLabel && !error ? <ActivityIndicator color={theme.color.pink} /> : null}
      <Text style={[styles.statusText, error && styles.statusErrorText]}>
        {error ?? progressLabel}
      </Text>
      {error ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Review erneut versuchen" onPress={onRetry} style={styles.retryButton}>
          <Text style={styles.retryText}>Erneut versuchen</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { marginTop: theme.spacing.lg },
  headingRow: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: theme.spacing.sm },
  headingCopy: { flex: 1 },
  title: { color: theme.color.textPrimary, fontSize: 17, lineHeight: 23, fontWeight: "800" },
  optional: { color: theme.color.textSecondary, fontSize: 13, lineHeight: 18, marginTop: 2 },
  previews: { gap: theme.spacing.md },
  previewWrap: { borderRadius: theme.radius.lg, overflow: "hidden", borderWidth: 1, borderColor: theme.color.border, backgroundColor: theme.color.surface },
  preview: { width: "100%", height: 220, backgroundColor: theme.color.surfaceElevated },
  previewActions: { flexDirection: "row", gap: theme.spacing.xs, padding: theme.spacing.xs },
  smallAction: { flex: 1, minHeight: 44, borderRadius: theme.radius.md, flexDirection: "row", gap: 7, alignItems: "center", justifyContent: "center" },
  smallActionText: { color: theme.color.textPrimary, fontSize: 13, lineHeight: 18, fontWeight: "700" },
  empty: { minHeight: 112, borderWidth: 1, borderStyle: "dashed", borderColor: theme.color.borderStrong, borderRadius: theme.radius.lg, alignItems: "center", justifyContent: "center", gap: theme.spacing.xs, padding: theme.spacing.md },
  emptyText: { color: theme.color.textSecondary, fontSize: 14, lineHeight: 20, textAlign: "center" },
  sourceRow: { flexDirection: "row", gap: theme.spacing.sm, marginTop: theme.spacing.sm },
  sourceButton: { flex: 1, minHeight: 48, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.color.borderStrong, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: theme.spacing.xs },
  sourceText: { color: theme.color.textPrimary, fontSize: 14, lineHeight: 20, fontWeight: "700" },
  pressed: { opacity: 0.78 },
  permissionState: { marginTop: theme.spacing.sm, padding: theme.spacing.md, borderRadius: theme.radius.md, backgroundColor: "rgba(247,198,92,0.10)", borderWidth: 1, borderColor: "rgba(247,198,92,0.35)" },
  permissionText: { color: theme.color.textPrimary, fontSize: 14, lineHeight: 21 },
  settingsButton: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start" },
  settingsText: { color: theme.color.pink, fontSize: 14, fontWeight: "800" },
  status: { marginTop: theme.spacing.md, minHeight: 56, padding: theme.spacing.md, borderRadius: theme.radius.md, backgroundColor: theme.color.surfaceElevated, flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
  statusError: { alignItems: "flex-start", flexWrap: "wrap", backgroundColor: "rgba(255,104,104,0.10)", borderWidth: 1, borderColor: "rgba(255,104,104,0.35)" },
  statusText: { flex: 1, color: theme.color.textPrimary, fontSize: 14, lineHeight: 20 },
  statusErrorText: { color: theme.color.textPrimary },
  retryButton: { minHeight: 44, justifyContent: "center", paddingHorizontal: theme.spacing.sm },
  retryText: { color: theme.color.pink, fontSize: 14, fontWeight: "800" },
});
