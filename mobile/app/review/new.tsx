import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Image,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  ScrollView,
  TouchableWithoutFeedback,
  Keyboard,
  Platform,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import type { User } from "@supabase/supabase-js";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";

const theme = {
  colors: {
    background: "#0A0A0B",
    surface: "#131316",
    surfaceElevated: "#1B1B21",
    border: "#2A2A33",
    text: "#FFFFFF",
    textMuted: "#A6A8AD",
    primary: "#6366F1",
    accent: "#8B5CF6",
  },
  radius: { md: 12, lg: 16, xl: 24, pill: 999 },
  spacing: (n: number) => n * 8,
};

export default function NewReviewScreen() {
  const { spotId } = useLocalSearchParams<{ spotId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [user, setUser] = useState<User | null>(null);
  const [moodA, setMoodA] = useState("");
  const [moodB, setMoodB] = useState("");
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
  }, []);

  async function pickImage(fromCamera: boolean) {
    try {
      const options: any = {
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      };
      const result = fromCamera
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);

      if (!result.canceled && result.assets?.length) {
        if (photos.length >= 3) {
          Alert.alert("Limit erreicht", "Du kannst maximal 3 Fotos hochladen.");
          return;
        }
        setPhotos((prev) => [...prev, result.assets[0].uri]);
      }
    } catch (e: any) {
      console.error(e);
      Alert.alert("Fehler", e.message ?? "Konnte kein Bild auswählen.");
    }
  }

  async function uploadImage(uri: string, fileName: string) {
    const res = await fetch(uri);
    const blob = await res.blob();
    const { error } = await supabase.storage
      .from("spot-photos")
      .upload(fileName, blob, { contentType: "image/jpeg", upsert: true });
    if (error) throw error;

    const { data } = supabase.storage.from("spot-photos").getPublicUrl(fileName);
    return data.publicUrl;
  }

  async function submitReview() {
    if (!spotId) {
      Alert.alert("Fehler", "Kein Spot ausgewählt");
      return;
    }
    if (!user?.id) {
      Alert.alert("Login benötigt", "Bitte melde dich an, um eine Review zu schreiben.");
      return;
    }

    try {
      setUploading(true);

      const { data: reviewData, error: reviewErr } = await supabase
        .from("reviews")
        .insert({
          spot_id: spotId,
          user_id: user.id,
          text,
          mood_a: moodA || null,
          mood_b: moodB || null,
        })
        .select()
        .single();

      if (reviewErr) throw reviewErr;
      const reviewId = reviewData.id;

      for (const uri of photos) {
        const fileName = `${spotId}/${reviewId}-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}.jpg`;
        const photoUrl = await uploadImage(uri, fileName);

        await supabase.from("spot_photos").insert({
          spot_id: spotId,
          review_id: reviewId,
          url: photoUrl,
          uploaded_by: user.id,
        });
      }

      Alert.alert("Danke!", "Deine Review wurde gespeichert.");
      router.back();
    } catch (e: any) {
      console.error(e);
      Alert.alert("Fehler", e.message ?? "Konnte Review nicht speichern.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
          {/* ===== Glass Header ===== */}
          <View style={[styles.headerWrap, { paddingTop: insets.top + 4 }]}>
            <BlurView intensity={40} tint="dark" style={styles.header}>
              <Pressable onPress={() => router.back()} hitSlop={10} style={styles.headerBtn}>
                <Ionicons name="chevron-back" size={24} color="#fff" />
              </Pressable>
              <Text style={styles.headerTitle}>Neue Review</Text>
              <View style={styles.headerBtn} />
            </BlurView>
          </View>

          {/* ===== Content ===== */}
          <ScrollView contentContainerStyle={styles.container}>
            <View style={styles.card}>
              <Text style={styles.label}>Mood A</Text>
              <TextInput
                placeholder="Erste Stimmung"
                placeholderTextColor={theme.colors.textMuted}
                value={moodA}
                onChangeText={setMoodA}
                style={styles.input}
              />

              <Text style={styles.label}>Mood B</Text>
              <TextInput
                placeholder="Zweite Stimmung"
                placeholderTextColor={theme.colors.textMuted}
                value={moodB}
                onChangeText={setMoodB}
                style={styles.input}
              />

              <Text style={styles.label}>Dein Text (max. 100 Zeichen)</Text>
              <TextInput
                placeholder="Wie war dein Erlebnis?"
                placeholderTextColor={theme.colors.textMuted}
                value={text}
                onChangeText={setText}
                maxLength={100}
                style={[styles.input, { minHeight: 100 }]}
                multiline
              />
              <Text style={styles.counter}>{text.length}/100</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.label}>Fotos (max. 3)</Text>
              <View style={styles.photoContainer}>
                {photos.map((uri, idx) => (
                  <Image key={idx} source={{ uri }} style={styles.preview} />
                ))}
              </View>
              <View style={styles.photoButtons}>
                <LinearGradient
                  colors={[theme.colors.primary, theme.colors.accent]}
                  style={styles.photoBtnGradient}
                >
                  <Pressable onPress={() => pickImage(false)} style={styles.photoBtn}>
                    <Text style={styles.photoBtnText}>Galerie</Text>
                  </Pressable>
                </LinearGradient>
                <LinearGradient
                  colors={["#10B981", "#34D399"]}
                  style={styles.photoBtnGradient}
                >
                  <Pressable onPress={() => pickImage(true)} style={styles.photoBtn}>
                    <Text style={styles.photoBtnText}>Kamera</Text>
                  </Pressable>
                </LinearGradient>
              </View>
            </View>

            {/* Submit Button */}
            <BlurView intensity={30} tint="dark" style={styles.submitWrap}>
              <LinearGradient
                colors={[theme.colors.primary, theme.colors.accent]}
                style={styles.submitGradient}
              >
                <Pressable onPress={submitReview} style={styles.submitBtn} disabled={uploading}>
                  {uploading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.submitText}>Review speichern</Text>
                  )}
                </Pressable>
              </LinearGradient>
            </BlurView>
          </ScrollView>
        </SafeAreaView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  headerWrap: {
    paddingHorizontal: theme.spacing(2),
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(0,0,0,0.25)",
    borderRadius: theme.radius.xl,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "800" },

  container: {
    padding: theme.spacing(2),
    paddingBottom: theme.spacing(12),
  },
  card: {
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.radius.xl,
    padding: theme.spacing(2),
    marginBottom: theme.spacing(2),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  label: { color: theme.colors.text, fontWeight: "700", marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    padding: 12,
    color: theme.colors.text,
    marginBottom: 12,
    backgroundColor: theme.colors.surface,
  },
  counter: {
    alignSelf: "flex-end",
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: -8,
  },

  photoContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  preview: {
    width: 100,
    height: 100,
    borderRadius: theme.radius.md,
    backgroundColor: "#1f1f1f",
  },
  photoButtons: {
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
  },
  photoBtnGradient: {
    flex: 1,
    borderRadius: theme.radius.lg,
  },
  photoBtn: {
    paddingVertical: 14,
    alignItems: "center",
    borderRadius: theme.radius.lg,
  },
  photoBtnText: { color: "#fff", fontWeight: "700" },

  submitWrap: {
    borderRadius: theme.radius.xl,
    overflow: "hidden",
    marginTop: theme.spacing(3),
  },
  submitGradient: {
    borderRadius: theme.radius.xl,
  },
  submitBtn: {
    paddingVertical: 16,
    alignItems: "center",
  },
  submitText: { color: "#fff", fontWeight: "800", fontSize: 16, letterSpacing: 0.3 },
});
