import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  TextInput,
  Alert,
  ScrollView,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import * as ImageManipulator from "expo-image-manipulator";
import { supabase } from "../../lib/supabase";

/* ======================================================
   🔧 Helper: Filter anwenden
====================================================== */
async function applyFilter(
  uri: string,
  filter: "none" | "bw" | "dark"
): Promise<string> {
  if (filter === "none") return uri;

  const actions: ImageManipulator.Action[] = [];

  if (filter === "bw") {
    actions.push({ adjust: { saturation: 0 } }); // Entsättigen
  } else if (filter === "dark") {
    actions.push({ adjust: { brightness: -0.2, contrast: 1.1 } }); // dunkler & kontrastreicher
  }

  const result = await ImageManipulator.manipulateAsync(uri, actions, {
    compress: 0.9,
    format: ImageManipulator.SaveFormat.JPEG,
  });

  return result.uri;
}

/* ======================================================
   🔧 Helper: Sicherer Upload zu Supabase
====================================================== */
async function uploadImageToSupabase(uri: string, pathPrefix: string) {
  const ext = uri.split(".").pop()?.toLowerCase() || "jpg";
  const contentType =
    ext === "png"
      ? "image/png"
      : ext === "webp"
      ? "image/webp"
      : "image/jpeg";
  const fileName = `${pathPrefix}_${Date.now()}.${ext}`;

  const resp = await fetch(uri);
  const blob = await resp.blob();
  const file = new File([blob], fileName, { type: contentType });

  const { error: uploadErr } = await supabase.storage
    .from("spot-photos") // 👈 dein echter Bucket
    .upload(fileName, file, { contentType });

  if (uploadErr) throw uploadErr;

  const { data: publicUrlData } = supabase.storage
    .from("spot-photos")
    .getPublicUrl(fileName);

  return publicUrlData.publicUrl;
}

/* ======================================================
   📸 Quick Review Screen
====================================================== */
export default function QuickReviewScreen() {
  const { spotId } = useLocalSearchParams<{ spotId: string }>();
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [filter, setFilter] = useState<"none" | "bw" | "dark">("none");
  const [moodA, setMoodA] = useState("");
  const [moodB, setMoodB] = useState("");
  const [loading, setLoading] = useState(false);

  const [permission, requestPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraRef, setCameraRef] = useState<CameraView | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!permission) requestPermission();
  }, [permission]);

  /* ======= Foto aufnehmen ======= */
  async function takePhoto() {
    if (!cameraRef) return;
    try {
      const photo = await cameraRef.takePictureAsync({ quality: 0.8 });
      setPhotoUri(photo.uri);
    } catch (err) {
      Alert.alert("Fehler", "Kamera konnte kein Bild aufnehmen.");
      console.error(err);
    }
  }

  /* ======= Hochladen & Review speichern ======= */
  async function submitReview() {
    if (!spotId) {
      Alert.alert("Fehler", "Spot-ID fehlt.");
      return;
    }

    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) {
      Alert.alert("Login erforderlich", "Bitte melde dich zuerst an.");
      return;
    }

    if (!photoUri) {
      Alert.alert("Fehler", "Bitte zuerst ein Foto aufnehmen.");
      return;
    }

    setLoading(true);
    try {
      const filteredUri = await applyFilter(photoUri, filter);
      const publicUrl = await uploadImageToSupabase(
        filteredUri,
        `review_${spotId}`
      );

      const { error: insertError } = await supabase.from("reviews").insert({
        spot_id: spotId,
        user_id: user.id,
        mood_a: moodA || null,
        mood_b: moodB || null,
        photo_path: publicUrl,
        text: null,
      });

      if (insertError) throw insertError;

      router.replace(`/spot/${spotId}`);
    } catch (e: any) {
      Alert.alert("Fehler", e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  /* ======= Kamera-Berechtigung ======= */
  if (!permission?.granted) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={{ color: "#fff", marginBottom: 8 }}>
          Zugriff auf Kamera erforderlich
        </Text>
        <Pressable
          style={styles.permissionBtn}
          onPress={() => requestPermission()}
        >
          <Text style={styles.permissionText}>Erlauben</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  /* ======= Kamera-Ansicht ======= */
  if (!photoUri) {
    return (
      <SafeAreaView style={styles.cameraContainer}>
        <CameraView
          style={{ flex: 1 }}
          facing="back"
          ref={setCameraRef}
          onCameraReady={() => setCameraReady(true)}
        />
        <View style={styles.cameraOverlay}>
          <Pressable
            onPress={takePhoto}
            style={[styles.captureBtn, { opacity: cameraReady ? 1 : 0.5 }]}
            disabled={!cameraReady}
          >
            <View style={styles.innerCircle} />
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  /* ======= Foto + Review-Eingabe ======= */
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        <Image
          source={{ uri: photoUri }}
          style={styles.photoPreview}
          contentFit="cover"
        />

        {/* Filter Buttons */}
        <View style={styles.filterRow}>
          {["none", "bw", "dark"].map((f) => (
            <Pressable
              key={f}
              onPress={() => setFilter(f as "none" | "bw" | "dark")}
              style={[
                styles.filterBtn,
                filter === f && { backgroundColor: "#fff" },
              ]}
            >
              <Text
                style={{
                  color: filter === f ? "#000" : "#fff",
                  fontWeight: "600",
                }}
              >
                {f === "none"
                  ? "Original"
                  : f === "bw"
                  ? "Schwarz-Weiß"
                  : "Dark-Ambiente"}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Mood Inputs */}
        <Text style={styles.label}>Mood A</Text>
        <TextInput
          style={styles.input}
          placeholder="z. B. gemütlich"
          placeholderTextColor="#777"
          value={moodA}
          onChangeText={setMoodA}
        />
        <Text style={styles.label}>Mood B</Text>
        <TextInput
          style={styles.input}
          placeholder="z. B. lebhaft"
          placeholderTextColor="#777"
          value={moodB}
          onChangeText={setMoodB}
        />

        <Pressable
          onPress={submitReview}
          style={[styles.submitBtn, loading && { opacity: 0.6 }]}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.submitText}>Hochladen & Fertig</Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

/* ======================================================
   🎨 Styles
====================================================== */
const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000",
  },
  permissionBtn: {
    backgroundColor: "#fff",
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 999,
  },
  permissionText: { color: "#000", fontWeight: "600" },
  cameraContainer: {
    flex: 1,
    backgroundColor: "#000",
    position: "relative",
  },
  cameraOverlay: {
    position: "absolute",
    bottom: 40,
    width: "100%",
    alignItems: "center",
  },
  captureBtn: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  innerCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#fff",
  },
  container: { flex: 1, backgroundColor: "#000", padding: 16 },
  photoPreview: {
    width: "100%",
    height: 400,
    borderRadius: 16,
    marginBottom: 20,
  },
  filterRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 16,
  },
  filterBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#444",
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  label: {
    color: "#fff",
    fontWeight: "600",
    marginTop: 12,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: "#333",
    borderRadius: 8,
    padding: 12,
    color: "#fff",
  },
  submitBtn: {
    marginTop: 24,
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 999,
    alignItems: "center",
  },
  submitText: { color: "#000", fontWeight: "700", fontSize: 16 },
});
