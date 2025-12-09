import { useState, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Keyboard,
  Platform,
  FlatList,
  StyleSheet,
  TextInput,
  Animated,
  ScrollView as RNScrollView,
} from "react-native";
import { supabase } from "../../lib/supabase";
import type { Spot } from "../../lib/types";
import { useRouter } from "expo-router";
import type { User } from "@supabase/supabase-js";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import LoginBottomSheet from "../../components/LoginBottomSheet";
import * as Location from "expo-location";
import { ImageBackground } from "react-native";

/** ===== THEME ===== */
const theme = {
  colors: {
    background: "#0A0A0B",
    surface: "#131316",
    surfaceElevated: "#1B1B21",
    border: "#2A2A33",
    text: "#FFFFFF",
    textMuted: "#A6A8AD",
    primary: "#0EA5E9",
    primaryAlt: "#55D6FF",
    accent: "#A78BFA",
    success: "#22C55E",
  },
  radius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 28,
    pill: 999,
  },
  spacing: (n: number) => n * 8,
};

/** ===== HELPERS ===== */
const PLACEHOLDER_FUN = (seed: string | number) =>
  `https://placekitten.com/seed/${encodeURIComponent(String(seed))}/800/500`;

type SpotTopMoods = Record<string, string[]>;
type GroupedResults = { fromName: Spot[]; fromMood: Spot[] };

type SpotWithPhoto = Spot & { photoUrl?: string | null; _key?: string };
type JourneyMiniItem = SpotWithPhoto;

const sanitizeMood = (m: string) => m?.trim();
const isValidMood = (m?: string) => {
  if (!m) return false;
  const s = m.trim();
  if (s.length < 3) return false; // filter "A", "B", "a", etc.
  if (/^test$/i.test(s)) return false;
  if (/^nochmal$/i.test(s)) return false;
  if (/gross$/i.test(s)) return false;
  return true;
};

function getGreetingForTime() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 11) return "heute Morgen";
  if (hour >= 11 && hour < 13) return "heute Mittag";
  if (hour >= 13 && hour < 17) return "heute Nachmittag";
  if (hour >= 17 && hour < 22) return "heute Abend";
  return "heute Nacht";
}
function getTimeEmoji() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 11) return "🌅";
  if (hour >= 11 && hour < 17) return "🌤️";
  if (hour >= 17 && hour < 22) return "🌆";
  return "🌙";
}

function greetingByTime() {
  const hour = new Date().getHours();
  if (hour < 11) return "heute Morgen?";
  if (hour < 14) return "heute Mittag?";
  if (hour < 18) return "heute Nachmittag?";
  if (hour < 22) return "heute Abend?";
  return "heute Nacht?";
}

/** ===== SCREEN ===== */
export default function Home() {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [grouped, setGrouped] = useState<GroupedResults>({
    fromName: [],
    fromMood: [],
  });
  const [topMoods, setTopMoods] = useState<SpotTopMoods>({});
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [top8Moods, setTop8Moods] = useState<string[]>([]);

  // NEW: Dynamic chips + general suggestions + surprise
  const [topMoodChips, setTopMoodChips] = useState<string[]>([]);
  const [recentVisits, setRecentVisits] = useState<SpotWithPhoto[]>([]);
  const [discoverSpots, setDiscoverSpots] = useState<SpotWithPhoto[]>([]);
  const [journeyTitle, setJourneyTitle] = useState<string>(
    "Wie wär’s mal mit Ausgehen 2.0?"
  );
  const [journeyMini, setJourneyMini] = useState<JourneyMiniItem[]>([]);
  const [loadingSecondary, setLoadingSecondary] = useState(false);

  // General fallback suggestions (when sections are empty)
  const [popularFallback, setPopularFallback] = useState<SpotWithPhoto[]>([]);
  const [randomFallback, setRandomFallback] = useState<SpotWithPhoto[]>([]);

  const router = useRouter();
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Intro animation
  const fade = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(10)).current;
  const [showLoginSheet, setShowLoginSheet] = useState(false);

  const [currentCanton, setCurrentCanton] = useState<string | null>(null);
  const [timeOfDay, setTimeOfDay] = useState<"day" | "night">("day");

  function SectionHeader({ title }: { title: string }) {
    return (
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <View style={styles.sectionUnderline} />
      </View>
    );
  }

  const HEADER_IMAGES: Record<string, { day: any; night: any }> = {
    Zürich: {
      day: require("../../assets/headers/zurich_day.jpg"),
      night: require("../../assets/headers/zurich_night.jpg"),
    },
    "Basel-Stadt": {
      day: require("../../assets/headers/basel_day.jpg"),
      night: require("../../assets/headers/basel_night.jpg"),
    },
    Bern: {
      day: require("../../assets/headers/bern_day.jpg"),
      night: require("../../assets/headers/bern_night.jpg"),
    },
    // fallback:
    default: {
      day: require("../../assets/headers/switzerland_day.jpg"),
      night: require("../../assets/headers/switzerland_night.jpg"),
    },
  };

  /* ============================================================= */
  /*             ✅ ULTRA HEADER: IMAGE SELECTION + FX             */
  /* ============================================================= */

  // ✅ Correct header image (Canton + Day/Night)
  const selectedImage =
    currentCanton && HEADER_IMAGES[currentCanton]
      ? HEADER_IMAGES[currentCanton][timeOfDay]
      : HEADER_IMAGES.default[timeOfDay];

  // ✅ Canton normalization (unchanged)
  function normalizeCanton(region?: string, subregion?: string, city?: string) {
    const raw = (region || subregion || city || "").toLowerCase().trim();
    if (!raw) return null;

    if (raw === "bs") return "Basel-Stadt";
    if (raw === "zh") return "Zürich";
    if (raw === "be") return "Bern";
    if (raw === "lu") return "Luzern";
    if (raw === "ge") return "Genf";

    if (raw.includes("basel")) return "Basel-Stadt";
    if (raw.includes("zürich") || raw.includes("zurich")) return "Zürich";
    if (raw.includes("bern")) return "Bern";
    if (raw.includes("luzern") || raw.includes("lucerne")) return "Luzern";
    if (raw.includes("genf") || raw.includes("geneva")) return "Genf";

    return null;
  }

  /* ============================================================= */
  /*                     ✅ ULTRA HEADER ANIMATION                  */
  /* ============================================================= */

  // ScrollY for parallax header
  const scrollY = useRef(new Animated.Value(0)).current;

  // Dynamic height from 420 → 160 on scroll
  const HERO_MIN = 160;
  const HERO_MAX = 420;
  const heroHeight = scrollY.interpolate({
    inputRange: [0, 260],
    outputRange: [HERO_MAX, HERO_MIN],
    extrapolate: "clamp",
  });

  // Parallax offset
  const heroParallax = scrollY.interpolate({
    inputRange: [0, 200],
    outputRange: [0, -50],
    extrapolate: "clamp",
  });

  // Beautiful text fade-in (Ultra premium)
  const fadeText = useRef(new Animated.Value(0)).current;
  const fadeTextY = useRef(new Animated.Value(14)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeText, {
        toValue: 1,
        duration: 500,
        delay: 120,
        useNativeDriver: true,
      }),
      Animated.timing(fadeTextY, {
        toValue: 0,
        duration: 600,
        delay: 120,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // ✅ Canton tint map (super subtle)
  const cantonTintColor: Record<string, string> = {
    Zürich: "rgba(51, 131, 255, 0.09)",
    "Basel-Stadt": "rgba(255, 51, 102, 0.09)",
    Bern: "rgba(255, 196, 0, 0.09)",
    Luzern: "rgba(0, 174, 255, 0.09)",
    Genf: "rgba(0, 215, 146, 0.09)",
  };

  /* ============================================================= */
  /*              ✅ REFINED TIME OF DAY DETECTION                 */
  /* ============================================================= */
  useEffect(() => {
    const hour = new Date().getHours();
    setTimeOfDay(hour >= 19 || hour < 6 ? "night" : "day");
  }, []);

  /* ============================================================= */
  /*                     ✅ LOCATION → CANTON                      */
  /* ============================================================= */

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          setCurrentCanton(null);
          return;
        }

        const pos = await Location.getCurrentPositionAsync({});
        const rev = await Location.reverseGeocodeAsync({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });

        if (rev.length > 0) {
          const r = rev[0];
          const canton = normalizeCanton(
            r.region,
            (r as any).subregion,
            r.city
          );

          console.log("Detected canton:", canton, "| raw:", r);
          setCurrentCanton(canton);
        } else {
          setCurrentCanton(null);
        }
      } catch (e) {
        console.warn("Location error:", e);
        setCurrentCanton(null);
      }
    })();
  }, []);

  /* ============================================================= */
  /*                  ✅ INTRO HERO ANIMATION (YOURS)              */
  /* ============================================================= */

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 420,
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        damping: 14,
        stiffness: 140,
        mass: 0.7,
      }),
    ]).start();
  }, []);

  /* ============================================================= */
  /*                     ✅ LOGIN SHEET AUTO OPEN                  */
  /* ============================================================= */

  useEffect(() => {
    if (!user) {
      const timer = setTimeout(() => setShowLoginSheet(true), 4000);
      return () => clearTimeout(timer);
    } else {
      setShowLoginSheet(false);
    }
  }, [user]);

  // Session + Profile Laden
  useEffect(() => {
    // 1) User aus Auth holen
    supabase.auth.getUser().then(async ({ data }) => {
      const authedUser = data.user ?? null;
      setUser(authedUser);

      // 2) Falls eingeloggt → Profil laden
      if (authedUser?.id) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("first_name, last_name, avatar_url, city")
          .eq("id", authedUser.id)
          .single();

        setProfile(profileData || null);
      } else {
        setProfile(null);
      }
    });

    // 3) Listener für Login/Logout
    const { data: listener } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        const authedUser = session?.user ?? null;
        setUser(authedUser);

        if (authedUser?.id) {
          const { data: profileData } = await supabase
            .from("profiles")
            .select("first_name, last_name, avatar_url, city")
            .eq("id", authedUser.id)
            .single();

          setProfile(profileData || null);
        } else {
          setProfile(null);
        }
      }
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  // Load sections on login change
  useEffect(() => {
    loadPersonalMoodChips(user?.id ?? null); // global, unabhängig vom User
    loadGeneralSuggestions(); // global
    if (user) {
      loadRecentVisits(user.id);
      loadDiscover(user.id);
      loadLastJourney(user.id);
    } else {
      setRecentVisits([]);
      setDiscoverSpots([]);
      setJourneyMini([]);
      setJourneyTitle("Wie wär’s mal mit Ausgehen 2.0?");
    }
  }, [user]);

  // Suche (bestehend)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length === 0) {
      setGrouped({ fromName: [], fromMood: [] });
      return;
    }
    debounceRef.current = setTimeout(() => runSearch(q), 350);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
  }, [q]);

  /** ===== Fotos zu Spots laden und mappen ===== */
  async function mapSpotPhotos(spots: Spot[]): Promise<SpotWithPhoto[]> {
    const ids = spots.map((s) => s.id);
    if (ids.length === 0) return [];
    const { data: photos } = await supabase
      .from("spot_photos")
      .select("spot_id,url")
      .in("spot_id", ids)
      .order("id", { ascending: true });
    const firstBySpot: Record<string, string> = {};
    (photos || []).forEach((p: any) => {
      if (!firstBySpot[p.spot_id]) firstBySpot[p.spot_id] = p.url;
    });
    return spots.map((s) => ({
      ...s,
      photoUrl: firstBySpot[s.id] || PLACEHOLDER_FUN(s.id),
    }));
  }

  /** ===== GLOBAL: Top Mood Chips (8) ===== */
  /** ===== PERSONALIZED MOOD SUGGESTIONS ===== */
  async function loadPersonalMoodChips(userId?: string | null) {
    try {
      const weights = {
        ownReview: 3,
        visitedSpot: 2,
        likedSpot: 1.5,
        global: 1,
      };

      const moodScore: Record<string, number> = {};

      /* ============================================================
        1️⃣ Eigene Reviews → mood_id → mood_tokens.token
      ============================================================ */
      if (userId) {
        const { data: myReviews } = await supabase
          .from("reviews")
          .select(`
            mood_id,
            spot_id
          `)
          .eq("user_id", userId);

        const ownMoodIds = (myReviews || [])
          .map(r => r.mood_id)
          .filter(Boolean);

        if (ownMoodIds.length > 0) {
          const { data: ownTokens } = await supabase
            .from("mood_tokens")
            .select("id, token")
            .in("id", ownMoodIds);

          for (const row of ownTokens || []) {
            const t = row.token.toLowerCase();
            moodScore[t] = (moodScore[t] || 0) + weights.ownReview;
          }
        }

        /* ============================================================
          2️⃣ Orte, die du besucht hast → spot_moods
        ============================================================ */
        const visitedSpotIds = Array.from(
          new Set((myReviews || []).map(r => r.spot_id))
        ).filter(Boolean);

        if (visitedSpotIds.length > 0) {
          const { data: visitedMoods } = await supabase
            .from("spot_moods")
            .select(`
              mood_id,
              mood_tokens ( token )
            `)
            .in("spot_id", visitedSpotIds)
            .limit(200);

          for (const row of visitedMoods || []) {
            const t = row.mood_tokens.token.toLowerCase();
            moodScore[t] = (moodScore[t] || 0) + weights.visitedSpot;
          }
        }

        /* ============================================================
          3️⃣ Liked Spots (falls vorhanden)
        ============================================================ */
        const { data: likes } = await supabase
          .from("spot_likes")
          .select("spot_id")
          .eq("user_id", userId);

        const likedSpotIds = Array.from(new Set((likes || []).map(x => x.spot_id)));

        if (likedSpotIds.length > 0) {
          const { data: likedMoods } = await supabase
            .from("spot_moods")
            .select(`
              mood_id,
              mood_tokens ( token )
            `)
            .in("spot_id", likedSpotIds);

          for (const row of likedMoods || []) {
            const t = row.mood_tokens.token.toLowerCase();
            moodScore[t] = (moodScore[t] || 0) + weights.likedSpot;
          }
        }
      }

      /* ============================================================
        4️⃣ Global fallback
      ============================================================ */
      const { data: globalMoods } = await supabase
        .from("spot_moods")
        .select(`
          mood_id,
          mood_count,
          mood_tokens ( token )
        `)
        .order("mood_count", { ascending: false })
        .limit(50);

      for (const row of globalMoods || []) {
        const t = row.mood_tokens.token.toLowerCase();
        moodScore[t] = (moodScore[t] || 0) + weights.global;
      }

      /* ============================================================
        🎯 Final – Score sortieren & Top-8 auswählen
      ============================================================ */
      const sorted = Object.entries(moodScore)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([token]) => token.charAt(0).toUpperCase() + token.slice(1));

      setTop8Moods(sorted);
    } catch (e) {
      console.warn("PersonalizedMoodChips:", (e as any).message);
      setTop8Moods(["Gemütlich", "Chillig", "Romantisch", "Modern", "Versteckt"]);
    }
  }


  /** ===== GENERELLE VORSCHLÄGE ===== */
  async function loadGeneralSuggestions() {
    try {
      setLoadingSecondary(true);
      // "Beliebt in Backyrd" — Proxy: zuletzt approved/erstellt
      const { data: popular } = await supabase
        .from("spots")
        .select(
          "id,name,address,lat,lng,category_id,categories ( id, name, icon, color ),status,created_at"
        )
        .eq("status", "approved")
        .order("created_at", { ascending: false })
        .limit(12);
      const popWithPhotos = await mapSpotPhotos((popular || []) as Spot[]);
      setPopularFallback(popWithPhotos);

      // "Zufällige Empfehlungen" — wir holen 40 und shufflen clientseitig
      const { data: some } = await supabase
        .from("spots")
        .select(
          "id,name,address,lat,lng,category_id,categories ( id, name, icon, color ),status,created_at"
        )
        .eq("status", "approved")
        .limit(40);
      const someWithPhotos = await mapSpotPhotos((some || []) as Spot[]);
      const shuffled = shuffleArray(someWithPhotos).slice(0, 12);
      setRandomFallback(shuffled);
    } catch (e) {
      console.warn("GeneralSuggestions:", (e as any).message);
      setPopularFallback([]);
      setRandomFallback([]);
    } finally {
      setLoadingSecondary(false);
    }
  }

  function shuffleArray<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /** ===== Deine letzten Besuche ===== */
  async function loadRecentVisits(userId: string) {
    try {
      setLoadingSecondary(true);
      const { data, error } = await supabase
        .from("reviews")
        .select(
          `
          id,
          created_at,
          spot:spot_id (
            id,
            name,
            address,
            lat,
            lng,
            category_id,
            categories ( id, name, icon, color ),
            status
          )
        `
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;

      const spots = (data || [])
        .map((r: any) => r.spot)
        .filter(Boolean) as Spot[];
      const uniqueSpots = Array.from(
        new Map(spots.map((s) => [s.id, s])).values()
      );
      const keyed = uniqueSpots.map((s, i) => ({
        ...s,
        _key: `${s.id}-${i}`,
      }));
      const withPhotos = await mapSpotPhotos(keyed);
      setRecentVisits(withPhotos);
    } catch (e: any) {
      console.error("Fehler bei recent visits:", e.message);
      setRecentVisits([]);
    } finally {
      setLoadingSecondary(false);
    }
  }

  /** ===== Neu entdeckt: eigene + Freunde ===== */
  async function loadDiscover(userId: string) {
    try {
      setLoadingSecondary(true);
      const { data: following, error: followErr } = await supabase
        .from("follows")
        .select("follower, followee_id")
        .eq("follower", userId);
      if (followErr) console.warn("follows:", followErr.message);

      const followeeIds = Array.from(
        new Set((following || []).map((x: any) => x.followee_id))
      ).filter(Boolean);

      const creators = [userId, ...followeeIds];
      if (creators.length === 0) {
        setDiscoverSpots([]);
        return;
      }

      const { data: spots, error } = await supabase
        .from("spots")
        .select(
          "id,name,address,lat,lng,category_id,categories ( id, name, icon, color ),status,created_by,created_at"
        )
        .in("created_by", creators)
        .order("created_at", { ascending: false })
        .limit(12);
      if (error) throw error;

      const withPhotos = await mapSpotPhotos((spots || []) as Spot[]);
      setDiscoverSpots(withPhotos);
    } catch (e: any) {
      console.error("Neu entdeckt:", e.message);
      setDiscoverSpots([]);
    } finally {
      setLoadingSecondary(false);
    }
  }

  // Mood-IDs per RPC aus Text-Moods holen
  async function resolveMoodIds(targetMoods: string[]): Promise<number[]> {
    const ids: number[] = [];
    for (const m of targetMoods) {
      try {
        const { data, error } = await supabase.rpc("rpc_match_mood", {
          input: m,
        });
        if (error) {
          console.warn("rpc_match_mood error:", error.message);
          continue;
        }
        if (typeof data === "number") {
          ids.push(data);
        }
      } catch (e) {
        console.warn(
          "resolveMoodIds rpc_match_mood error:",
          (e as any).message
        );
      }
    }
    return Array.from(new Set(ids));
  }

  /** ===== Letzte Journey-Suche (Mini) ===== */
  async function loadLastJourney(userId: string) {
    try {
      setLoadingSecondary(true);

      const { data: last, error } = await supabase
        .from("user_searches")
        .select("query, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) console.warn("user_searches:", error.message);

      const phrase = last?.query?.trim();
      if (phrase) {
        setJourneyTitle(`Neuauflage von: „${phrase}“`);
      } else {
        setJourneyTitle("Wie wär’s mal mit Ausgehen 2.0?");
      }

      const targetMoods = phrase
        ? extractMoodsFromPhrase(phrase)
        : ["romantisch", "gemütlich"];

      const targetMoodIds = await resolveMoodIds(targetMoods);

      let spotIds: string[] = [];
      if (targetMoodIds.length > 0) {
        const { data: moodRows, error: moodErr } = await supabase
          .from("spot_moods")
          .select(`
            spot_id,
            rank,
            mood_id
          `)
          .in("mood_id", targetMoodIds)
          .lte("rank", 3)
          .limit(300);
        if (moodErr) console.warn("spot_moods:", moodErr.message);

        spotIds = Array.from(
          new Set((moodRows || []).map((m: any) => m.spot_id))
        );
      }

      let baseSpots: Spot[] = [];
      if (spotIds.length) {
        const { data: spots, error: spotsErr } = await supabase
          .from("spots")
          .select(
            "id,name,address,lat,lng,category_id,categories ( id, name, icon, color ),status"
          )
          .eq("status", "approved")
          .in("id", spotIds)
          .limit(40);
        if (!spotsErr) baseSpots = (spots || []) as Spot[];
      }

      if (baseSpots.length === 0) {
        const { data: fallbackSpots } = await supabase
          .from("spots")
          .select(
            "id,name,address,lat,lng,category_id,categories ( id, name, icon, color ),status,created_at"
          )
          .eq("status", "approved")
          .order("created_at", { ascending: false })
          .limit(12);
        baseSpots = (fallbackSpots || []) as Spot[];
      }

      const withPhotos = await mapSpotPhotos(baseSpots);

      const moodSet = new Set(targetMoods.map((m) => m.toLowerCase()));
      const ranked = withPhotos
        .map((s) => ({
          s,
          score:
            (/(restaurant|bar|weinbar)/i.test((s as any).category || "")
              ? 1.0
              : 0) +
            topMoodsScore(s.id, moodSet) +
            0.1,
        }))
        .sort((a, b) => b.score - a.score)
        .map((x) => x.s)
        .slice(0, 4);

      setJourneyMini(ranked);
    } catch (e: any) {
      console.error("Journey Mini:", e.message);
      setJourneyMini([]);
    } finally {
      setLoadingSecondary(false);
    }
  }

  function extractMoodsFromPhrase(t: string): string[] {
    const n = t.toLowerCase();
    const out = new Set<string>();
    if (/\bromant/i.test(n)) out.add("romantisch");
    if (/\bgemüt/i.test(n) || /cozy|chillig/.test(n)) out.add("gemütlich");
    if (/\bzu zweit|date|paar/i.test(n)) out.add("zu zweit");
    if (/\blebendig|party|nachtleben/i.test(n)) out.add("lebendig");
    return Array.from(out);
  }

  function topMoodsScore(spotId: string, moodSet: Set<string>): number {
    const moods = (topMoods[spotId] || []).map((m) => m.toLowerCase());
    let score = 0;
    moods.forEach((m) => {
      if (moodSet.has(m)) score += 0.6;
      if (/romant/.test(m) && moodSet.has("romantisch")) score += 0.3;
      if (/gemüt|chill/.test(m) && moodSet.has("gemütlich")) score += 0.3;
    });
    return score;
  }

  /** ===== Suche (bestehend) ===== */
  async function runSearch(term: string) {
    const searchTerm = term.trim();
    if (!searchTerm) return;
    setLoading(true);
    try {
      const pattern = `%${searchTerm}%`;
      const { data: spotsA } = await supabase
        .from("spots")
        .select(
          "id,name,address,lat,lng,category_id,categories ( id, name, icon, color ),status"
        )
        .eq("status", "approved")
        .or(
          `name.ilike.${pattern},address.ilike.${pattern},category.ilike.${pattern}`
        )
        .limit(100);

      const { data: reviews } = await supabase
        .from("reviews")
        .select("spot_id")
        .or(`mood_a.ilike.${pattern},mood_b.ilike.${pattern}`)
        .limit(200);

      const moodSpotIds = Array.from(
        new Set((reviews || []).map((r) => r.spot_id as string))
      );
      let spotsB: Spot[] = [];
      if (moodSpotIds.length) {
        const { data } = await supabase
          .from("spots")
          .select(
            "id,name,address,lat,lng,category_id,categories ( id, name, icon, color ),status"
          )
          .eq("status", "approved")
          .in("id", moodSpotIds);
        spotsB = (data || []) as Spot[];
      }

      setGrouped({ fromName: (spotsA as Spot[]) || [], fromMood: spotsB });

      const merged = [...(spotsA || []), ...spotsB];
      if (merged.length) {
        const ids = merged.map((s) => s.id);
        const { data: moodsData } = await supabase
          .from("spot_moods")
          .select(`
            spot_id,
            rank,
            mood_tokens (
              token
            )
          `)
          .in("spot_id", ids)
          .lte("rank", 3);

        const bySpot: SpotTopMoods = {};
        (moodsData || []).forEach((row: any) => {
          const token = row.mood_tokens?.token as string | undefined;
          if (!token) return;
          if (!bySpot[row.spot_id]) bySpot[row.spot_id] = [];
          bySpot[row.spot_id].push(token);
        });
        setTopMoods(bySpot);
      } else {
        setTopMoods({});
      }
    } catch (e: any) {
      Alert.alert("Suche fehlgeschlagen", e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  /** ===== Surprise-Mini-Journey: 3–5 zufällige Spots ===== */
  async function generateSurpriseJourney() {
    try {
      setLoadingSecondary(true);
      setJourneyTitle("Deine Überraschungs-Journey 🎲");

      const { data: some } = await supabase
        .from("spots")
        .select(
          "id,name,address,lat,lng,category_id,categories ( id, name, icon, color ),status,created_at"
        )
        .eq("status", "approved")
        .limit(40);

      const withPhotos = await mapSpotPhotos((some || []) as Spot[]);
      const shuffled = shuffleArray(withPhotos);
      const count = Math.floor(Math.random() * 3) + 3; // 3..5
      const pick = shuffled.slice(0, count);

      setJourneyMini(pick);
    } catch (e) {
      console.warn("Surprise Journey:", (e as any).message);
      setJourneyMini([]);
    } finally {
      setLoadingSecondary(false);
    }
  }

  const onSelectQuick = (t: string) => setQ(t.toLowerCase());
  const onSelectMood = (mood: string) => setQ(mood);
  const onSelectSurprise = () => generateSurpriseJourney();
  const handleSurpriseJourney = () => {
    try {
      if (!top8Moods || top8Moods.length === 0) {
        const fallback = "gemütlich";
        setQ(fallback);
        return;
      }
      const randomMood =
        top8Moods[Math.floor(Math.random() * top8Moods.length)];
      setQ(randomMood);
    } catch (e) {
      console.warn("handleSurpriseJourney error:", e);
    }
  };

  const openMapWithResults = () => {
    const all = [...grouped.fromName, ...grouped.fromMood];
    if (all.length === 0) return;
    const ids = all.map((s) => s.id).join(",");
    router.push({ pathname: "/map", params: { spotIds: ids } });
  };

  function MiniMoods({ spotId }: { spotId: string }) {
    const [moods, setMoods] = useState<string[]>([]);

    useEffect(() => {
      (async () => {
        const { data } = await supabase
          .from("spot_moods")
          .select(`
            rank,
            mood_tokens (
              token
            )
          `)
          .eq("spot_id", spotId)
          .lte("rank", 3)
          .order("rank", { ascending: true })
          .limit(3);

        setMoods(
          (data || [])
            .map(
              (x: any) => x.mood_tokens?.token as string | undefined
            )
            .filter(Boolean) as string[]
        );
      })();
    }, [spotId]);

    if (moods.length === 0) return null;

    return (
      <View style={styles.cardChipsRow}>
        {moods.map((m, i) => (
          <View key={i} style={styles.badgeGhost}>
            <Text style={styles.badgeGhostText}>{m}</Text>
          </View>
        ))}
      </View>
    );
  } // ✅

  /** ===== NEW USER DETECTION ===== */
  const isNewUserUI =
    !q &&
    recentVisits.length === 0 &&
    discoverSpots.length === 0 &&
    journeyMini.length === 0;

  /** ===== RENDER ===== */
  return (
    <View style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <Animated.ScrollView
            contentContainerStyle={{ paddingBottom: theme.spacing(14) }}
            showsVerticalScrollIndicator={false}
            onScroll={Animated.event(
              [{ nativeEvent: { contentOffset: { y: scrollY } } }],
              { useNativeDriver: true }
            )}
            scrollEventThrottle={16}
            style={{ opacity: fade, transform: [{ translateY }] }}
          >
            {/* ===================================================== */}
            {/*                   ULTRA PREMIUM HEADER                */}
            {/* ===================================================== */}

            <View style={styles.heroContainer}>
              {/* --- PARALLAX BACKGROUND IMAGE --- */}
              <Animated.View
                style={[
                  StyleSheet.absoluteFillObject,
                  {
                    transform: [
                      {
                        translateY: scrollY.interpolate({
                          inputRange: [-150, 0, 300],
                          outputRange: [-60, 0, 25],
                          extrapolateRight: "clamp",
                        }),
                      },
                    ],
                  },
                ]}
              >
                <ImageBackground
                  source={selectedImage}
                  style={styles.heroImage}
                  resizeMode="cover"
                >
                  {/* --- DARK MULTI GRADIENT OVERLAY (Apple Style) --- */}
                  <LinearGradient
                    colors={[
                      "rgba(0,0,0,0.15)",
                      "rgba(0,0,0,0.35)",
                      "rgba(0,0,0,0.55)",
                      "rgba(0,0,0,0.85)",
                    ]}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />

                  {/* --- NIGHT COLOR FILTER --- */}
                  <LinearGradient
                    colors={
                      timeOfDay === "night"
                        ? ["rgba(0,0,30,0.2)", "rgba(0,0,60,0.4)"]
                        : ["rgba(255,255,255,0)", "rgba(255,255,255,0)"]
                    }
                    style={styles.heroNightFilter}
                  />

                  {/* --- CANTON TINT (SUBTLE) --- */}
                  {currentCanton && (
                    <View
                      style={[
                        styles.cantonTint,
                        {
                          backgroundColor:
                            cantonTintColor[currentCanton] || "transparent",
                        },
                      ]}
                    />
                  )}

                  {/* ============================= */}
                  {/*         FOREGROUND TEXT       */}
                  {/* ============================= */}
                  <SafeAreaView style={styles.heroSafe}>
                    {/* AVATAR ORB */}
                    {profile?.avatar_url && (
                      <Pressable
                        onPress={() => router.push("/profile")}
                        style={styles.heroAvatarOrb}
                      >
                        <Image
                          source={{ uri: profile.avatar_url }}
                          style={styles.heroAvatarImg}
                        />
                      </Pressable>
                    )}

                    <Animated.View
                      style={{
                        opacity: fadeText,
                        transform: [{ translateY: fadeTextY }],
                      }}
                    >
                      {profile ? (
                        <>
                          <Text style={styles.heroGreeting}>
                            Hey {profile.first_name}
                          </Text>
                          <Text style={styles.heroSubtitle}>
                            Wonach steht dir der Sinn {getGreetingForTime()}?
                          </Text>
                        </>
                      ) : (
                        <>
                          <Text style={styles.heroGreeting}>
                            Willkommen bei Backyrd
                          </Text>
                          <Text style={styles.heroSubtitle}>
                            Finde Orte, die zu deiner Stimmung passen.
                          </Text>
                        </>
                      )}
                    </Animated.View>

                    {/* HERO SHINE */}
                    <LinearGradient
                      colors={[
                        "rgba(255,255,255,0.18)",
                        "rgba(255,255,255,0.02)",
                      ]}
                      start={{ x: 0, y: 0.2 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.heroShine}
                    />
                  </SafeAreaView>
                </ImageBackground>
              </Animated.View>
            </View>

            {/* ===================================================== */}
            {/*               FLOATING GLASS SEARCH BAR               */}
            {/* ===================================================== */}
            <Animated.View style={styles.floatingSearchContainer}>
              <BlurView
                intensity={40}
                tint="dark"
                style={styles.searchBarGlass}
              >
                <View style={styles.searchBox}>
                  <Ionicons name="search" size={20} color="#B0B2B8" />

                  <TextInput
                    placeholder="z. B. cozy bar, rooftop…"
                    placeholderTextColor="#8F9299"
                    style={styles.searchInput}
                    value={q}
                    onChangeText={setQ}
                    returnKeyType="search"
                  />

                  {q.length > 0 && (
                    <Pressable onPress={() => setQ("")} hitSlop={10}>
                      <Ionicons
                        name="close-circle"
                        size={18}
                        color="#7C8087"
                      />
                    </Pressable>
                  )}
                </View>
              </BlurView>
            </Animated.View>

            {/* ===================================================== */}
            {/*                    MOOD CHIPS                         */}
            {/* ===================================================== */}
            <View style={styles.moodChipsWrapper}>
              <View pointerEvents="none" style={styles.fadeLeft} />

              <RNScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.moodChipsRow}
              >
                {top8Moods?.length > 0 &&
                  top8Moods.map((mood) => (
                    <Pressable
                      key={mood}
                      style={styles.moodChip}
                      onPress={() => onSelectMood(mood)}
                    >
                      <Text style={styles.moodChipText}>{mood}</Text>
                    </Pressable>
                  ))}

                <Pressable
                  style={styles.moodChipSurprise}
                  onPress={handleSurpriseJourney}
                >
                  <Ionicons name="dice" size={16} color="#fff" />
                  <Text style={styles.moodChipText}>Überrasch mich</Text>
                </Pressable>
              </RNScrollView>

              <View pointerEvents="none" style={styles.fadeRight} />
            </View>

            {/* ===================================================== */}
            {/*                CTA: Map (GLASS)                       */}
            {/* ===================================================== */}
            {(grouped.fromName.length > 0 || grouped.fromMood.length > 0) && (
              <View style={styles.mapBtnWrapper}>
                <BlurView intensity={60} tint="dark" style={styles.mapBtnBlur}>
                  <Pressable
                    onPress={openMapWithResults}
                    style={styles.mapBtn}
                  >
                    <Text style={styles.mapBtnTextGlass}>
                      Ergebnisse auf Karte anzeigen
                    </Text>
                  </Pressable>
                </BlurView>
              </View>
            )}

            {/* ===================================================== */}
            {/*                RESULTS                                */}
            {/* ===================================================== */}
            <View style={{ paddingHorizontal: theme.spacing(2) }}>
              {loading && (
                <View style={{ paddingVertical: theme.spacing(2) }}>
                  <ActivityIndicator
                    size="small"
                    color={theme.colors.primary}
                  />
                </View>
              )}

              {!loading &&
                q.length > 0 &&
                grouped.fromName.length === 0 &&
                grouped.fromMood.length === 0 && (
                  <View
                    style={{
                      alignItems: "center",
                      paddingVertical: theme.spacing(4),
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 42,
                        marginBottom: theme.spacing(1),
                      }}
                    >
                      🤔
                    </Text>
                    <Text style={styles.textMuted}>
                      Nichts gefunden. Versuch’s mit „gemütlich“, „rooftop“ oder
                      „modern“.
                    </Text>
                  </View>
                )}

              {grouped.fromName.length > 0 && (
                <>
                  <SectionHeader title="Passend nach Name / Adresse" />
                  <View style={{ gap: 16, marginBottom: 22 }}>
                    {grouped.fromName.map((spot) => (
                      <ResultCard key={spot.id} spot={spot} />
                    ))}
                  </View>
                </>
              )}

              {grouped.fromMood.length > 0 && (
                <>
                  <SectionHeader title="Passend nach Stimmung" />
                  <View style={{ gap: 16, marginBottom: 22 }}>
                    {grouped.fromMood.map((spot) => (
                      <ResultCard key={spot.id} spot={spot} />
                    ))}
                  </View>
                </>
              )}
            </View>

            {/* ===================================================== */}
            {/*      DEINE LETZTEN BESUCHE & NEU ENTDECKT            */}
            {/* ===================================================== */}

            {recentVisits.length > 0 && (
              <View style={{ paddingHorizontal: theme.spacing(2) }}>
                <SectionHeader title="Deine letzten Besuche" />
                <FlatList
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  data={recentVisits}
                  keyExtractor={(item) => item._key!}
                  renderItem={({ item }) => (
                    <Pressable
                      onPress={() => router.push(`/spot/${item.id}`)}
                      style={{ marginRight: 14, width: 240 }}
                    >
                      <Image
                        source={{
                          uri: item.photoUrl || PLACEHOLDER_FUN(item.id),
                        }}
                        style={styles.recentImg}
                      />
                      <Text style={styles.resultTitle} numberOfLines={1}>
                        {item.name}
                      </Text>
                      {!!item.address && (
                        <Text style={styles.textMuted} numberOfLines={1}>
                          {item.address}
                        </Text>
                      )}
                    </Pressable>
                  )}
                />
              </View>
            )}

            {discoverSpots.length > 0 && (
              <View style={{ paddingHorizontal: theme.spacing(2) }}>
                <SectionHeader title="Neu entdeckt" />
                <FlatList
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  data={discoverSpots}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }) => (
                    <Pressable
                      onPress={() => router.push(`/spot/${item.id}`)}
                      style={{ marginRight: 14, width: 240 }}
                    >
                      <Image
                        source={{
                          uri: item.photoUrl || PLACEHOLDER_FUN(item.id),
                        }}
                        style={styles.recentImg}
                      />
                      <Text style={styles.resultTitle} numberOfLines={1}>
                        {item.name}
                      </Text>
                      {!!item.address && (
                        <Text style={styles.textMuted} numberOfLines={1}>
                          {item.address}
                        </Text>
                      )}
                    </Pressable>
                  )}
                />
              </View>
            )}

            {/* ===================================================== */}
            {/*         GENERELLE VORSCHLÄGE FALLBACK                 */}
            {/* ===================================================== */}
            {recentVisits.length === 0 && discoverSpots.length === 0 && (
              <View style={{ paddingHorizontal: theme.spacing(2) }}>
                <SectionHeader title="Beliebt in Backyrd" />
                <FlatList
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  data={popularFallback}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }) => (
                    <Pressable
                      onPress={() => router.push(`/spot/${item.id}`)}
                      style={{ marginRight: 14, width: 240 }}
                    >
                      <Image
                        source={{
                          uri: item.photoUrl || PLACEHOLDER_FUN(item.id),
                        }}
                        style={styles.recentImg}
                      />
                      <Text style={styles.resultTitle} numberOfLines={1}>
                        {item.name}
                      </Text>
                      {!!item.address && (
                        <Text style={styles.textMuted} numberOfLines={1}>
                          {item.address}
                        </Text>
                      )}
                    </Pressable>
                  )}
                />

                <SectionHeader title="Zufällige Empfehlungen" />
                <FlatList
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  data={randomFallback}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }) => (
                    <Pressable
                      onPress={() => router.push(`/spot/${item.id}`)}
                      style={{ marginRight: 14, width: 240 }}
                    >
                      <Image
                        source={{
                          uri: item.photoUrl || PLACEHOLDER_FUN(item.id),
                        }}
                        style={styles.recentImg}
                      />
                      <Text style={styles.resultTitle} numberOfLines={1}>
                        {item.name}
                      </Text>
                      {!!item.address && (
                        <Text style={styles.textMuted} numberOfLines={1}>
                          {item.address}
                        </Text>
                      )}
                    </Pressable>
                  )}
                />
              </View>
            )}

            {/* ===================================================== */}
            {/*                   JOURNEY MINI                        */}
            {/* ===================================================== */}
            <View
              style={{
                paddingHorizontal: theme.spacing(2),
                marginTop: theme.spacing(2),
              }}
            >
              <SectionHeader title={journeyTitle} />

              {journeyMini.length > 0 ? (
                <View style={{ gap: 16, marginBottom: 22 }}>
                  {journeyMini.map((spot) => (
                    <Pressable
                      key={spot.id}
                      onPress={() => router.push(`/spot/${spot.id}`)}
                      style={styles.card}
                    >
                      <View style={styles.cardMedia}>
                        <Image
                          source={{
                            uri: spot.photoUrl || PLACEHOLDER_FUN(spot.id),
                          }}
                          style={styles.cardImg}
                        />
                        <LinearGradient
                          colors={[
                            "transparent",
                            "rgba(0,0,0,0.45)",
                            "rgba(0,0,0,0.85)",
                          ]}
                          start={{ x: 0.5, y: 0 }}
                          end={{ x: 0.5, y: 1 }}
                          style={styles.cardOverlay}
                        >
                          <Text style={styles.resultTitle} numberOfLines={1}>
                            {spot.name}
                          </Text>
                          {!!spot.address && (
                            <Text
                              style={styles.resultSubtitle}
                              numberOfLines={1}
                            >
                              {spot.address}
                            </Text>
                          )}
                          <MiniMoods spotId={spot.id} />
                        </LinearGradient>
                      </View>
                    </Pressable>
                  ))}
                </View>
              ) : (
                <Text style={styles.textMuted}>
                  Keine Historie – probier die Journey auf dem „Mood Journey“
                  Tab aus!
                </Text>
              )}
            </View>
          </Animated.ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>

      {/* LOGIN SHEET */}
      <LoginBottomSheet
        visible={showLoginSheet}
        onClose={() => setShowLoginSheet(false)}
        onApple={() => router.push("/auth/login")}
        onGoogle={() => router.push("/auth/login")}
      />
    </View>
  );
}

/** ============================================================
 *               RESULT CARD (mit Mood-Engine)
 *  Lädt:  - 1 Foto
 *        - Top 3 Moods über spot_moods_agg → mood_tokens
 * ============================================================ */

function ResultCard({ spot }: { spot: Spot }) {
  const router = useRouter();
  const [photo, setPhoto] = useState<string | null>(null);
  const [moods, setMoods] = useState<string[]>([]);

  // Lade erstes Foto
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("spot_photos")
        .select("url")
        .eq("spot_id", spot.id)
        .order("id", { ascending: true })
        .limit(1);

      setPhoto(data?.[0]?.url ?? null);
    })();
  }, [spot.id]);

  // Lade Top-Moods (rank <= 3)
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("spot_moods_agg")
        .select(`
          mood_tokens ( token ),
          rank
        `)
        .eq("spot_id", spot.id)
        .lte("rank", 3)
        .order("rank", { ascending: true });

      const list =
        data?.map((row: any) => row.mood_tokens?.token).filter(Boolean) ?? [];

      setMoods(list);
    })();
  }, [spot.id]);

  return (
    <Pressable
      onPress={() => router.push(`/spot/${spot.id}`)}
      style={styles.card}
    >
      <View style={styles.cardMedia}>
        <Image
          source={{
            uri:
              photo ??
              spot.header_photo_url ??
              "https://via.placeholder.com/600x400/1b1b21/777?text=No+Image",
          }}
          style={styles.cardImg}
        />

        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.45)", "rgba(0,0,0,0.85)"]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.cardOverlay}
        >
          <Text style={styles.resultTitle} numberOfLines={1}>
            {spot.name}
          </Text>

          {!!spot.address && (
            <Text style={styles.resultSubtitle} numberOfLines={1}>
              {spot.address}
            </Text>
          )}

          {/* MOOD BADGES */}
          {moods.length > 0 && (
            <View style={styles.cardChipsRow}>
              {moods.slice(0, 3).map((m, i) => (
                <View key={i} style={styles.badgeGhost}>
                  <Text style={styles.badgeGhostText}>{m}</Text>
                </View>
              ))}
            </View>
          )}
        </LinearGradient>
      </View>
    </Pressable>
  );
}


/** ================================
 *        ULTRA HEADER STYLES
 *     (Variante D – Apple + Glow)
 * =================================
*/
export const styles = StyleSheet.create({

  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },

  /* ---------------------------------------------------- */
  /*                      HERO                            */
  /* ---------------------------------------------------- */

  heroContainer: {
    height: 440,                          // leicht größer für Premium-Look
    width: "100%",
    overflow: "hidden",
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },

  heroImage: {
    flex: 1,
    justifyContent: "flex-end",
  },

  /* Parallax outer wrapper: optional */
  heroParallax: {
    flex: 1,
    width: "100%",
  },

  heroTintOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.22)",  // leichte Verdunklung
  },

  heroGlowOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.12)",
    opacity: 0.25,
  },

  heroNoise: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.10,                        // sehr subtil
  },

  heroRoundedMask: {
    position: "absolute",
    bottom: -1,
    left: 0,
    right: 0,
    height: 20,
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
  },

  heroSafe: {
    paddingHorizontal: 22,
    paddingBottom: 36,
    flex: 1,
    justifyContent: "flex-end",
  },

  /* Avatar orb */
  heroAvatarOrb: {
    position: "absolute",
    top: 16,
    right: 20,
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.12)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    shadowColor: "#000",
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },

  heroAvatarImg: {
    width: "100%",
    height: "100%",
  },

  /* Textblock */
  heroTextWrap: {
    marginBottom: 18,
  },

  heroTimeEmoji: {
    fontSize: 44,
    marginBottom: 6,
  },

  heroGreeting: {
    fontSize: 34,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 0.3,
  },

  heroSubtitle: {
    marginTop: 4,
    fontSize: 18,
    color: "rgba(255,255,255,0.82)",
    fontWeight: "400",
  },

  heroShine: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "100%",
    opacity: 0.55,
    pointerEvents: "none",
  },

  /* ---------------------------------------------------- */
  /*              FLOATING SEARCH BAR                     */
  /* ---------------------------------------------------- */

  floatingSearchContainer: {
    marginTop: -58,                       // perfekter Abstand zum Header
    paddingHorizontal: theme.spacing(2),
  },

  searchBox: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    borderRadius: theme.radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    shadowColor: "#000",
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },

  searchInput: {
    flex: 1,
    color: "#fff",
    fontSize: 16,
  },

  /* ---------------------------------------------------- */
  /*                  MOOD CHIPS                          */
  /* ---------------------------------------------------- */

  moodChipsRow: {
    flexDirection: "row",
    marginTop: theme.spacing(2),
    paddingLeft: theme.spacing(2),
    paddingRight: theme.spacing(2),
    gap: 10,
  },

  moodChip: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: theme.radius.pill,
    backgroundColor: "rgba(255,255,255,0.09)",
    borderColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
  },

  moodChipSurprise: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.accent,
    borderColor: "rgba(255,255,255,0.22)",
    borderWidth: 1,
  },

  moodChipText: {
    color: "#fff",
    fontWeight: "700",
  },

  /* ---------------------------------------------------- */
  /*                    CTA MAP BUTTON (GLASS)            */
  /* ---------------------------------------------------- */

  mapBtnWrapper: {
    marginHorizontal: theme.spacing(2),
    marginBottom: theme.spacing(2),
    borderRadius: theme.radius.xl,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 8 },
  },

  mapBtnBlur: {
    borderRadius: theme.radius.xl,
    backgroundColor: "rgba(255,255,255,0.06)",
  },

  mapBtn: {
    paddingVertical: theme.spacing(1.9),
    alignItems: "center",
    justifyContent: "center",
  },

  mapBtnTextGlass: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.25,
    textShadowColor: "rgba(0,0,0,0.3)",
    textShadowRadius: 4,
    textShadowOffset: { width: 0, height: 1 },
  },

  /* ---------------------------------------------------- */
  /*                     SECTIONS                         */
  /* ---------------------------------------------------- */

  sectionHeader: {
    marginTop: theme.spacing(2),
    marginBottom: theme.spacing(1),
  },

  sectionTitle: {
    color: "#fff",
    fontSize: 19,
    fontWeight: "800",
    marginBottom: 6,
  },

  sectionUnderline: {
    height: 2,
    width: 42,
    backgroundColor: theme.colors.accent,
    borderRadius: 2,
  },

  textMuted: {
    color: theme.colors.textMuted,
    fontSize: 15,
    maxWidth: 320,
  },

  /* ---------------------------------------------------- */
  /*                       CARDS                           */
  /* ---------------------------------------------------- */

  card: {
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.radius.xxl,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.08)",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },

  cardMedia: { position: "relative" },

  cardImg: {
    width: "100%",
    height: 220,
    backgroundColor: "#222",
  },

  cardOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 14,
  },

  resultTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 2,
  },

  resultSubtitle: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 13,
    marginBottom: 8,
  },

  cardChipsRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },

  badgeGhost: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
  },

  badgeGhostText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },

  /* ---------------------------------------------------- */
  /*                    RECENTS                           */
  /* ---------------------------------------------------- */

  recentImg: {
    width: "100%",
    height: 140,
    borderRadius: theme.radius.lg,
    marginBottom: theme.spacing(1),
    backgroundColor: "#222",
  },
});

