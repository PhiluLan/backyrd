// app/(tabs)/profile.tsx
import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  Image,
  Pressable,
  Animated,
  Dimensions,
  TextInput,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { supabase } from "../../lib/supabase";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { decode } from "base64-arraybuffer";
import { PanResponder } from "react-native";

const { width } = Dimensions.get("window");

export default function ProfileScreen() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [tab, setTab] = useState<"posts" | "favorites" | "badges">("posts");
  const [reviews, setReviews] = useState<any[]>([]);
  const [favorites, setFavorites] = useState<any[]>([]);
  const [badges, setBadges] = useState<any[]>([]);
  const [showEdit, setShowEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const infoTranslateY = useRef(new Animated.Value(0)).current; 
  const infoStartY = useRef(0);



  const scrollY = useRef(new Animated.Value(0)).current;

  // ---------------------------------------------------------
  // LOAD USER + DATA
  // ---------------------------------------------------------
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const u = data.user;
      setUser(u);
      if (!u) return;

      const { data: prof } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", u.id)
        .single();
      setProfile(prof);

      const { data: rev } = await supabase
        .from("reviews")
        .select("*, spots(name, header_photo_path, spot_photos(url))")
        .eq("user_id", u.id)
        .order("created_at", { ascending: false });
      setReviews(rev || []);

      const { data: fav } = await supabase
        .from("favorites")
        .select("spot_id, spots(name, header_photo_path, spot_photos(url))")
        .eq("user_id", u.id);
      setFavorites(fav || []);

      const { data: badgeRows } = await supabase
        .from("user_achievements")
        .select("achievements(name, icon_url, tier)")
        .eq("user_id", u.id);
      setBadges(badgeRows || []);
    });
  }, []);

  // ---------------------------------------------------------
  // HEADER ANIMATION (nur Optik, kein Sticky mehr)
  // ---------------------------------------------------------
  const HEADER_MAX = 320;
  const HEADER_MIN = 160;

  const headerHeight = scrollY.interpolate({
    inputRange: [0, 200],
    outputRange: [HEADER_MAX, HEADER_MIN],
    extrapolate: "clamp",
  });

  // ---------------------------------------------------------
  // AVATAR / HEADER UPLOAD
  // ---------------------------------------------------------
  async function pickImageAndUploadAvatar() {
    if (!user) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
      base64: true,
    });

    if (result.canceled) return;

    const asset = result.assets[0];
    if (!asset.base64) return;

    const ext = asset.fileName?.split(".").pop() || "jpg";
    const fileName = `avatar_${user.id}_${Date.now()}.${ext}`;
    const arrayBuffer = decode(asset.base64);

    // Upload
    const { error: uploadError } = await supabase.storage
      .from("profile-photos")
      .upload(fileName, arrayBuffer, {
        contentType: asset.mimeType ?? "image/jpeg",
        upsert: true,
      });

    if (uploadError)
      return Alert.alert("Upload-Fehler", uploadError.message);

    // Public URL holen
    const { data } = supabase.storage
      .from("profile-photos")
      .getPublicUrl(fileName);

    const url = data.publicUrl;

    // Avatar UND Header aktualisieren
    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        avatar_url: url,
        header_photo_url: url, // 👈 AUTOMATISCH
      })
      .eq("id", user.id);

    if (updateError)
      return Alert.alert("Fehler beim Speichern", updateError.message);

    // Lokales Profil aktualisieren
    setProfile({
      ...profile,
      avatar_url: url,
      header_photo_url: url,
    });
  }


  // Convenience wrappers

  const InfoRow = ({ label, value }) => {
    if (!value) return null;

    return (
      <View style={{ marginBottom: 18 }}>
        <Text style={{ color: "#999", fontSize: 13, marginBottom: 4 }}>
          {label}
        </Text>
        <Text style={{ color: "#fff", fontSize: 16 }}>{value}</Text>
      </View>
    );
  };

  const infoPan = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: (_, gestureState) => {
      infoStartY.current = gestureState.dy;
    },
    onPanResponderMove: (_, gestureState) => {
      const drag = gestureState.dy - infoStartY.current;
      if (drag > 0) {
        infoTranslateY.setValue(drag);
      }
    },
    onPanResponderRelease: (_, gestureState) => {
      const drag = gestureState.dy - infoStartY.current;

      // Wenn genug runtergezogen → sheet schließen
      if (drag > 120) {
        Animated.timing(infoTranslateY, {
          toValue: 800,
          duration: 250,
          useNativeDriver: true,
        }).start(() => {
          setShowInfo(false);
          infoTranslateY.setValue(0);
        });
      } else {
        // Zurückfedern
        Animated.spring(infoTranslateY, {
          toValue: 0,
          bounciness: 6,
          useNativeDriver: true,
        }).start();
      }
    },
  });


  // ---------------------------------------------------------
  // SAVE PROFILE
  // ---------------------------------------------------------
  async function saveProfile() {
    if (!user || !profile) return;

    setSaving(true);

    const { error } = await supabase
      .from("profiles")
      .update({
        first_name: profile.first_name,
        last_name: profile.last_name,
        bio: profile.bio,
        city: profile.city,
        since_date: profile.since_date,

        // neue Felder:
        username: profile.username,
        pronouns: profile.pronouns,
        country: profile.country,
        birthdate: profile.birthdate, // erwartet "YYYY-MM-DD"
        instagram: profile.instagram,
        tiktok: profile.tiktok,
        website: profile.website,
        contact_email: profile.contact_email,
        interests: profile.interests,
        personality: profile.personality,
      })
      .eq("id", user.id);

    setSaving(false);

    if (error) {
      Alert.alert("Fehler", error.message);
    } else {
      setShowEdit(false);
      Alert.alert("Gespeichert", "Profil aktualisiert");
    }
  }

  if (!profile)
    return (
      <View style={styles.center}>
        <Text style={{ color: "#999" }}>Profil wird geladen...</Text>
      </View>
    );

  // ---------------------------------------------------------
  // PREMIUM CARD COMPONENT
  // ---------------------------------------------------------
  const Card = ({
    imageUrl,
    title,
    subtitle,
    date,
    onPress,
  }: {
    imageUrl: string;
    title?: string;
    subtitle?: string;
    date?: string;
    onPress?: () => void;
  }) => {
    const scale = useRef(new Animated.Value(1)).current;

    const pressIn = () => {
      Animated.spring(scale, {
        toValue: 0.97,
        useNativeDriver: true,
      }).start();
    };

    const pressOut = () => {
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
      }).start();
    };

    return (
      <Animated.View style={{ transform: [{ scale }] }}>
        <Pressable
          onPressIn={pressIn}
          onPressOut={pressOut}
          onPress={onPress}
          style={styles.newCard}
        >
          <Image source={{ uri: imageUrl }} style={styles.newCardImage} />

          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.75)"]}
            style={styles.newCardGradient}
          />

          <View style={styles.newCardContent}>
            {!!title && (
              <Text style={styles.newCardTitle} numberOfLines={1}>
                {title}
              </Text>
            )}

            {!!subtitle && (
              <Text style={styles.newCardSubtitle} numberOfLines={1}>
                {subtitle}
              </Text>
            )}

            {!!date && (
              <Text style={styles.newCardDate}>{date}</Text>
            )}
          </View>
        </Pressable>
      </Animated.View>
    );
  };

  // ---------------------------------------------------------
  // UI
  // ---------------------------------------------------------
  const headerImage =
    profile.header_photo_url ||
    profile.avatar_url ||
    "https://placehold.co/600x400/222/fff?text=Backyrd";

  const interestChips =
    typeof profile.interests === "string"
      ? profile.interests
          .split(",")
          .map((s: string) => s.trim())
          .filter((s: string) => s.length > 0)
      : [];

  const personalityChips =
    typeof profile.personality === "string"
      ? profile.personality
          .split(",")
          .map((s: string) => s.trim())
          .filter((s: string) => s.length > 0)
      : [];

  return (
    <View style={{ flex: 1, backgroundColor: "#0A0A0B" }}>
      {/* HEADER-BILD IM HINTERGRUND */}
      <Animated.View
        style={[styles.header, { height: headerHeight }]}
        pointerEvents="none"
      >
        <Image
          source={{ uri: headerImage }}
          style={styles.bgImage}
          blurRadius={4}
        />
        <LinearGradient
          colors={["rgba(0,0,0,0.3)", "rgba(0,0,0,0.95)"]}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      {/* ALLES SCROLLT NORMAL MIT */}
      <Animated.ScrollView
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false }
        )}
        scrollEventThrottle={16}
        contentContainerStyle={{
          paddingTop: HEADER_MAX - 80, // Platz für das große Headerbild
          paddingBottom: 150,
        }}
      >
        {/* HEADER-CONTENT (Avatar + Text + Bearbeiten) */}
        <View style={{ paddingHorizontal: 20 }}>
          <BlurView intensity={60} tint="dark" style={styles.profileHeaderBox}>

            {/* Avatar */}
            <Pressable onPress={pickImageAndUploadAvatar} style={styles.avatarWrapper}>
              <Image
                source={{
                  uri:
                    profile.avatar_url ||
                    "https://placehold.co/100x100/333/FFF?text=User",
                }}
                style={styles.avatar}
              />
            </Pressable>
            <View style={{ position: "absolute", top: 14, right: 14 }}>
              <Pressable
                onPress={() => setShowInfo(true)}
                style={{
                  backgroundColor: "rgba(255,255,255,0.15)",
                  borderRadius: 20,
                  padding: 6,
                }}
              >
                <Ionicons name="information-circle-outline" size={20} color="#fff" />
              </Pressable>
            </View>


            {/* Name + Username */}
            <Text style={styles.nameText}>
              {profile.first_name || "User"} {profile.last_name || ""}
            </Text>

            {profile.username && (
              <Text style={styles.usernameText}>
                @{profile.username}
              </Text>
            )}

            {/* Stadt + "seit" */}
            {(profile.city || profile.since_date) && (
              <Text style={styles.cityText}>
                📍 {profile.city || "Unbekannt"}
                {profile.since_date ? ` • seit ${profile.since_date}` : ""}
              </Text>
            )}

            {/* Bio */}
            {profile.bio && (
              <Text style={styles.bioText} numberOfLines={3}>
                {profile.bio}
              </Text>
            )}

            {/* Interests */}
            {interestChips.length > 0 && (
              <View style={styles.chipRow}>
                {interestChips.slice(0, 4).map((chip: string, idx: number) => (
                  <View key={idx} style={styles.moodChip}>
                    <Text style={styles.moodChipText}>{chip}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Personality */}
            {personalityChips.length > 0 && (
              <View style={styles.chipRow}>
                {personalityChips.slice(0, 3).map((chip: string, idx: number) => (
                  <View key={idx} style={styles.subtleChip}>
                    <Text style={styles.subtleChipText}>{chip}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Social Links (nur anzeigen, wenn vorhanden) */}
            {(profile.instagram || profile.tiktok || profile.website) && (
              <View style={styles.socialRow}>
                {profile.instagram && (
                  <View style={styles.socialItem}>
                    <Ionicons name="logo-instagram" size={16} color="#fff" />
                    <Text style={styles.socialText}>
                      @{profile.instagram}
                    </Text>
                  </View>
                )}
                {profile.tiktok && (
                  <View style={styles.socialItem}>
                    <Ionicons name="logo-tiktok" size={16} color="#fff" />
                    <Text style={styles.socialText}>
                      @{profile.tiktok}
                    </Text>
                  </View>
                )}
                {profile.website && (
                  <View style={styles.socialItem}>
                    <Ionicons name="globe-outline" size={16} color="#fff" />
                    <Text style={styles.socialText}>
                      {profile.website}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* Bearbeiten */}
            <Pressable onPress={() => setShowEdit(true)} style={styles.editBtn}>
              <Ionicons name="pencil" size={16} color="#fff" />
              <Text style={styles.editBtnText}>Profil bearbeiten</Text>
            </Pressable>
          </BlurView>

          {/* Tabs direkt UNTER dem Header-Block mit Abstand */}
          <View style={styles.tabsWrapper}>
            <View style={[styles.tabRow, { columnGap: 30 }]}>
              {["posts", "favorites", "badges"].map((t) => (
                <Pressable key={t} onPress={() => setTab(t as any)}>
                  <Text
                    style={[
                      styles.tabText,
                      tab === t && { color: "#fff", fontWeight: "800" },
                    ]}
                  >
                    {t === "posts"
                      ? "Beiträge"
                      : t === "favorites"
                      ? "Favoriten"
                      : "Badges"}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        {/* CONTENT */}
        <View style={{ paddingHorizontal: 20, paddingTop: 10 }}>
          {/* POSTS */}
          {tab === "posts" && (
            <View>
              {reviews.map((item) => {
                const photo =
                  item.spots?.header_photo_path ||
                  item.spots?.spot_photos?.[0]?.url ||
                  item.photo_path ||
                  "https://placehold.co/400x300";

                return (
                  <View key={item.id}>
                    <Card
                      imageUrl={photo}
                      title={item.spots?.name}
                      subtitle={item.text?.slice(0, 60) || ""}
                      date={new Date(item.created_at).toLocaleDateString()}
                    />

                    {/* Review Info */}
                    <View style={styles.reviewInfoBox}>
                      <View style={styles.moodRow}>
                        {item.mood_a && (
                          <View style={styles.moodChip}>
                            <Text style={styles.moodChipText}>{item.mood_a}</Text>
                          </View>
                        )}
                        {item.mood_b && (
                          <View style={styles.moodChip}>
                            <Text style={styles.moodChipText}>{item.mood_b}</Text>
                          </View>
                        )}
                      </View>

                      {item.text && (
                        <Text style={styles.reviewText}>{item.text}</Text>
                      )}

                      <Text style={styles.reviewDateSmall}>
                        {new Date(item.created_at).toLocaleDateString()}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* FAVORITES */}
          {tab === "favorites" && (
            <View>
              {favorites.map((item) => {
                const photo =
                  item.spots?.header_photo_path ||
                  item.spots?.spot_photos?.[0]?.url ||
                  "https://placehold.co/400x300";

                return (
                  <Card
                    key={item.spot_id}
                    imageUrl={photo}
                    title={item.spots?.name}
                  />
                );
              })}
            </View>
          )}

          {/* BADGES */}
          {tab === "badges" && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
              {badges.map((b, i) => (
                <View key={i} style={styles.badge}>
                  <Image
                    source={{ uri: b.achievements.icon_url }}
                    style={styles.badgeIcon}
                  />
                  <Text style={styles.badgeName}>{b.achievements.name}</Text>
                </View>
              ))}
            </View>
          )}

          {/* LOGOUT */}
          <Pressable
            onPress={async () => {
              await supabase.auth.signOut();
              router.replace("/(tabs)");
            }}
            style={styles.logoutBtn}
          >
            <Ionicons name="log-out-outline" size={18} color="#fff" />
            <Text style={styles.logoutText}>Logout</Text>
          </Pressable>
        </View>
      </Animated.ScrollView>

      {showInfo && (
        <Animated.View
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: "75%",
            transform: [{ translateY: infoTranslateY }],
          }}
          {...infoPan.panHandlers}
        >
          <BlurView
            intensity={70}
            tint="dark"
            style={{
              flex: 1,
              borderTopLeftRadius: 26,
              borderTopRightRadius: 26,
              padding: 20,
              backgroundColor: "rgba(0,0,0,0.75)",
            }}
          >
            {/* Handle */}
            <View style={{ alignItems: "center", marginBottom: 20 }}>
              <View
                style={{
                  width: 40,
                  height: 4,
                  backgroundColor: "rgba(255,255,255,0.3)",
                  borderRadius: 2,
                  marginBottom: 16,
                }}
              />
              <Text style={{ color: "#fff", fontSize: 20, fontWeight: "700" }}>
                Profilinformation
              </Text>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/** dein Info Content **/}
              <InfoRow label="Name" value={`${profile.first_name} ${profile.last_name}`} />
              <InfoRow label="Stadt" value={profile.city} />
              <InfoRow label="Local since" value={profile.since_date} />
              <InfoRow label="Bio" value={profile.bio} />
              <InfoRow label="Beruf" value={profile.job_title} />
              <InfoRow label="Interessen" value={profile.interests?.join(", ")} />
              <InfoRow label="Sprachen" value={profile.languages?.join(", ")} />
              <InfoRow label="Instagram" value={profile.instagram} />
              <InfoRow label="Website" value={profile.website} />
            </ScrollView>

            <Pressable
              onPress={() => {
                Animated.timing(infoTranslateY, {
                  toValue: 800,
                  duration: 250,
                  useNativeDriver: true,
                }).start(() => {
                  setShowInfo(false);
                  infoTranslateY.setValue(0);
                });
              }}
              style={{
                marginTop: 20,
                paddingVertical: 14,
                backgroundColor: "rgba(255,255,255,0.15)",
                borderRadius: 16,
                alignItems: "center",
              }}
            >
              <Text style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}>
                Schließen
              </Text>
            </Pressable>
          </BlurView>
        </Animated.View>
      )}



      {/* ---------- EDIT BOTTOM SHEET ---------- */}
      {showEdit && (
        <BlurView
          intensity={80}
          tint="dark"
          style={styles.editSheetOverlay}
        >
          <KeyboardAvoidingView
            style={{ flex: 1, justifyContent: "flex-end" }}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <View style={styles.editSheetContainer}>
              <View style={styles.sheetHandle} />

              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 120 }}
              >
                <Text style={styles.editTitle}>Profil bearbeiten</Text>
                {/* Avatar ändern */}
                <Pressable
                  onPress={pickImageAndUploadAvatar}
                  style={{ alignSelf: "center", marginBottom: 18 }}
                >
                  <View style={{ position: "relative" }}>
                    {/* Avatar image */}
                    <Image
                      source={{ uri: profile.avatar_url }}
                      style={{
                        width: 110,
                        height: 110,
                        borderRadius: 55,
                        borderWidth: 2,
                        borderColor: "rgba(255,255,255,0.25)",
                      }}
                    />

                    {/* Camera icon overlay */}
                    <View
                      style={{
                        position: "absolute",
                        right: -2,
                        bottom: -2,
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        backgroundColor: "rgba(0,0,0,0.55)",
                        borderWidth: 1,
                        borderColor: "rgba(255,255,255,0.25)",
                        justifyContent: "center",
                        alignItems: "center",
                      }}
                    >
                      <Ionicons name="camera-outline" size={18} color="#fff" />
                    </View>
                  </View>

                  <Text
                    style={{
                      textAlign: "center",
                      marginTop: 8,
                      color: "#fff",
                      fontSize: 13,
                      opacity: 0.8,
                    }}
                  >
                    Profilbild ändern
                  </Text>
                </Pressable>


                {/* Abschnitt: Basis */}
                <Text style={styles.sectionLabel}>Basis</Text>
                <View style={styles.rowInputs}>
                  <TextInput
                    value={profile.first_name || ""}
                    onChangeText={(t) =>
                      setProfile({ ...profile, first_name: t })
                    }
                    placeholder="Vorname"
                    placeholderTextColor="#979AA2"
                    style={[styles.input, { flex: 1, marginRight: 6 }]}
                  />
                  <TextInput
                    value={profile.last_name || ""}
                    onChangeText={(t) =>
                      setProfile({ ...profile, last_name: t })
                    }
                    placeholder="Nachname"
                    placeholderTextColor="#979AA2"
                    style={[styles.input, { flex: 1, marginLeft: 6 }]}
                  />
                </View>

                <TextInput
                  value={profile.username || ""}
                  onChangeText={(t) =>
                    setProfile({ ...profile, username: t })
                  }
                  placeholder="Username (@handle)"
                  placeholderTextColor="#979AA2"
                  style={styles.input}
                />

                <TextInput
                  value={profile.pronouns || ""}
                  onChangeText={(t) =>
                    setProfile({ ...profile, pronouns: t })
                  }
                  placeholder="Pronomen (z.B. sie/ihr, er/ihm)"
                  placeholderTextColor="#979AA2"
                  style={styles.input}
                />

                {/* Abschnitt: Ort */}
                <Text style={styles.sectionLabel}>Ort</Text>
                <TextInput
                  value={profile.city || ""}
                  onChangeText={(t) =>
                    setProfile({ ...profile, city: t })
                  }
                  placeholder="Stadt"
                  placeholderTextColor="#979AA2"
                  style={styles.input}
                />

                <TextInput
                  value={profile.country || ""}
                  onChangeText={(t) =>
                    setProfile({ ...profile, country: t })
                  }
                  placeholder="Land"
                  placeholderTextColor="#979AA2"
                  style={styles.input}
                />

                <TextInput
                  value={profile.since_date || ""}
                  onChangeText={(t) =>
                    setProfile({ ...profile, since_date: t })
                  }
                  placeholder="Local since (YYYY-MM-DD)"
                  placeholderTextColor="#979AA2"
                  style={styles.input}
                />

                <TextInput
                  value={profile.birthdate || ""}
                  onChangeText={(t) =>
                    setProfile({ ...profile, birthdate: t })
                  }
                  placeholder="Geburtstag (YYYY-MM-DD)"
                  placeholderTextColor="#979AA2"
                  style={styles.input}
                />

                {/* Abschnitt: Über dich */}
                <Text style={styles.sectionLabel}>Über mich</Text>
                <TextInput
                  value={profile.bio || ""}
                  onChangeText={(t) =>
                    setProfile({ ...profile, bio: t })
                  }
                  placeholder="Erzähl etwas über dich..."
                  placeholderTextColor="#979AA2"
                  style={[styles.input, { height: 90, textAlignVertical: "top" }]}
                  multiline
                />

                {/* Interests & Personality */}
                <Text style={styles.sectionLabel}>Interessen</Text>
                <TextInput
                  value={profile.interests || ""}
                  onChangeText={(t) => setProfile({ ...profile, interests: t })}
                  placeholder="Interessen (kommagetrennt, z.B. Food, Craft Beer, Hidden Bars)"
                  placeholderTextColor="#979AA2"
                  style={styles.input}
                />

                <Text style={styles.sectionLabel}>Vibes / Persönlichkeit</Text>
                <TextInput
                  value={profile.personality || ""}
                  onChangeText={(t) => setProfile({ ...profile, personality: t })}
                  placeholder="Vibes (z.B. Chillig, Urban, Abenteuerlustig – kommagetrennt)"
                  placeholderTextColor="#979AA2"
                  style={styles.input}
                />

                {/* Social */}
                <Text style={styles.sectionLabel}>Social</Text>
                <TextInput
                  value={profile.instagram || ""}
                  onChangeText={(t) =>
                    setProfile({ ...profile, instagram: t })
                  }
                  placeholder="Instagram (ohne @)"
                  placeholderTextColor="#979AA2"
                  style={styles.input}
                />

                <TextInput
                  value={profile.tiktok || ""}
                  onChangeText={(t) =>
                    setProfile({ ...profile, tiktok: t })
                  }
                  placeholder="TikTok (ohne @)"
                  placeholderTextColor="#979AA2"
                  style={styles.input}
                />

                <TextInput
                  value={profile.website || ""}
                  onChangeText={(t) =>
                    setProfile({ ...profile, website: t })
                  }
                  placeholder="Website (https://...)"
                  placeholderTextColor="#979AA2"
                  style={styles.input}
                />

                {/* Kontakt */}
                <Text style={styles.sectionLabel}>Kontakt</Text>
                <TextInput
                  value={profile.contact_email || ""}
                  onChangeText={(t) =>
                    setProfile({ ...profile, contact_email: t })
                  }
                  placeholder="E-Mail für Anfragen (optional)"
                  placeholderTextColor="#979AA2"
                  style={styles.input}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />

                <Pressable onPress={saveProfile} style={styles.saveBtn}>
                  <Text style={styles.saveBtnText}>
                    {saving ? "Speichern..." : "Speichern"}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => setShowEdit(false)}
                  style={styles.cancelBtn}
                >
                  <Text style={styles.cancelText}>Abbrechen</Text>
                </Pressable>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </BlurView>
      )}
    </View>
  );
}

// ---------------------------------------------------------
// STYLES
// ---------------------------------------------------------
const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  header: {
    position: "absolute",
    top: 0,
    width: "100%",
    overflow: "hidden",
  },
  bgImage: { width, height: "100%", position: "absolute" },

  // Profil Header Box
  profileHeaderBox: {
    borderRadius: 24,
    paddingTop: 12,
    paddingBottom: 18,
    paddingHorizontal: 16,
    backgroundColor: "rgba(18,18,20,0.85)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
  },

  avatarWrapper: {
    marginTop: 6,
    borderRadius: 999,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.4)",
  },

  avatar: { width: 100, height: 100, borderRadius: 50 },

  changeCoverBtn: {
    alignSelf: "flex-end",
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
    marginBottom: 4,
  },
  changeCoverText: {
    marginLeft: 4,
    color: "#fff",
    fontSize: 11,
  },

  nameText: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
    marginTop: 10,
  },

  usernameText: {
    color: "#A6A8AD",
    fontSize: 13,
    marginTop: 2,
    textAlign: "center",
  },

  cityText: { color: "#C7C7CC", textAlign: "center", marginTop: 4 },

  bioText: {
    color: "#A6A8AD",
    textAlign: "center",
    marginTop: 8,
    fontStyle: "italic",
  },

  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    marginTop: 10,
  },

  socialRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 12,
    marginTop: 10,
  },

  socialItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 20,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },

  socialText: {
    color: "#fff",
    fontSize: 12,
    marginLeft: 4,
  },

  editBtn: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
    borderRadius: 22,
    paddingVertical: 7,
    paddingHorizontal: 18,
  },

  editBtnText: { color: "#fff", fontWeight: "600", marginLeft: 6 },

  tabsWrapper: {
    marginTop: 20,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },

  tabRow: {
    flexDirection: "row",
    justifyContent: "center",
  },

  tabText: {
    color: "#888",
    fontSize: 15,
  },

  // PREMIUM CARD
  newCard: {
    width: "100%",
    height: 200,
    borderRadius: 20,
    overflow: "hidden",
    marginBottom: 22,
    backgroundColor: "#1A1A1C",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },

  newCardImage: {
    width: "100%",
    height: "100%",
    position: "absolute",
  },

  newCardGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 110,
  },

  newCardContent: {
    position: "absolute",
    bottom: 14,
    left: 14,
    right: 14,
  },

  newCardTitle: {
    color: "white",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 2,
  },

  newCardSubtitle: {
    color: "#e0e0e0",
    fontSize: 14,
    marginBottom: 4,
  },

  newCardDate: {
    color: "#b0b0b0",
    fontSize: 12,
  },

  // BADGES
  badge: { alignItems: "center", width: 90 },
  badgeIcon: { width: 64, height: 64, borderRadius: 32, marginBottom: 6 },
  badgeName: { color: "#fff", fontSize: 12, textAlign: "center" },

  // LOGOUT
  logoutBtn: {
    marginTop: 40,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  logoutText: { color: "#fff", fontWeight: "700", fontSize: 16 },

  // EDIT BOTTOM SHEET
  editSheetOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },

  editSheetContainer: {
    backgroundColor: "rgba(15,15,18,0.97)",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 8,
    height: "92%",
  },

  sheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.3)",
    marginBottom: 12,
  },

  editTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 12,
    textAlign: "center",
  },

  sectionLabel: {
    color: "#979AA2",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 14,
    marginBottom: 4,
  },

  rowInputs: {
    flexDirection: "row",
    marginBottom: 4,
  },

  input: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    color: "#fff",
    borderRadius: 16,
    padding: 12,
    fontSize: 15,
    marginBottom: 10,
  },

  saveBtn: {
    backgroundColor: "#000",
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    marginTop: 8,
  },

  saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },

  cancelBtn: { marginTop: 10, alignItems: "center" },
  cancelText: { color: "#aaa", fontSize: 15 },

  // Review Info unter Cards
  reviewInfoBox: {
    marginTop: -10,
    marginBottom: 20,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },

  moodRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 10,
    flexWrap: "wrap",
  },

  moodChip: {
    backgroundColor: "rgba(255,255,255,0.14)",
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },

  moodChipText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },

  subtleChip: {
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
  },

  subtleChipText: {
    color: "#ddd",
    fontSize: 12,
  },

  reviewText: {
    color: "#ccc",
    fontSize: 14,
    lineHeight: 18,
    marginBottom: 10,
  },

  reviewDateSmall: {
    color: "#666",
    fontSize: 12,
  },
});
