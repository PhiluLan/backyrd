// mobile/app/onboarding/index.tsx

import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import * as Location from "expo-location";

import { supabase } from "../../lib/supabase";
import { ensureProfile } from "../../lib/profile";

type ProfileRow = {
  id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  city: string | null;
  home_city: string | null;
  country: string | null;
  birthdate: string | null;
};

function clean(value: string | null | undefined) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function usernameFrom(value: string) {
  return clean(value)
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9._-]/g, "")
    .slice(0, 24);
}

function birthdateFromAge(ageText: string) {
  const age = Number.parseInt(ageText.trim(), 10);

  if (!Number.isFinite(age) || age < 13 || age > 120) {
    return null;
  }

  const year = new Date().getFullYear() - age;
  return `${year}-01-01`;
}

function ageFromBirthdate(birthdate: string | null | undefined) {
  if (!birthdate) return "";

  const year = Number.parseInt(String(birthdate).slice(0, 4), 10);
  if (!Number.isFinite(year)) return "";

  const age = new Date().getFullYear() - year;
  return String(age);
}

function getCityFromGeocode(item: Location.LocationGeocodedAddress | null | undefined) {
  return clean(item?.city) || clean(item?.subregion) || clean(item?.region) || "";
}

function makeUsernameCandidate(base: string, userId: string) {
  const cleanedBase = usernameFrom(base) || "user";
  const suffix = String(userId || "").replace(/-/g, "").slice(0, 6).toLowerCase();
  const maxBaseLength = Math.max(3, 24 - 1 - suffix.length);
  return `${cleanedBase.slice(0, maxBaseLength)}.${suffix}`.slice(0, 24);
}

function isUsernameDuplicateError(error: any) {
  const message = String(error?.message ?? "").toLowerCase();
  const details = String(error?.details ?? "").toLowerCase();
  const code = String(error?.code ?? "").toLowerCase();

  return (
    code === "23505" ||
    message.includes("profiles_username_lower_unique_idx") ||
    details.includes("profiles_username_lower_unique_idx") ||
    message.includes("duplicate key value")
  );
}

async function getVerifiedUserOrSignOut() {
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user?.id) {
    console.log("profile onboarding stale/invalid auth user", error?.message ?? "No user");
    try {
      await supabase.auth.signOut();
    } catch (signOutError) {
      console.log("signOut after invalid auth user failed", signOutError);
    }
    return null;
  }

  return data.user;
}

export default function ProfileOnboardingScreen() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [username, setUsername] = useState("");
  const [age, setAge] = useState("");
  const [city, setCity] = useState("Basel");
  const [country, setCountry] = useState("Schweiz");
  const [locationLoading, setLocationLoading] = useState(false);

  const birthdate = useMemo(() => birthdateFromAge(age), [age]);

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const user = await getVerifiedUserOrSignOut();

        if (!user?.id) {
          router.replace("/gate" as any);
          return;
        }

        await ensureProfile();

        const { data, error } = await supabase
          .from("profiles")
          .select("id,display_name,first_name,last_name,username,city,home_city,country,birthdate")
          .eq("id", user.id)
          .maybeSingle();

        if (error) throw error;

        if (!alive) return;

        const profile = data as ProfileRow | null;

        const nextFirstName = clean(profile?.first_name) || clean(profile?.display_name) || clean(user.email?.split("@")[0]);
        setFirstName(nextFirstName);
        setUsername(usernameFrom(profile?.username || nextFirstName));
        setAge(ageFromBirthdate(profile?.birthdate));
        setCity(clean(profile?.city) || clean(profile?.home_city) || "Basel");
        setCountry(clean(profile?.country) || "Schweiz");
      } catch (error) {
        console.log("profile onboarding load failed", error);
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();

    return () => {
      alive = false;
    };
  }, [router]);

  async function detectLocation() {
    try {
      setLocationLoading(true);

      const permission = await Location.requestForegroundPermissionsAsync();

      if (permission.status !== "granted") {
        Alert.alert("Standort nicht freigegeben", "Kein Problem — du kannst deine Stadt manuell eingeben.");
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const geocoded = await Location.reverseGeocodeAsync({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });

      const detectedCity = getCityFromGeocode(geocoded[0]);

      if (!detectedCity) {
        Alert.alert("Stadt nicht erkannt", "Bitte gib deine Stadt manuell ein.");
        return;
      }

      setCity(detectedCity);
    } catch (error: any) {
      Alert.alert("Standort fehlgeschlagen", error?.message ?? "Bitte gib deine Stadt manuell ein.");
    } finally {
      setLocationLoading(false);
    }
  }

  async function saveProfile() {
    const cleanedFirstName = clean(firstName);
    const cleanedUsername = usernameFrom(username);
    const cleanedCity = clean(city);
    const cleanedCountry = clean(country) || "Schweiz";

    if (!cleanedFirstName) {
      Alert.alert("Name fehlt", "Bitte gib deinen Namen ein.");
      return;
    }

    if (!cleanedUsername || cleanedUsername.length < 3) {
      Alert.alert("Benutzername fehlt", "Bitte wähle einen Benutzernamen mit mindestens 3 Zeichen.");
      return;
    }

    if (!birthdate) {
      Alert.alert("Alter prüfen", "Bitte gib dein Alter als Zahl ein. Backyrd ist ab 13 Jahren.");
      return;
    }

    if (!cleanedCity) {
      Alert.alert("Stadt fehlt", "Bitte gib deine aktuelle Stadt ein.");
      return;
    }

    try {
      setSaving(true);

      const user = await getVerifiedUserOrSignOut();

      if (!user?.id) {
        router.replace("/gate" as any);
        return;
      }

      const userId = user.id;

      const payload = {
        id: userId,
        display_name: cleanedFirstName,
        first_name: cleanedFirstName,
        username: cleanedUsername,
        birthdate,
        city: cleanedCity,
        home_city: cleanedCity,
        country: cleanedCountry,
        contact_email: user.email ?? null,
        profile_onboarding_completed_at: new Date().toISOString(),
      };

      const firstAttempt = await supabase
        .from("profiles")
        .upsert(payload, { onConflict: "id" })
        .select("id,username")
        .single();

      if (firstAttempt.error) {
        if (!isUsernameDuplicateError(firstAttempt.error)) {
          throw firstAttempt.error;
        }

        const fallbackUsername = makeUsernameCandidate(cleanedUsername || cleanedFirstName, userId);

        const secondAttempt = await supabase
          .from("profiles")
          .upsert(
            {
              ...payload,
              username: fallbackUsername,
            },
            { onConflict: "id" }
          )
          .select("id,username")
          .single();

        if (secondAttempt.error) throw secondAttempt.error;

        setUsername(fallbackUsername);
      }

      Keyboard.dismiss();
      router.replace("/gate" as any);
    } catch (error: any) {
      console.log("profile onboarding save failed", error);

      if (isUsernameDuplicateError(error)) {
        Alert.alert(
          "Benutzername vergeben",
          "Dieser Benutzername ist schon vergeben. Bitte nimm eine kleine Variante, zum Beispiel mit Punkt oder Zahl."
        );
        return;
      }

      Alert.alert("Speichern fehlgeschlagen", error?.message ?? "Profil konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.keyboardRoot} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <LinearGradient colors={["#050506", "#09090A", "#0D0D10"]} style={styles.container}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            <View style={styles.topRow}>
              <Text numberOfLines={1} style={styles.location}>{clean(city) || "Basel"}</Text>
              <View style={styles.stepPill}>
                <Text style={styles.stepText}>1 von 2</Text>
              </View>
            </View>

            <View style={styles.hero}>
              <Text style={styles.kicker}>BACKYRD</Text>
              <Text style={styles.title}>
                Willkommen bei{"\n"}
                <Text style={styles.titlePink}>Backyrd.</Text>
              </Text>
              <Text style={styles.subtitle}>
                Kurz dein Profil anlegen. Danach baust du deinen ersten Geschmack auf.
              </Text>
            </View>

            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>Deine Basics</Text>
                <Text style={styles.cardHint}>Nur was wir für gute Vorschläge brauchen.</Text>
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Name</Text>
                <TextInput
                  value={firstName}
                  onChangeText={(value) => {
                    setFirstName(value);
                    if (!username) setUsername(usernameFrom(value));
                  }}
                  placeholder="Philipp"
                  placeholderTextColor="rgba(255,255,255,0.34)"
                  autoCapitalize="words"
                  style={styles.input}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Benutzername</Text>
                <TextInput
                  value={username}
                  onChangeText={(value) => setUsername(usernameFrom(value))}
                  placeholder="philipp"
                  placeholderTextColor="rgba(255,255,255,0.34)"
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.input}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Alter</Text>
                <TextInput
                  value={age}
                  onChangeText={setAge}
                  placeholder="31"
                  placeholderTextColor="rgba(255,255,255,0.34)"
                  keyboardType="number-pad"
                  style={styles.input}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Stadt</Text>
                <View style={styles.cityRow}>
                  <TextInput
                    value={city}
                    onChangeText={setCity}
                    placeholder="Basel"
                    placeholderTextColor="rgba(255,255,255,0.34)"
                    autoCapitalize="words"
                    style={[styles.input, styles.cityInput]}
                  />

                  <Pressable
                    onPress={detectLocation}
                    disabled={locationLoading}
                    style={({ pressed }) => [styles.locationButton, pressed && styles.pressed]}
                  >
                    {locationLoading ? (
                      <ActivityIndicator size="small" color="#171214" />
                    ) : (
                      <Text style={styles.locationButtonText}>Aktuell</Text>
                    )}
                  </Pressable>
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Land</Text>
                <TextInput
                  value={country}
                  onChangeText={setCountry}
                  placeholder="Schweiz"
                  placeholderTextColor="rgba(255,255,255,0.34)"
                  autoCapitalize="words"
                  style={styles.input}
                />
              </View>

              <Pressable
                onPress={saveProfile}
                disabled={saving}
                style={({ pressed }) => [styles.primaryButton, saving && styles.disabled, pressed && styles.pressed]}
              >
                {saving ? <ActivityIndicator color="#171214" /> : <Text style={styles.primaryButtonText}>Weiter</Text>}
              </Pressable>
            </View>

            <Text style={styles.footerNote}>
              Dein Profil hilft Backyrd, Orte persönlicher zu sortieren. Du kannst alles später ändern.
            </Text>
          </ScrollView>
        </LinearGradient>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardRoot: {
    flex: 1,
    backgroundColor: "#050506",
  },
  loading: {
    flex: 1,
    backgroundColor: "#0B0B0C",
    alignItems: "center",
    justifyContent: "center",
  },
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: Platform.select({ ios: 70, android: 42, default: 42 }),
    paddingBottom: 34,
  },
  topRow: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 30,
  },
  location: {
    color: "rgba(255,255,255,0.92)",
    fontSize: 20,
    lineHeight: 24,
    fontWeight: "700",
    letterSpacing: -0.35,
  },
  stepPill: {
    height: 34,
    paddingHorizontal: 13,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    alignItems: "center",
    justifyContent: "center",
  },
  stepText: {
    color: "rgba(255,255,255,0.66)",
    fontSize: 12,
    fontWeight: "800",
  },
  hero: {
    marginBottom: 26,
  },
  kicker: {
    color: "#FF9ABA",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 4.2,
    marginBottom: 16,
  },
  title: {
    color: "#fff",
    fontSize: 44,
    lineHeight: 46,
    fontWeight: "800",
    letterSpacing: -1.35,
  },
  titlePink: {
    color: "#FF7DA7",
    fontWeight: "900",
  },
  subtitle: {
    color: "rgba(255,255,255,0.66)",
    fontSize: 16,
    lineHeight: 23,
    marginTop: 14,
    maxWidth: 330,
  },
  card: {
    borderRadius: 28,
    padding: 16,
    backgroundColor: "rgba(255,255,255,0.045)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
  },
  cardHeader: {
    marginBottom: 18,
  },
  cardTitle: {
    color: "#fff",
    fontSize: 22,
    lineHeight: 27,
    fontWeight: "800",
    letterSpacing: -0.45,
  },
  cardHint: {
    color: "rgba(255,255,255,0.48)",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
    marginTop: 5,
  },
  field: {
    marginBottom: 13,
  },
  label: {
    color: "rgba(255,255,255,0.48)",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.25,
    marginBottom: 8,
    marginLeft: 4,
  },
  input: {
    minHeight: 56,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderColor: "rgba(255,255,255,0.095)",
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 18,
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
  },
  cityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  cityInput: {
    flex: 1,
  },
  locationButton: {
    minWidth: 94,
    height: 56,
    borderRadius: 18,
    backgroundColor: "#FFD4E0",
    borderWidth: 1,
    borderColor: "rgba(255,125,167,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  locationButtonText: {
    color: "#171214",
    fontWeight: "900",
    fontSize: 13,
  },
  primaryButton: {
    height: 58,
    borderRadius: 999,
    backgroundColor: "#FF7DA7",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  primaryButtonText: {
    color: "#171214",
    fontSize: 16,
    fontWeight: "900",
  },
  footerNote: {
    color: "rgba(255,255,255,0.42)",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
    marginTop: 18,
    paddingHorizontal: 4,
  },
  disabled: {
    opacity: 0.58,
  },
  pressed: {
    opacity: 0.86,
    transform: [{ scale: 0.99 }],
  },
});
