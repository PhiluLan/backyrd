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
    <SafeAreaView style={{ flex: 1, backgroundColor: "#050506" }} edges={["top"]}>
      {/* 🔙 Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={28} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>Neuen Spot hinzufügen</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.hero}>
          <Text style={styles.kicker}>BACKYRD SPOT</Text>
          <Text style={styles.heroTitle}>Neuen Ort anlegen</Text>
          <Text style={styles.heroText}>Erfasse die Basics. Details helfen später der Decision Engine.</Text>
        </View>

        {/* Name */}
        <Text style={styles.label}>Name *</Text>
        <TextInput
          placeholder="Name"
          placeholderTextColor="rgba(255,255,255,0.34)"
          value={name}
          onChangeText={setName}
          style={styles.input}
        />

        {/* Adresse */}
        <Text style={styles.label}>Adresse *</Text>
        <TextInput
          placeholder="Adresse eingeben"
          placeholderTextColor="rgba(255,255,255,0.34)"
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
                <Text style={styles.suggestionText}>{s.place_name}</Text>
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
          <Text style={{ color: categoryId ? "#fff" : "rgba(255,255,255,0.34)", fontWeight: "700" }}>
            {categoryId
              ? categories.find((c) => c.id === categoryId)?.name
              : "Kategorie auswählen"}
          </Text>
          <Ionicons name="chevron-down" size={18} color="rgba(255,255,255,0.56)" />
        </Pressable>

        {/* Foto */}
        <Text style={styles.label}>Foto</Text>
        {photo ? (
          <Image
            source={{ uri: photo }}
            style={styles.photoPreview}
          />
        ) : (
          <View style={styles.photoEmpty}>
            <Ionicons name="image-outline" size={26} color="rgba(255,255,255,0.42)" />
            <Text style={styles.photoEmptyText}>Noch kein Foto ausgewählt</Text>
          </View>
        )}
        <View style={styles.photoButtons}>
          <Pressable
            onPress={() => pickImage(false)}
            style={styles.photoBtn}
          >
            <Text style={styles.photoBtnText}>Galerie</Text>
          </Pressable>
          <Pressable
            onPress={() => pickImage(true)}
            style={[styles.photoBtn, styles.photoBtnAccent]}
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
          placeholderTextColor="rgba(255,255,255,0.34)"
          value={description}
          onChangeText={setDescription}
          style={[styles.input, styles.textArea]}
          multiline
        />

        <Text style={styles.label}>Keywords</Text>
        <TextInput
          placeholder="z. B. ruhig, urban, Kaffee, Date, Regenwetter"
          placeholderTextColor="rgba(255,255,255,0.34)"
          value={keywords}
          onChangeText={setKeywords}
          style={[styles.input, styles.textAreaSmall]}
          multiline
        />

        <Text style={styles.label}>Gut für</Text>
        <TextInput
          placeholder="z. B. Date, Solo, Arbeiten, ruhiger Nachmittag"
          placeholderTextColor="rgba(255,255,255,0.34)"
          value={bestFor}
          onChangeText={setBestFor}
          style={[styles.input, styles.textAreaSmall]}
          multiline
        />

        <Text style={styles.label}>Atmosphäre</Text>
        <TextInput
          placeholder="z. B. warm, ruhig, lebhaft, inspirierend"
          placeholderTextColor="rgba(255,255,255,0.34)"
          value={atmosphereTags}
          onChangeText={setAtmosphereTags}
          style={[styles.input, styles.textAreaSmall]}
          multiline
        />

        <Text style={styles.label}>Eher nicht geeignet für</Text>
        <TextInput
          placeholder="z. B. grosse Gruppen, Party, schnelles Essen"
          placeholderTextColor="rgba(255,255,255,0.34)"
          value={avoidIfTags}
          onChangeText={setAvoidIfTags}
          style={[styles.input, styles.textAreaSmall]}
          multiline
        />

        <Text style={styles.label}>Gute Zeiten / Situationen</Text>
        <TextInput
          placeholder="z. B. Nachmittag, Abend, Wochenende, Regen"
          placeholderTextColor="rgba(255,255,255,0.34)"
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
          placeholderTextColor="rgba(255,255,255,0.34)"
          value={moodA}
          onChangeText={setMoodA}
          style={styles.input}
        />
        <Text style={styles.label}>Mood B (optional)</Text>
        <TextInput
          placeholder="z. B. entspannt"
          placeholderTextColor="rgba(255,255,255,0.34)"
          value={moodB}
          onChangeText={setMoodB}
          style={styles.input}
        />

        {/* Submit */}
        <Pressable onPress={submit} style={styles.submitBtn} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#171214" />
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
                          ? "rgba(255,125,167,0.14)"
                          : "#141417",
                      borderColor: categoryId === item.id ? "#FF7DA7" : "rgba(255,255,255,0.09)",
                    },
                  ]}
                >
                  <Text
                    style={styles.modalItemText}
                  >
                    {item.icon ? `${item.icon} ` : ""}
                    {item.name}
                  </Text>
                  {categoryId === item.id && (
                    <Ionicons name="checkmark" size={18} color="#FF7DA7" />
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
    paddingHorizontal: 20,
    paddingBottom: 10,
    backgroundColor: "#050506",
  },
  headerTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "800",
  },
  container: {
    paddingHorizontal: 20,
    paddingBottom: 120,
    backgroundColor: "#050506",
  },
  hero: {
    marginTop: 6,
    marginBottom: 22,
  },
  kicker: {
    color: "#FF9ABA",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 3,
    marginBottom: 12,
  },
  heroTitle: {
    color: "#fff",
    fontSize: 40,
    lineHeight: 42,
    fontWeight: "900",
    letterSpacing: -1,
  },
  heroText: {
    color: "rgba(255,255,255,0.56)",
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "600",
    marginTop: 10,
    maxWidth: 330,
  },
  label: {
    color: "rgba(255,255,255,0.56)",
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 7,
    marginTop: 16,
    marginLeft: 2,
  },
  input: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    borderRadius: 18,
    paddingHorizontal: 15,
    paddingVertical: 14,
    color: "#fff",
    backgroundColor: "#111113",
    fontSize: 15,
    fontWeight: "700",
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
    fontSize: 22,
    lineHeight: 27,
    fontWeight: "900",
    marginTop: 26,
    marginBottom: 4,
    letterSpacing: -0.45,
  },
  helperText: {
    color: "rgba(255,255,255,0.56)",
    marginBottom: 4,
    lineHeight: 20,
    fontWeight: "600",
  },
  segmentRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  segmentPill: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "rgba(255,255,255,0.055)",
  },
  segmentPillActive: {
    borderColor: "#FF7DA7",
    backgroundColor: "#FF7DA7",
  },
  segmentText: {
    color: "rgba(255,255,255,0.72)",
    fontWeight: "700",
  },
  segmentTextActive: {
    color: "#171214",
  },
  categorySelect: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  suggestionBox: {
    backgroundColor: "#111113",
    borderRadius: 18,
    marginTop: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    overflow: "hidden",
  },
  suggestionItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  suggestionText: {
    color: "#fff",
    fontWeight: "700",
    lineHeight: 19,
  },
  photoPreview: {
    width: "100%",
    height: 220,
    borderRadius: 28,
    marginBottom: 12,
    backgroundColor: "#111113",
  },
  photoEmpty: {
    height: 160,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    backgroundColor: "rgba(255,255,255,0.045)",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  photoEmptyText: {
    color: "rgba(255,255,255,0.56)",
    fontWeight: "700",
  },
  photoButtons: {
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
  },
  photoBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 999,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
  },
  photoBtnAccent: {
    backgroundColor: "rgba(255,125,167,0.14)",
    borderColor: "rgba(255,125,167,0.28)",
  },
  photoBtnText: { color: "#fff", fontWeight: "800" },
  submitBtn: {
    marginTop: 28,
    backgroundColor: "#FF7DA7",
    padding: 16,
    borderRadius: 999,
    alignItems: "center",
  },
  submitText: {
    color: "#171214",
    fontWeight: "900",
    fontSize: 16,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    backgroundColor: "#111113",
    borderRadius: 28,
    padding: 16,
    borderColor: "rgba(255,255,255,0.09)",
    borderWidth: 1,
    maxHeight: "70%",
  },
  modalTitle: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 22,
    marginBottom: 12,
  },
  modalItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#141417",
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
  },
  modalItemText: {
    color: "#fff",
    fontWeight: "800",
  },
});
