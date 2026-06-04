// app/spot/new.tsx
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Alert,
  Image,
  Pressable,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  TextInput,
  Modal,
  FlatList,
} from "react-native";
import { supabase } from "../../lib/supabase";
import * as ImagePicker from "expo-image-picker";
import { useRouter, useLocalSearchParams } from "expo-router";
import { searchAddress } from "../../lib/geocode";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

/* ================== Types ================== */
type Category = {
  id: string;
  name: string;
  icon?: string | null;
  color?: string | null;
};

/* ================== Helpers ================== */
async function uploadImageToSupabase(params: {
  uri: string;
  bucket: string;
  pathPrefix?: string;
  contentTypeHint?: string;
}) {
  const { uri, bucket, pathPrefix = "upload", contentTypeHint } = params;

  const extGuess = uri.split(".").pop()?.toLowerCase() || "jpg";
  const ext = ["jpg", "jpeg", "png", "webp", "heic", "heif"].includes(extGuess)
    ? extGuess
    : "jpg";

  const contentType =
    contentTypeHint ||
    (ext === "png"
      ? "image/png"
      : ext === "webp"
        ? "image/webp"
        : ext === "heic" || ext === "heif"
          ? "image/heic"
          : "image/jpeg");

  const fileName = `${pathPrefix}_${Date.now()}.${ext}`;

  let arrayBuffer: ArrayBuffer;
  try {
    const resp = await fetch(uri);
    arrayBuffer = await resp.arrayBuffer();
  } catch (e: any) {
    throw new Error(
      `Bild konnte nicht gelesen werden: ${e?.message || String(e)}`,
    );
  }

  const { error: uploadErr } = await supabase.storage
    .from(bucket)
    .upload(fileName, arrayBuffer, { contentType, upsert: false });

  if (uploadErr) throw new Error(uploadErr.message || "Upload fehlgeschlagen");

  const { data: publicUrlData } = supabase.storage
    .from(bucket)
    .getPublicUrl(fileName);
  return { fileName, publicUrl: publicUrlData.publicUrl as string };
}

function parseTagInput(value: string): string[] {
  return value
    .split(/[\n,]+/g)
    .map((v) => v.trim())
    .filter(Boolean);
}

function cleanNullableText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

/* ================== Screen ================== */
export default function NewSpotScreen() {
  const { photo: incomingPhoto } = useLocalSearchParams<{ photo?: string }>();
  const [photo, setPhoto] = useState<string | null>(
    incomingPhoto ? decodeURIComponent(incomingPhoto) : null,
  );

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [moodA, setMoodA] = useState("");
  const [moodB, setMoodB] = useState("");
  const [description, setDescription] = useState("");
  const [keywords, setKeywords] = useState("");
  const [bestFor, setBestFor] = useState("");
  const [atmosphereTags, setAtmosphereTags] = useState("");
  const [avoidIfTags, setAvoidIfTags] = useState("");
  const [goodForTime, setGoodForTime] = useState("");
  const [noiseLevel, setNoiseLevel] = useState("");
  const [loading, setLoading] = useState(false);
  const [coords, setCoords] = useState<[number, number] | null>(null);
  const [suggestions, setSuggestions] = useState<
    { id: string; place_name: string; coords: [number, number] }[]
  >([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const router = useRouter();

  /* ========= 📥 Kategorien laden ========= */
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name, icon, color")
        .order("name", { ascending: true });
      if (error)
        console.error("Kategorien laden fehlgeschlagen:", error.message);
      else setCategories(data || []);
    })();
  }, []);

  /* ========= 📸 Bild wählen ========= */
  async function pickImage(fromCamera: boolean) {
    try {
      const result = await (fromCamera
        ? ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.8,
          })
        : ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.8,
          }));

      if (!result.canceled && result.assets.length > 0) {
        setPhoto(result.assets[0].uri);
      }
    } catch (err) {
      console.warn("Bildauswahl fehlgeschlagen:", err);
    }
  }

  /* ========= 🗺️ Adresse suchen ========= */
  async function onAddressChange(text: string) {
    setAddress(text);
    if (text.length > 3) {
      try {
        const res = await searchAddress(text);
        setSuggestions(res);
      } catch (e) {
        console.error("Geocoding error:", e);
        setSuggestions([]);
      }
    } else {
      setSuggestions([]);
    }
  }

  async function saveSpotContentAndIntelligence(spotId: string) {
    const contentDescription = cleanNullableText(description);
    const contentKeywords = parseTagInput(keywords);

    if (contentDescription || contentKeywords.length > 0) {
      const { error } = await supabase.rpc("upsert_spot_admin_content_v1", {
        p_spot_id: spotId,
        p_description: contentDescription,
        p_keywords: contentKeywords,
        p_source: "admin",
        p_enriched_url: null,
      });

      if (error) {
        console.warn(
          "Spot-Beschreibung konnte nicht gespeichert werden:",
          error.message,
        );
      }
    }

    const hasIntelligence =
      parseTagInput(bestFor).length > 0 ||
      parseTagInput(atmosphereTags).length > 0 ||
      parseTagInput(avoidIfTags).length > 0 ||
      parseTagInput(goodForTime).length > 0 ||
      cleanNullableText(noiseLevel);

    if (hasIntelligence) {
      const { error } = await supabase.rpc("upsert_spot_intelligence_v1", {
        p_spot_id: spotId,
        p_best_for: parseTagInput(bestFor),
        p_occasion_tags: [],
        p_atmosphere_tags: parseTagInput(atmosphereTags),
        p_avoid_if_tags: parseTagInput(avoidIfTags),
        p_good_for_time: parseTagInput(goodForTime),
        p_noise_level: cleanNullableText(noiseLevel),
        p_crowd_type: [],
        p_dress_code: null,
        p_reservation_recommended: null,
        p_average_duration_minutes: null,
        p_signature_items: [],
        p_special_notes: null,
        p_admin_notes: null,
        p_source: "admin",
        p_is_verified: false,
      });

      if (error) {
        console.warn(
          "Spot Intelligence konnte nicht gespeichert werden:",
          error.message,
        );
      }
    }

    const { error: refreshError } = await supabase.rpc(
      "backyrd_refresh_spot_ml_document_v13",
      { p_spot_id: spotId },
    );

    if (refreshError) {
      console.warn(
        "ML-Dokument konnte nicht aktualisiert werden:",
        refreshError.message,
      );
      return;
    }

    const { error: embeddingError } = await supabase.functions.invoke(
      "generate-spot-embeddings",
      { body: { limit: 10 } },
    );

    if (embeddingError) {
      console.warn(
        "Embedding konnte nicht aktualisiert werden:",
        embeddingError.message,
      );
    }
  }

  /* ========= 🚀 Spot speichern ========= */
  async function submit() {
    if (!name.trim()) {
      Alert.alert("Fehler", "Bitte gib einen Namen ein.");
      return;
    }
    if (!coords) {
      Alert.alert("Fehler", "Bitte wähle eine Adresse aus der Liste.");
      return;
    }
    if (!categoryId) {
      Alert.alert("Fehler", "Bitte wähle eine Kategorie aus.");
      return;
    }

    const { data: user } = await supabase.auth.getUser();
    if (!user || !user.user) {
      Alert.alert(
        "Fehler",
        "Du musst eingeloggt sein, um einen Spot anzulegen.",
      );
      return;
    }

    setLoading(true);

    try {
      const { data: spot, error: spotErr } = await supabase
        .from("spots")
        .insert({
          name,
          address: address || null,
          category_id: categoryId,
          status: "approved",
          lat: coords[1],
          lng: coords[0],
          created_by: user.user.id,
        })
        .select()
        .single();

      if (spotErr) throw spotErr;

      // 📸 Foto Upload (auch übernommenes Foto)
      if (photo) {
        try {
          const { fileName, publicUrl } = await uploadImageToSupabase({
            uri: photo,
            bucket: "spot-photos",
            pathPrefix: `spot_${spot.id}`,
          });

          await supabase.from("spot_photos").insert({
            spot_id: spot.id,
            url: publicUrl,
          });

          await supabase
            .from("spots")
            .update({
              header_photo_path: fileName,
            })
            .eq("id", spot.id);
        } catch (e: any) {
          console.warn("Foto-Upload fehlgeschlagen:", e?.message || e);
        }
      }

      if (moodA || moodB) {
        await supabase.from("reviews").insert({
          spot_id: spot.id,
          mood_a: moodA || null,
          mood_b: moodB || null,
          text: null,
          user_id: user.user.id,
        });
      }

      await saveSpotContentAndIntelligence(spot.id);

      Alert.alert("Erfolg", "Neuer Spot wurde hinzugefügt!");
      router.replace("/(tabs)/map");
    } catch (e: any) {
      console.error(e);
      Alert.alert("Fehler", e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  /* ========= UI ========= */
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#000" }} edges={["top"]}>
      {/* 🔙 Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={28} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>Neuen Spot hinzufügen</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        {/* Name */}
        <Text style={styles.label}>Name *</Text>
        <TextInput
          placeholder="Name"
          placeholderTextColor="#777"
          value={name}
          onChangeText={setName}
          style={styles.input}
        />

        {/* Adresse */}
        <Text style={styles.label}>Adresse *</Text>
        <TextInput
          placeholder="Adresse eingeben"
          placeholderTextColor="#777"
          value={address}
          onChangeText={onAddressChange}
          style={styles.input}
        />
        {suggestions.length > 0 && (
          <View style={styles.suggestionBox}>
            {suggestions.map((s) => (
              <Pressable
                key={s.id}
                onPress={() => {
                  setAddress(s.place_name);
                  setCoords(s.coords);
                  setSuggestions([]);
                }}
                style={styles.suggestionItem}
              >
                <Text style={{ color: "#fff" }}>{s.place_name}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* Kategorie */}
        <Text style={styles.label}>Kategorie *</Text>
        <Pressable
          onPress={() => setPickerOpen(true)}
          style={[styles.input, styles.categorySelect]}
        >
          <Text style={{ color: categoryId ? "#fff" : "#777" }}>
            {categoryId
              ? categories.find((c) => c.id === categoryId)?.name
              : "Kategorie auswählen"}
          </Text>
          <Ionicons name="chevron-down" size={18} color="#888" />
        </Pressable>

        {/* Foto */}
        <Text style={styles.label}>Foto</Text>
        {photo ? (
          <Image
            source={{ uri: photo }}
            style={{
              width: "100%",
              height: 200,
              borderRadius: 12,
              marginBottom: 12,
            }}
          />
        ) : (
          <Text style={{ color: "#777", marginBottom: 12 }}>
            Noch kein Foto ausgewählt
          </Text>
        )}
        <View style={styles.photoButtons}>
          <Pressable
            onPress={() => pickImage(false)}
            style={[styles.photoBtn, { backgroundColor: "#2563EB" }]}
          >
            <Text style={styles.photoBtnText}>Galerie</Text>
          </Pressable>
          <Pressable
            onPress={() => pickImage(true)}
            style={[styles.photoBtn, { backgroundColor: "#10B981" }]}
          >
            <Text style={styles.photoBtnText}>Kamera</Text>
          </Pressable>
        </View>

        {/* Beschreibung / Intelligence */}
        <Text style={styles.sectionTitle}>Für bessere Empfehlungen</Text>
        <Text style={styles.helperText}>
          Optional, aber sehr wertvoll für die Decision Engine.
        </Text>

        <Text style={styles.label}>Beschreibung</Text>
        <TextInput
          placeholder="Was macht diesen Ort besonders? Stimmung, Angebot, Vibe…"
          placeholderTextColor="#777"
          value={description}
          onChangeText={setDescription}
          style={[styles.input, styles.textArea]}
          multiline
        />

        <Text style={styles.label}>Keywords</Text>
        <TextInput
          placeholder="z. B. ruhig, urban, Kaffee, Date, Regenwetter"
          placeholderTextColor="#777"
          value={keywords}
          onChangeText={setKeywords}
          style={[styles.input, styles.textAreaSmall]}
          multiline
        />

        <Text style={styles.label}>Gut für</Text>
        <TextInput
          placeholder="z. B. Date, Solo, Arbeiten, ruhiger Nachmittag"
          placeholderTextColor="#777"
          value={bestFor}
          onChangeText={setBestFor}
          style={[styles.input, styles.textAreaSmall]}
          multiline
        />

        <Text style={styles.label}>Atmosphäre</Text>
        <TextInput
          placeholder="z. B. warm, ruhig, lebhaft, inspirierend"
          placeholderTextColor="#777"
          value={atmosphereTags}
          onChangeText={setAtmosphereTags}
          style={[styles.input, styles.textAreaSmall]}
          multiline
        />

        <Text style={styles.label}>Eher nicht geeignet für</Text>
        <TextInput
          placeholder="z. B. grosse Gruppen, Party, schnelles Essen"
          placeholderTextColor="#777"
          value={avoidIfTags}
          onChangeText={setAvoidIfTags}
          style={[styles.input, styles.textAreaSmall]}
          multiline
        />

        <Text style={styles.label}>Gute Zeiten / Situationen</Text>
        <TextInput
          placeholder="z. B. Nachmittag, Abend, Wochenende, Regen"
          placeholderTextColor="#777"
          value={goodForTime}
          onChangeText={setGoodForTime}
          style={[styles.input, styles.textAreaSmall]}
          multiline
        />

        <Text style={styles.label}>Geräuschlevel</Text>
        <View style={styles.segmentRow}>
          {["quiet", "moderate", "lively", "loud"].map((level) => (
            <Pressable
              key={level}
              onPress={() => setNoiseLevel(noiseLevel === level ? "" : level)}
              style={[
                styles.segmentPill,
                noiseLevel === level && styles.segmentPillActive,
              ]}
            >
              <Text
                style={[
                  styles.segmentText,
                  noiseLevel === level && styles.segmentTextActive,
                ]}
              >
                {level}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Moods */}
        <Text style={styles.label}>Mood A (optional)</Text>
        <TextInput
          placeholder="z. B. romantisch"
          placeholderTextColor="#777"
          value={moodA}
          onChangeText={setMoodA}
          style={styles.input}
        />
        <Text style={styles.label}>Mood B (optional)</Text>
        <TextInput
          placeholder="z. B. entspannt"
          placeholderTextColor="#777"
          value={moodB}
          onChangeText={setMoodB}
          style={styles.input}
        />

        {/* Submit */}
        <Pressable onPress={submit} style={styles.submitBtn} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.submitText}>Spot speichern</Text>
          )}
        </Pressable>
      </ScrollView>

      {/* Kategorie Modal */}
      <Modal
        visible={pickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setPickerOpen(false)}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Kategorie auswählen</Text>
            <FlatList
              data={categories}
              keyExtractor={(it) => it.id}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => {
                    setCategoryId(item.id);
                    setPickerOpen(false);
                  }}
                  style={[
                    styles.modalItem,
                    {
                      backgroundColor:
                        categoryId === item.id
                          ? "rgba(16,185,129,0.15)"
                          : "#141417",
                      borderColor: categoryId === item.id ? "#10B981" : "#222",
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: item.color ?? "#fff",
                      fontWeight: "600",
                    }}
                  >
                    {item.icon ? `${item.icon} ` : ""}
                    {item.name}
                  </Text>
                  {categoryId === item.id && (
                    <Ionicons name="checkmark" size={18} color="#10B981" />
                  )}
                </Pressable>
              )}
              ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            />
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

/* ========= 🎨 STYLES ========= */
const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 8,
    backgroundColor: "#000",
  },
  headerTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "800",
  },
  container: {
    padding: 16,
    paddingBottom: 120,
    backgroundColor: "#000",
  },
  label: {
    color: "#fff",
    fontWeight: "600",
    marginBottom: 6,
    marginTop: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: "#333",
    borderRadius: 10,
    padding: 12,
    color: "#fff",
  },
  textArea: {
    minHeight: 110,
    textAlignVertical: "top",
  },
  textAreaSmall: {
    minHeight: 74,
    textAlignVertical: "top",
  },
  sectionTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
    marginTop: 26,
    marginBottom: 4,
  },
  helperText: {
    color: "#888",
    marginBottom: 4,
  },
  segmentRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  segmentPill: {
    borderWidth: 1,
    borderColor: "#333",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#111",
  },
  segmentPillActive: {
    borderColor: "#10B981",
    backgroundColor: "rgba(16,185,129,0.15)",
  },
  segmentText: {
    color: "#aaa",
    fontWeight: "700",
  },
  segmentTextActive: {
    color: "#10B981",
  },
  categorySelect: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  suggestionBox: {
    backgroundColor: "#111",
    borderRadius: 8,
    marginTop: 4,
  },
  suggestionItem: {
    padding: 10,
    borderBottomWidth: 1,
    borderColor: "#222",
  },
  photoButtons: {
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
  },
  photoBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  photoBtnText: { color: "#fff", fontWeight: "600" },
  submitBtn: {
    marginTop: 28,
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 999,
    alignItems: "center",
  },
  submitText: {
    color: "#000",
    fontWeight: "700",
    fontSize: 16,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    backgroundColor: "#111",
    borderRadius: 16,
    padding: 16,
    borderColor: "#222",
    borderWidth: StyleSheet.hairlineWidth,
    maxHeight: "70%",
  },
  modalTitle: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 18,
    marginBottom: 12,
  },
  modalItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#141417",
    borderRadius: 12,
    padding: 12,
    borderColor: "#222",
    borderWidth: StyleSheet.hairlineWidth,
  },
});
