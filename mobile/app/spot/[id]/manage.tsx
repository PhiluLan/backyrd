import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { trackEvent } from "@/lib/events";

type Category = { id: string; name: string };

type OwnerContext = {
  spot_id: string;
  spot_name: string;
  city: string | null;
  address: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  price_level: number | null;
  category_id: string | null;
  category_name: string | null;

  is_verified_owner: boolean;

  description_source: string | null;
  effective_description: string | null;
  effective_keywords: string[] | null;
};

export default function SpotManageScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();

  // IMPORTANT: avoid String(undefined) -> "undefined"
  const spotId = useMemo(() => {
    const raw = params?.id;
    return typeof raw === "string" && raw.length > 0 ? raw : null;
  }, [params?.id]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [ctx, setCtx] = useState<OwnerContext | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);

  // editable fields
  const [desc, setDesc] = useState("");
  const [keywordsRaw, setKeywordsRaw] = useState(""); // comma separated
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [priceLevel, setPriceLevel] = useState<string>(""); // "1".."4"
  const [categoryId, setCategoryId] = useState<string>("");

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);

        if (!spotId) {
          Alert.alert("Fehler", "Spot-ID fehlt.");
          router.back();
          return;
        }

        const { data: sessionData } = await supabase.auth.getSession();
        const userId = sessionData.session?.user?.id;

        if (!userId) {
          router.replace("/auth/login");
          return;
        }

        const [{ data: ctxData, error: ctxErr }, { data: catData, error: catErr }] =
          await Promise.all([
            supabase.rpc("get_spot_owner_context_v1", { p_spot_id: spotId }),
            supabase.from("categories").select("id,name").order("name"),
          ]);

        if (ctxErr) throw ctxErr;
        if (catErr) throw catErr;

        const row = Array.isArray(ctxData) ? ctxData[0] : ctxData;
        if (!row) throw new Error("Spot not found");

        const normalized: OwnerContext = {
          spot_id: String(row.spot_id),
          spot_name: String(row.spot_name),
          city: row.city ? String(row.city) : null,
          address: row.address ? String(row.address) : null,
          website: row.website ? String(row.website) : null,
          phone: row.phone ? String(row.phone) : null,
          email: row.email ? String(row.email) : null,
          price_level: row.price_level ?? null,
          category_id: row.category_id ? String(row.category_id) : null,
          category_name: row.category_name ? String(row.category_name) : null,
          is_verified_owner: row.is_verified_owner === true,
          description_source: row.description_source ? String(row.description_source) : null,
          effective_description: row.effective_description ? String(row.effective_description) : null,
          effective_keywords: Array.isArray(row.effective_keywords)
            ? row.effective_keywords.map(String)
            : null,
        };

        if (!normalized.is_verified_owner) {
          Alert.alert("Kein Zugriff", "Du bist nicht als Owner verifiziert.");
          router.back();
          return;
        }

        if (!alive) return;

        setCtx(normalized);
        setCategories(
          (catData ?? []).map((c: any) => ({ id: String(c.id), name: String(c.name) }))
        );

        setDesc(normalized.effective_description ?? "");
        setKeywordsRaw((normalized.effective_keywords ?? []).join(", "));
        setEmail(normalized.email ?? "");
        setPhone(normalized.phone ?? "");
        setWebsite(normalized.website ?? "");
        setPriceLevel(normalized.price_level ? String(normalized.price_level) : "");
        setCategoryId(normalized.category_id ?? "");

        await trackEvent({
          userId,
          eventType: "spot_manage_opened",
          entityType: "spot",
          entityId: normalized.spot_id,
          meta: { city: normalized.city ?? null },
        });
      } catch (e: any) {
        console.log("manage load error", e);
        Alert.alert("Fehler", e?.message ?? "Unbekannter Fehler");
        router.back();
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [spotId, router]);

  const keywords = useMemo(() => {
    return keywordsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 20);
  }, [keywordsRaw]);

  async function saveAll() {
    if (!ctx) return;

    try {
      setSaving(true);

      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;
      if (!userId) throw new Error("not_authenticated");

      const { error: dErr } = await supabase.rpc("upsert_owner_description_v1", {
        p_spot_id: ctx.spot_id,
        p_description: desc,
        p_keywords: keywords,
      });
      if (dErr) throw dErr;

      const parsedPrice = priceLevel ? Number(priceLevel) : null;
      const validPrice = parsedPrice && Number.isFinite(parsedPrice) ? parsedPrice : null;

      const { error: sErr } = await supabase.rpc("upsert_spot_owner_fields_v1", {
        p_spot_id: ctx.spot_id,
        p_category_id: categoryId || null,
        p_price_level: validPrice,
        p_email: email || null,
        p_phone: phone || null,
        p_website: website || null,
        p_header_photo_path: null,
      });
      if (sErr) throw sErr;

      await trackEvent({
        userId,
        eventType: "spot_manage_saved",
        entityType: "spot",
        entityId: ctx.spot_id,
        meta: {
          category_id: categoryId || null,
          price_level: validPrice,
          has_desc: desc.trim().length > 0,
          keyword_count: keywords.length,
        },
      });

      Alert.alert("Gespeichert", "Deine Änderungen wurden übernommen.");
      router.back();
    } catch (e: any) {
      console.log("save error", e);
      Alert.alert("Fehler", e?.message ?? "Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  }

  // ✅ Render Branches: INSIDE component, after hooks
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#0B0B0C" }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!ctx) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#0B0B0C", padding: 20 }}>
        <Text style={{ color: "white", opacity: 0.8, textAlign: "center" }}>
          Spot konnte nicht geladen werden.
        </Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 14 }}>
          <Text style={{ color: "white", textDecorationLine: "underline" }}>Zurück</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#0B0B0C" }}
      contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
    >
      <Text style={{ color: "white", fontSize: 26, marginBottom: 6 }}>Spot verwalten</Text>
      <Text style={{ color: "rgba(255,255,255,0.7)", marginBottom: 18 }}>{ctx.spot_name}</Text>

      <Text style={{ color: "rgba(255,255,255,0.85)", marginBottom: 6 }}>Beschreibung</Text>
      <TextInput
        value={desc}
        onChangeText={setDesc}
        multiline
        placeholder="Beschreibe deinen Ort in 2–4 Sätzen (ehrlich, hilfreich, mit Keywords)…"
        placeholderTextColor="rgba(255,255,255,0.4)"
        style={{
          minHeight: 110,
          borderRadius: 12,
          padding: 12,
          backgroundColor: "rgba(255,255,255,0.10)",
          color: "white",
          marginBottom: 12,
        }}
      />

      <Text style={{ color: "rgba(255,255,255,0.85)", marginBottom: 6 }}>Keywords (Komma-getrennt)</Text>
      <TextInput
        value={keywordsRaw}
        onChangeText={setKeywordsRaw}
        placeholder="z.B. cocktails, international, gemütlich, lunch"
        placeholderTextColor="rgba(255,255,255,0.4)"
        style={{
          borderRadius: 12,
          padding: 12,
          backgroundColor: "rgba(255,255,255,0.10)",
          color: "white",
          marginBottom: 12,
        }}
      />

      <Text style={{ color: "rgba(255,255,255,0.85)", marginBottom: 6 }}>Kategorie</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        {categories.map((c) => (
          <TouchableOpacity
            key={c.id}
            onPress={() => setCategoryId(c.id)}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 8,
              borderRadius: 999,
              backgroundColor: categoryId === c.id ? "white" : "rgba(255,255,255,0.10)",
            }}
          >
            <Text style={{ color: categoryId === c.id ? "black" : "white" }}>{c.name}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={{ color: "rgba(255,255,255,0.85)", marginBottom: 6 }}>Preisniveau (1–4)</Text>
      <TextInput
        value={priceLevel}
        onChangeText={setPriceLevel}
        keyboardType="number-pad"
        placeholder="z.B. 2"
        placeholderTextColor="rgba(255,255,255,0.4)"
        style={{
          borderRadius: 12,
          padding: 12,
          backgroundColor: "rgba(255,255,255,0.10)",
          color: "white",
          marginBottom: 12,
        }}
      />

      <Text style={{ color: "rgba(255,255,255,0.85)", marginBottom: 6 }}>Kontakt</Text>
      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="Email"
        placeholderTextColor="rgba(255,255,255,0.4)"
        style={{ borderRadius: 12, padding: 12, backgroundColor: "rgba(255,255,255,0.10)", color: "white", marginBottom: 10 }}
      />
      <TextInput
        value={phone}
        onChangeText={setPhone}
        placeholder="Telefon"
        placeholderTextColor="rgba(255,255,255,0.4)"
        style={{ borderRadius: 12, padding: 12, backgroundColor: "rgba(255,255,255,0.10)", color: "white", marginBottom: 10 }}
      />
      <TextInput
        value={website}
        onChangeText={setWebsite}
        placeholder="Website (https://...)"
        placeholderTextColor="rgba(255,255,255,0.4)"
        style={{ borderRadius: 12, padding: 12, backgroundColor: "rgba(255,255,255,0.10)", color: "white", marginBottom: 18 }}
      />

      <TouchableOpacity
        disabled={saving}
        onPress={saveAll}
        style={{
          backgroundColor: "white",
          paddingVertical: 12,
          borderRadius: 14,
          alignItems: "center",
          opacity: saving ? 0.6 : 1,
          marginBottom: 10,
        }}
      >
        <Text style={{ color: "black", fontSize: 16 }}>{saving ? "Speichern…" : "Änderungen speichern"}</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.back()} style={{ paddingVertical: 12, alignItems: "center" }}>
        <Text style={{ color: "rgba(255,255,255,0.7)" }}>Zurück</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
