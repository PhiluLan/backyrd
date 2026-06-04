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
        <LinearGradient colors={["#050506", "#0A0A0B", "#191A22"]} style={styles.container}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            <Text style={styles.kicker}>PROFIL</Text>
            <Text style={styles.title}>Kurz zu dir.</Text>
            <Text style={styles.subtitle}>
              Damit Backyrd persönlicher wird, brauchen wir nur die Basics. Danach wählst du drei Lieblingsorte als Startgeschmack.
            </Text>

            <View style={styles.card}>
              <Text style={styles.label}>Name</Text>
              <TextInput
                value={firstName}
                onChangeText={(value) => {
                  setFirstName(value);
                  if (!username) setUsername(usernameFrom(value));
                }}
                placeholder="Philipp"
                placeholderTextColor="rgba(255,255,255,0.36)"
                autoCapitalize="words"
                style={styles.input}
              />

              <Text style={styles.label}>Benutzername</Text>
              <TextInput
                value={username}
                onChangeText={(value) => setUsername(usernameFrom(value))}
                placeholder="philipp"
                placeholderTextColor="rgba(255,255,255,0.36)"
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.input}
              />

              <Text style={styles.label}>Alter</Text>
              <TextInput
                value={age}
                onChangeText={setAge}
                placeholder="31"
                placeholderTextColor="rgba(255,255,255,0.36)"
                keyboardType="number-pad"
                style={styles.input}
              />

              <Text style={styles.label}>Stadt</Text>
              <View style={styles.cityRow}>
                <TextInput
                  value={city}
                  onChangeText={setCity}
                  placeholder="Basel"
                  placeholderTextColor="rgba(255,255,255,0.36)"
                  autoCapitalize="words"
                  style={[styles.input, styles.cityInput]}
                />

                <Pressable
                  onPress={detectLocation}
                  disabled={locationLoading}
                  style={({ pressed }) => [styles.locationButton, pressed && styles.pressed]}
                >
                  {locationLoading ? (
                    <ActivityIndicator size="small" />
                  ) : (
                    <Text style={styles.locationButtonText}>Erkennen</Text>
                  )}
                </Pressable>
              </View>

              <Text style={styles.label}>Land</Text>
              <TextInput
                value={country}
                onChangeText={setCountry}
                placeholder="Schweiz"
                placeholderTextColor="rgba(255,255,255,0.36)"
                autoCapitalize="words"
                style={styles.input}
              />

              <Pressable
                onPress={saveProfile}
                disabled={saving}
                style={({ pressed }) => [styles.primaryButton, saving && styles.disabled, pressed && styles.pressed]}
              >
                {saving ? <ActivityIndicator /> : <Text style={styles.primaryButtonText}>Weiter zu deinem Geschmack</Text>}
              </Pressable>
            </View>
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
    paddingTop: Platform.select({ ios: 78, android: 48, default: 48 }),
    paddingBottom: 42,
  },
  kicker: {
    color: "rgba(255,255,255,0.46)",
    fontSize: 13,
    fontWeight: "950",
    letterSpacing: 6,
    marginBottom: 18,
  },
  title: {
    color: "#fff",
    fontSize: 42,
    lineHeight: 45,
    fontWeight: "950",
    letterSpacing: -1.2,
  },
  subtitle: {
    color: "rgba(255,255,255,0.68)",
    fontSize: 17,
    lineHeight: 25,
    marginTop: 12,
    marginBottom: 22,
  },
  card: {
    borderRadius: 30,
    padding: 18,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  label: {
    color: "rgba(255,255,255,0.64)",
    fontSize: 13,
    fontWeight: "950",
    letterSpacing: 0.3,
    marginBottom: 7,
    marginLeft: 2,
  },
  input: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 15,
    borderRadius: 17,
    marginBottom: 14,
    color: "#fff",
    fontSize: 17,
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
    marginBottom: 14,
    minWidth: 98,
    height: 54,
    borderRadius: 17,
    backgroundColor: "rgba(244,235,221,0.12)",
    borderWidth: 1,
    borderColor: "rgba(244,235,221,0.28)",
    alignItems: "center",
    justifyContent: "center",
  },
  locationButtonText: {
    color: "#F4EBDD",
    fontWeight: "950",
  },
  primaryButton: {
    height: 58,
    borderRadius: 18,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },
  primaryButtonText: {
    color: "#050506",
    fontSize: 16,
    fontWeight: "950",
  },
  disabled: {
    opacity: 0.58,
  },
  pressed: {
    opacity: 0.86,
    transform: [{ scale: 0.99 }],
  },
});
