"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { Spot, SpotStatus } from "@/types/spots";

type SpotFormValues = Omit<Spot, "id" | "created_at" | "created_by">;

interface SpotFormProps {
  mode: "create" | "edit";
  initialValues?: SpotFormValues & { opening_hours?: any[] };
  spotId?: string;
  onSaved?: () => void;
}

const STATUS_OPTIONS: SpotStatus[] = [
  "pending",
  "approved",
  "rejected",
  "hidden",
];

const PRICE_LEVEL_OPTIONS = [
  { value: 1, label: "$" },
  { value: 2, label: "$$" },
  { value: 3, label: "$$$" },
  { value: 4, label: "$$$$" },
  { value: 5, label: "$$$$$" },
];

const DAYS_OF_WEEK = [
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
  "Samstag",
  "Sonntag",
];

interface CategoryOption {
  id: string;
  name: string;
}

interface OpeningHourSlot {
  client_id: string;
  open_time: string | null;
  close_time: string | null;
}

type OpeningHoursByDay = Record<string, OpeningHourSlot[]>;

interface SpotPhoto {
  id: string;
  url: string;
}

interface SpotIntelligenceFormState {
  best_for: string;
  occasion_tags: string;
  atmosphere_tags: string;
  avoid_if_tags: string;
  good_for_time: string;
  noise_level: string;
  crowd_type: string;
  dress_code: string;
  reservation_recommended: "" | "true" | "false";
  average_duration_minutes: string;
  signature_items: string;
  special_notes: string;
  admin_notes: string;
  is_verified: boolean;
}

const EMPTY_INTELLIGENCE: SpotIntelligenceFormState = {
  best_for: "",
  occasion_tags: "",
  atmosphere_tags: "",
  avoid_if_tags: "",
  good_for_time: "",
  noise_level: "",
  crowd_type: "",
  dress_code: "",
  reservation_recommended: "",
  average_duration_minutes: "",
  signature_items: "",
  special_notes: "",
  admin_notes: "",
  is_verified: false,
};

function parseTagInput(value: string): string[] {
  return value
    .split(/[\n,]+/g)
    .map((v) => v.trim())
    .filter(Boolean);
}

function tagsToText(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value.filter(Boolean).join(", ");
}

function cleanNullableText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function createOpeningSlot(
  open_time: string | null = null,
  close_time: string | null = null,
): OpeningHourSlot {
  return {
    client_id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    open_time,
    close_time,
  };
}

function createEmptyOpeningHours(): OpeningHoursByDay {
  return DAYS_OF_WEEK.reduce((acc, day) => {
    acc[day] = [];
    return acc;
  }, {} as OpeningHoursByDay);
}

function normalizeTime(value: string | null | undefined): string | null {
  if (!value) return null;
  return String(value).slice(0, 5);
}

function loadGoogleScript(apiKey: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window !== "undefined" && (window as any).google) {
      resolve();
      return;
    }

    const existing = document.querySelector("#google-maps-script");
    if (existing) {
      existing.addEventListener("load", () => resolve());
      return;
    }

    const script = document.createElement("script");
    script.id = "google-maps-script";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.onload = () => resolve();
    document.head.appendChild(script);
  });
}

function extractCity(place: any): string {
  const comp = place.address_components || [];
  const item = comp.find(
    (c: any) => c.types.includes("locality") || c.types.includes("postal_town"),
  );
  return item?.long_name ?? "";
}

function extractCountry(place: any): string {
  const comp = place.address_components || [];
  const item = comp.find((c: any) => c.types.includes("country"));
  return item?.long_name ?? "";
}

function storagePathFromPublicUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const idx = u.pathname.indexOf("/spot-photos/");
    if (idx === -1) return null;
    return u.pathname.substring(idx + "/spot-photos/".length);
  } catch {
    return null;
  }
}

export function SpotForm({
  mode,
  initialValues,
  spotId,
  onSaved,
}: SpotFormProps) {
  const [values, setValues] = useState<SpotFormValues>(
    initialValues ?? {
      name: "",
      address: "",
      city: "",
      country: "Switzerland",
      lat: null,
      lng: null,
      category_id: null,
      price_level: null,
      website: "",
      phone: "",
      email: "",
      header_photo_path: "",
      status: "pending",
    },
  );

  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);

  const [openingHours, setOpeningHours] = useState<OpeningHoursByDay>(
    createEmptyOpeningHours(),
  );

  const [existingGallery, setExistingGallery] = useState<SpotPhoto[]>([]);
  const [galleryFiles, setGalleryFiles] = useState<File[]>([]);
  const [headerFile, setHeaderFile] = useState<File | null>(null);

  const [adminDescription, setAdminDescription] = useState("");
  const [adminKeywords, setAdminKeywords] = useState("");
  const [intelligence, setIntelligence] =
    useState<SpotIntelligenceFormState>(EMPTY_INTELLIGENCE);

  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const addressInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    async function init() {
      const apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY;
      if (!apiKey) return;

      await loadGoogleScript(apiKey);
      if (!addressInputRef.current || !(window as any).google) return;

      const autocomplete = new (window as any).google.maps.places.Autocomplete(
        addressInputRef.current,
        { types: ["address"], componentRestrictions: { country: "ch" } },
      );

      autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        if (!place || !place.geometry) return;

        handleChange("address", place.formatted_address ?? "");
        handleChange("lat", place.geometry.location.lat());
        handleChange("lng", place.geometry.location.lng());
        handleChange("city", extractCity(place));
        handleChange("country", extractCountry(place));
      });
    }

    void init();
  }, []);

  useEffect(() => {
    async function loadCategories() {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name");
      if (!error && data) setCategories(data);
    }
    void loadCategories();
  }, []);

  useEffect(() => {
    if (!values.header_photo_path) {
      setPhotoPreviewUrl(null);
      return;
    }

    if (values.header_photo_path.startsWith("http")) {
      setPhotoPreviewUrl(values.header_photo_path);
      return;
    }

    const { data } = supabase.storage
      .from("spot-photos")
      .getPublicUrl(values.header_photo_path);

    setPhotoPreviewUrl(data?.publicUrl ?? null);
  }, [values.header_photo_path]);

  useEffect(() => {
    if (!initialValues?.opening_hours) return;

    const next = createEmptyOpeningHours();

    const sortedRows = [...initialValues.opening_hours].sort((a: any, b: any) => {
      const aIdx = typeof a.idx === "number" ? a.idx : 9999;
      const bIdx = typeof b.idx === "number" ? b.idx : 9999;
      return aIdx - bIdx;
    });

    for (const row of sortedRows) {
      const day = row.day_of_week;
      if (!day || !DAYS_OF_WEEK.includes(day)) continue;

      const open = normalizeTime(row.open_time);
      const close = normalizeTime(row.close_time);

      if (!open || !close) continue;

      next[day].push(createOpeningSlot(open, close));
    }

    setOpeningHours(next);
  }, [initialValues]);

  useEffect(() => {
    if (!spotId) return;

    async function loadGallery() {
      const { data, error } = await supabase
        .from("spot_photos")
        .select("id, url")
        .eq("spot_id", spotId)
        .order("created_at", { ascending: true });

      if (!error && data) setExistingGallery(data as SpotPhoto[]);
    }

    void loadGallery();
  }, [spotId]);

  useEffect(() => {
    if (!spotId) return;

    async function loadContentAndIntelligence() {
      const { data: descriptionData, error: descriptionError } = await supabase
        .from("spot_descriptions")
        .select(
          "owner_description, owner_keywords, enriched_description, enriched_keywords",
        )
        .eq("spot_id", spotId)
        .maybeSingle();

      if (!descriptionError && descriptionData) {
        setAdminDescription(
          (descriptionData.owner_description ||
            descriptionData.enriched_description ||
            "") as string,
        );
        setAdminKeywords(
          tagsToText(
            descriptionData.owner_keywords ||
              descriptionData.enriched_keywords ||
              [],
          ),
        );
      }

      const { data: intelligenceData, error: intelligenceError } =
        await supabase.rpc("get_spot_intelligence_v1", { p_spot_id: spotId });

      if (
        !intelligenceError &&
        Array.isArray(intelligenceData) &&
        intelligenceData[0]
      ) {
        const row = intelligenceData[0];
        setIntelligence({
          best_for: tagsToText(row.best_for),
          occasion_tags: tagsToText(row.occasion_tags),
          atmosphere_tags: tagsToText(row.atmosphere_tags),
          avoid_if_tags: tagsToText(row.avoid_if_tags),
          good_for_time: tagsToText(row.good_for_time),
          noise_level: row.noise_level || "",
          crowd_type: tagsToText(row.crowd_type),
          dress_code: row.dress_code || "",
          reservation_recommended:
            row.reservation_recommended === true
              ? "true"
              : row.reservation_recommended === false
                ? "false"
                : "",
          average_duration_minutes: row.average_duration_minutes
            ? String(row.average_duration_minutes)
            : "",
          signature_items: tagsToText(row.signature_items),
          special_notes: row.special_notes || "",
          admin_notes: row.admin_notes || "",
          is_verified: Boolean(row.is_verified),
        });
      }
    }

    void loadContentAndIntelligence();
  }, [spotId]);

  function handleChange<K extends keyof SpotFormValues>(
    key: K,
    value: SpotFormValues[K],
  ) {
    setValues((p) => ({ ...p, [key]: value }));
  }

  function setDayClosed(day: string, closed: boolean) {
    setOpeningHours((prev) => ({
      ...prev,
      [day]: closed ? [] : prev[day]?.length > 0 ? prev[day] : [createOpeningSlot()],
    }));
  }

  function addOpeningSlot(day: string) {
    setOpeningHours((prev) => ({
      ...prev,
      [day]: [...(prev[day] ?? []), createOpeningSlot()],
    }));
  }

  function removeOpeningSlot(day: string, slotClientId: string) {
    setOpeningHours((prev) => ({
      ...prev,
      [day]: (prev[day] ?? []).filter((slot) => slot.client_id !== slotClientId),
    }));
  }

  function updateOpeningSlot(
    day: string,
    slotClientId: string,
    patch: Partial<OpeningHourSlot>,
  ) {
    setOpeningHours((prev) => ({
      ...prev,
      [day]: (prev[day] ?? []).map((slot) =>
        slot.client_id === slotClientId ? { ...slot, ...patch } : slot,
      ),
    }));
  }

  function handleHeaderFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setHeaderFile(file);
    setPhotoPreviewUrl(URL.createObjectURL(file));
  }

  function handleGalleryFilesChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setGalleryFiles((prev) => [...prev, ...files]);
  }

  function removeGalleryFile(index: number) {
    setGalleryFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function deleteExistingPhoto(photo: SpotPhoto) {
    setError(null);
    try {
      const path = storagePathFromPublicUrl(photo.url);
      if (path) {
        await supabase.storage.from("spot-photos").remove([path]);
      }

      await supabase.from("spot_photos").delete().eq("id", photo.id);
      setExistingGallery((prev) => prev.filter((p) => p.id !== photo.id));
    } catch (err: any) {
      console.error(err);
      setError(err.message ?? "Fehler beim Löschen des Fotos.");
    }
  }

  async function uploadHeaderPhoto(file: File, spotId: string) {
    const ext = file.name.split(".").pop();
    const filename = `header-${spotId}-${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("spot-photos")
      .upload(filename, file);

    if (uploadError) throw uploadError;

    const { data } = supabase.storage
      .from("spot-photos")
      .getPublicUrl(filename);
    const url = data.publicUrl;

    await supabase
      .from("spots")
      .update({ header_photo_path: url })
      .eq("id", spotId);
    await supabase.from("spot_photos").insert({ spot_id: spotId, url });

    return url;
  }

  async function uploadGalleryPhotos(files: File[], spotId: string) {
    for (const file of files) {
      const ext = file.name.split(".").pop();
      const filename = `gallery-${spotId}-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}.${ext}`;

      const { error } = await supabase.storage
        .from("spot-photos")
        .upload(filename, file);
      if (error) throw error;

      const { data } = supabase.storage
        .from("spot-photos")
        .getPublicUrl(filename);
      const url = data.publicUrl;

      await supabase.from("spot_photos").insert({ spot_id: spotId, url });
    }
  }

  async function upsertOpeningHours(spotId: string) {
    await supabase.from("spot_hours").delete().eq("spot_id", spotId);

    const rows: {
      spot_id: string;
      idx: number;
      day_of_week: string;
      open_time: string | null;
      close_time: string | null;
    }[] = [];

    let idx = 0;

    for (const day of DAYS_OF_WEEK) {
      const slots = openingHours[day] ?? [];

      for (const slot of slots) {
        if (!slot.open_time || !slot.close_time) continue;

        rows.push({
          spot_id: spotId,
          idx,
          day_of_week: day,
          open_time: `${slot.open_time}:00`,
          close_time: `${slot.close_time}:00`,
        });

        idx += 1;
      }
    }

    if (rows.length === 0) return;

    const { error } = await supabase.from("spot_hours").insert(rows);
    if (error) throw error;
  }

  async function upsertAdminContent(savedSpotId: string) {
    const description = cleanNullableText(adminDescription);
    const keywords = parseTagInput(adminKeywords);

    if (!description && keywords.length === 0) return;

    const { error } = await supabase.rpc("upsert_spot_admin_content_v1", {
      p_spot_id: savedSpotId,
      p_description: description,
      p_keywords: keywords,
      p_source: "admin",
      p_enriched_url: null,
    });

    if (error) throw error;
  }

  async function upsertIntelligence(savedSpotId: string) {
    const hasAnyValue =
      parseTagInput(intelligence.best_for).length > 0 ||
      parseTagInput(intelligence.occasion_tags).length > 0 ||
      parseTagInput(intelligence.atmosphere_tags).length > 0 ||
      parseTagInput(intelligence.avoid_if_tags).length > 0 ||
      parseTagInput(intelligence.good_for_time).length > 0 ||
      parseTagInput(intelligence.crowd_type).length > 0 ||
      parseTagInput(intelligence.signature_items).length > 0 ||
      cleanNullableText(intelligence.noise_level) ||
      cleanNullableText(intelligence.dress_code) ||
      cleanNullableText(intelligence.average_duration_minutes) ||
      cleanNullableText(intelligence.special_notes) ||
      cleanNullableText(intelligence.admin_notes) ||
      intelligence.reservation_recommended !== "" ||
      intelligence.is_verified;

    if (!hasAnyValue) return;

    const duration = Number(intelligence.average_duration_minutes);

    const { error } = await supabase.rpc("upsert_spot_intelligence_v1", {
      p_spot_id: savedSpotId,
      p_best_for: parseTagInput(intelligence.best_for),
      p_occasion_tags: parseTagInput(intelligence.occasion_tags),
      p_atmosphere_tags: parseTagInput(intelligence.atmosphere_tags),
      p_avoid_if_tags: parseTagInput(intelligence.avoid_if_tags),
      p_good_for_time: parseTagInput(intelligence.good_for_time),
      p_noise_level: cleanNullableText(intelligence.noise_level),
      p_crowd_type: parseTagInput(intelligence.crowd_type),
      p_dress_code: cleanNullableText(intelligence.dress_code),
      p_reservation_recommended:
        intelligence.reservation_recommended === ""
          ? null
          : intelligence.reservation_recommended === "true",
      p_average_duration_minutes:
        Number.isFinite(duration) && duration > 0 ? duration : null,
      p_signature_items: parseTagInput(intelligence.signature_items),
      p_special_notes: cleanNullableText(intelligence.special_notes),
      p_admin_notes: cleanNullableText(intelligence.admin_notes),
      p_source: "admin",
      p_is_verified: intelligence.is_verified,
    });

    if (error) throw error;
  }

  async function refreshSpotMl(savedSpotId: string) {
    const { error } = await supabase.rpc("backyrd_refresh_spot_ml_document_v13", {
      p_spot_id: savedSpotId,
    });

    if (error) throw error;

    try {
      const { error: queueError } = await supabase.rpc(
        "backyrd_enqueue_spot_embedding_v13",
        {
          p_spot_id: savedSpotId,
          p_reason: "admin_dashboard_spot_update",
        },
      );

      if (queueError) {
        console.warn("Embedding queue failed:", queueError);
      }
    } catch (queueErr) {
      console.warn("Embedding queue request failed:", queueErr);
    }
  }

  function updateIntelligence<K extends keyof SpotIntelligenceFormState>(
    key: K,
    value: SpotIntelligenceFormState[K],
  ) {
    setIntelligence((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    let savedSpotId = spotId ?? null;

    const payload: SpotFormValues = {
      ...values,
      lat: values.lat ?? null,
      lng: values.lng ?? null,
    };

    try {
      if (mode === "create") {
        const { data, error } = await supabase
          .from("spots")
          .insert(payload)
          .select("id")
          .single();

        if (error || !data) throw error;
        savedSpotId = data.id as string;
      } else if (mode === "edit" && spotId) {
        const { error } = await supabase
          .from("spots")
          .update(payload)
          .eq("id", spotId);
        if (error) throw error;
      }

      if (!savedSpotId) throw new Error("Spot ID fehlt nach dem Speichern.");

      await upsertAdminContent(savedSpotId);
      await upsertIntelligence(savedSpotId);
      await upsertOpeningHours(savedSpotId);

      if (headerFile) {
        setUploadingPhoto(true);
        await uploadHeaderPhoto(headerFile, savedSpotId);
        setHeaderFile(null);
        setUploadingPhoto(false);
      }

      if (galleryFiles.length > 0) {
        setUploadingPhoto(true);
        await uploadGalleryPhotos(galleryFiles, savedSpotId);
        setUploadingPhoto(false);
      }

      await refreshSpotMl(savedSpotId);

      setSuccess("Gespeichert! ML-Dokument wurde aktualisiert und Embedding wurde in die Queue gelegt.");
      onSaved?.();
      } catch (err: any) {
        const details = {
          message: err?.message,
          code: err?.code,
          details: err?.details,
          hint: err?.hint,
          name: err?.name,
          raw: err,
        };

        console.error("SpotForm save failed:", details);

        setError(
          err?.message ||
            err?.details ||
            err?.hint ||
            JSON.stringify(details, null, 2) ||
            "Fehler beim Speichern.",
        );
      } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="by-form">
      {error ? <div className="by-alert by-alertError">{error}</div> : null}
      {success ? <div className="by-alert by-alertOk">{success}</div> : null}

      <div className="by-formGrid1">
        <Field label="Name *">
          <input
            type="text"
            required
            value={values.name}
            onChange={(e) => handleChange("name", e.target.value)}
            className="by-input"
          />
        </Field>

        <Field label="Adresse">
          <input
            type="text"
            ref={addressInputRef}
            value={(values.address ?? "") as any}
            onChange={(e) => handleChange("address", e.target.value as any)}
            className="by-input"
          />
        </Field>

        <div className="by-formGrid2">
          <Field label="Stadt">
            <input
              type="text"
              value={(values.city ?? "") as any}
              onChange={(e) => handleChange("city", e.target.value as any)}
              className="by-input"
            />
          </Field>

          <Field label="Land">
            <input
              type="text"
              value={(values.country ?? "") as any}
              onChange={(e) => handleChange("country", e.target.value as any)}
              className="by-input"
            />
          </Field>
        </div>

        <div className="by-formGrid2">
          <Field label="Latitude">
            <input
              type="number"
              step="0.000001"
              value={(values.lat ?? "") as any}
              onChange={(e) =>
                handleChange(
                  "lat",
                  e.target.value === ""
                    ? (null as any)
                    : (Number(e.target.value) as any),
                )
              }
              className="by-input"
            />
          </Field>

          <Field label="Longitude">
            <input
              type="number"
              step="0.000001"
              value={(values.lng ?? "") as any}
              onChange={(e) =>
                handleChange(
                  "lng",
                  e.target.value === ""
                    ? (null as any)
                    : (Number(e.target.value) as any),
                )
              }
              className="by-input"
            />
          </Field>
        </div>

        <div className="by-formGrid3">
          <Field label="Kategorie">
            <select
              value={(values.category_id ?? "") as any}
              onChange={(e) =>
                handleChange("category_id", (e.target.value || null) as any)
              }
              className="by-select"
            >
              <option value="">– wählen –</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Preislevel">
            <select
              value={(values.price_level ?? "") as any}
              onChange={(e) =>
                handleChange(
                  "price_level",
                  e.target.value === ""
                    ? (null as any)
                    : (Number(e.target.value) as any),
                )
              }
              className="by-select"
            >
              <option value="">–</option>
              {PRICE_LEVEL_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Status">
            <select
              value={values.status as any}
              onChange={(e) => handleChange("status", e.target.value as any)}
              className="by-select"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Website">
          <input
            type="url"
            value={(values.website ?? "") as any}
            onChange={(e) => handleChange("website", e.target.value as any)}
            className="by-input"
          />
        </Field>

        <div className="by-formGrid2">
          <Field label="Telefon">
            <input
              type="tel"
              value={(values.phone ?? "") as any}
              onChange={(e) => handleChange("phone", e.target.value as any)}
              className="by-input"
            />
          </Field>

          <Field label="E-Mail">
            <input
              type="email"
              value={(values.email ?? "") as any}
              onChange={(e) => handleChange("email", e.target.value as any)}
              className="by-input"
            />
          </Field>
        </div>

        <div className="by-panel by-section" style={{ padding: 14 }}>
          <div className="by-h3">Beschreibung & Keywords</div>
          <div className="by-muted by-small">
            Fliesst direkt ins ML-Dokument und in die semantische Suche ein.
          </div>

          <div style={{ height: 12 }} />

          <Field label="Beschreibung">
            <textarea
              value={adminDescription}
              onChange={(e) => setAdminDescription(e.target.value)}
              className="by-input"
              rows={5}
              placeholder="Was ist dieser Ort wirklich? Stimmung, Angebot, Besonderheit, Vibe…"
            />
          </Field>

          <Field label="Keywords / Suchbegriffe">
            <textarea
              value={adminKeywords}
              onChange={(e) => setAdminKeywords(e.target.value)}
              className="by-input"
              rows={3}
              placeholder="Kultur, ruhig, urban, inspirierend, Regenwetter…"
            />
          </Field>
        </div>

        <div className="by-panel by-section" style={{ padding: 14 }}>
          <div className="by-h3">Spot Intelligence</div>
          <div className="by-muted by-small">
            Strukturierte Decision-Daten für bessere Empfehlungen und Texte.
          </div>

          <div style={{ height: 12 }} />

          <div className="by-formGrid2">
            <Field label="Gut für">
              <textarea
                value={intelligence.best_for}
                onChange={(e) => updateIntelligence("best_for", e.target.value)}
                className="by-input"
                rows={3}
                placeholder="ruhiger Nachmittag, Date, Solo Inspiration"
              />
            </Field>

            <Field label="Anlässe">
              <textarea
                value={intelligence.occasion_tags}
                onChange={(e) =>
                  updateIntelligence("occasion_tags", e.target.value)
                }
                className="by-input"
                rows={3}
                placeholder="date, solo, kultur, regenwetter"
              />
            </Field>
          </div>

          <div className="by-formGrid2">
            <Field label="Atmosphäre">
              <textarea
                value={intelligence.atmosphere_tags}
                onChange={(e) =>
                  updateIntelligence("atmosphere_tags", e.target.value)
                }
                className="by-input"
                rows={3}
                placeholder="ruhig, warm, urban, inspirierend"
              />
            </Field>

            <Field label="Eher nicht geeignet für">
              <textarea
                value={intelligence.avoid_if_tags}
                onChange={(e) =>
                  updateIntelligence("avoid_if_tags", e.target.value)
                }
                className="by-input"
                rows={3}
                placeholder="Party, laute Gruppen, schnelles Essen"
              />
            </Field>
          </div>

          <div className="by-formGrid2">
            <Field label="Gute Zeiten / Situationen">
              <textarea
                value={intelligence.good_for_time}
                onChange={(e) =>
                  updateIntelligence("good_for_time", e.target.value)
                }
                className="by-input"
                rows={3}
                placeholder="nachmittag, abend, wochenende, regen"
              />
            </Field>

            <Field label="Crowd / Publikum">
              <textarea
                value={intelligence.crowd_type}
                onChange={(e) =>
                  updateIntelligence("crowd_type", e.target.value)
                }
                className="by-input"
                rows={3}
                placeholder="locals, kulturpublikum, studierende"
              />
            </Field>
          </div>

          <div className="by-formGrid3">
            <Field label="Geräuschlevel">
              <select
                value={intelligence.noise_level}
                onChange={(e) =>
                  updateIntelligence("noise_level", e.target.value)
                }
                className="by-select"
              >
                <option value="">–</option>
                <option value="quiet">quiet</option>
                <option value="moderate">moderate</option>
                <option value="lively">lively</option>
                <option value="loud">loud</option>
              </select>
            </Field>

            <Field label="Dresscode">
              <select
                value={intelligence.dress_code}
                onChange={(e) =>
                  updateIntelligence("dress_code", e.target.value)
                }
                className="by-select"
              >
                <option value="">–</option>
                <option value="casual">casual</option>
                <option value="smart_casual">smart casual</option>
                <option value="dressy">dressy</option>
              </select>
            </Field>

            <Field label="Reservation empfohlen">
              <select
                value={intelligence.reservation_recommended}
                onChange={(e) =>
                  updateIntelligence(
                    "reservation_recommended",
                    e.target
                      .value as SpotIntelligenceFormState["reservation_recommended"],
                  )
                }
                className="by-select"
              >
                <option value="">–</option>
                <option value="true">ja</option>
                <option value="false">nein</option>
              </select>
            </Field>
          </div>

          <div className="by-formGrid2">
            <Field label="Typische Aufenthaltsdauer Minuten">
              <input
                type="number"
                min={0}
                value={intelligence.average_duration_minutes}
                onChange={(e) =>
                  updateIntelligence("average_duration_minutes", e.target.value)
                }
                className="by-input"
              />
            </Field>

            <Field label="Verifiziert">
              <label className="by-hoursClosed" style={{ minHeight: 44 }}>
                <input
                  type="checkbox"
                  checked={intelligence.is_verified}
                  onChange={(e) =>
                    updateIntelligence("is_verified", e.target.checked)
                  }
                />
                <span>Decision-Daten geprüft</span>
              </label>
            </Field>
          </div>

          <Field label="Signature Items / Highlights">
            <textarea
              value={intelligence.signature_items}
              onChange={(e) =>
                updateIntelligence("signature_items", e.target.value)
              }
              className="by-input"
              rows={3}
              placeholder="Hausbier, Ausstellung, Terrasse, Brunch, Cocktails…"
            />
          </Field>

          <Field label="Besondere Hinweise">
            <textarea
              value={intelligence.special_notes}
              onChange={(e) =>
                updateIntelligence("special_notes", e.target.value)
              }
              className="by-input"
              rows={3}
              placeholder="Kurze öffentliche Notiz für bessere Empfehlungstexte"
            />
          </Field>

          <Field label="Interne Admin Notes">
            <textarea
              value={intelligence.admin_notes}
              onChange={(e) =>
                updateIntelligence("admin_notes", e.target.value)
              }
              className="by-input"
              rows={3}
              placeholder="Nur für Admin / Qualitätssicherung"
            />
          </Field>
        </div>

        <div className="by-panel by-section" style={{ padding: 14 }}>
          <div className="by-h3">Öffnungszeiten</div>
          <div className="by-muted by-small">
            Pro Tag mehrere Zeitfenster möglich, z.B. 11:00–14:00 und 18:00–22:00.
          </div>

          <div style={{ height: 10 }} />

          <div className="by-hours">
            {DAYS_OF_WEEK.map((day) => {
              const slots = openingHours[day] ?? [];
              const closed = slots.length === 0;

              return (
                <div
                  className="by-hoursRow"
                  key={day}
                  style={{ alignItems: "flex-start" }}
                >
                  <div className="by-hoursDay" style={{ paddingTop: 12 }}>
                    {day}
                  </div>

                  <label className="by-hoursClosed" style={{ paddingTop: 12 }}>
                    <input
                      type="checkbox"
                      checked={closed}
                      onChange={(e) => setDayClosed(day, e.target.checked)}
                    />
                    <span>Geschlossen</span>
                  </label>

                  <div
                    style={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    {slots.map((slot, slotIndex) => (
                      <div
                        key={slot.client_id}
                        className="by-hoursTimes"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          flexWrap: "wrap",
                        }}
                      >
                        <input
                          type="time"
                          value={slot.open_time ?? ""}
                          onChange={(e) =>
                            updateOpeningSlot(day, slot.client_id, {
                              open_time: e.target.value || null,
                            })
                          }
                          className="by-input"
                          style={{ maxWidth: 140 }}
                        />

                        <span className="by-muted">–</span>

                        <input
                          type="time"
                          value={slot.close_time ?? ""}
                          onChange={(e) =>
                            updateOpeningSlot(day, slot.client_id, {
                              close_time: e.target.value || null,
                            })
                          }
                          className="by-input"
                          style={{ maxWidth: 140 }}
                        />

                        <button
                          type="button"
                          className="by-btn by-btn-soft"
                          onClick={() => removeOpeningSlot(day, slot.client_id)}
                          style={{ minHeight: 42 }}
                        >
                          Entfernen
                        </button>

                        <span className="by-muted by-small">
                          Zeitfenster {slotIndex + 1}
                        </span>
                      </div>
                    ))}

                    {!closed ? (
                      <button
                        type="button"
                        className="by-btn by-btn-soft"
                        onClick={() => addOpeningSlot(day)}
                        style={{ alignSelf: "flex-start" }}
                      >
                        + Zeitfenster hinzufügen
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="by-panel by-section" style={{ padding: 14 }}>
          <div className="by-h3">Header Foto</div>
          <div className="by-muted by-small">
            Upload in Storage + Eintrag in spot_photos.
          </div>

          <div style={{ height: 10 }} />

          <input
            type="file"
            accept="image/*"
            onChange={handleHeaderFileChange}
            className="by-file"
          />

          {uploadingPhoto ? (
            <div className="by-muted by-small" style={{ marginTop: 8 }}>
              Foto wird hochgeladen…
            </div>
          ) : null}

          {photoPreviewUrl ? (
            <img
              src={photoPreviewUrl}
              className="by-photoPreview"
              alt="Header"
            />
          ) : null}
        </div>

        <div className="by-panel by-section" style={{ padding: 14 }}>
          <div className="by-h3">Galerie-Fotos</div>
          <div className="by-muted by-small">
            Mehrere Bilder, werden zu spot_photos hinzugefügt.
          </div>

          <div style={{ height: 10 }} />

          <input
            type="file"
            accept="image/*"
            multiple
            onChange={handleGalleryFilesChange}
            className="by-file"
          />

          <div className="by-gallery">
            {existingGallery.map((photo) => (
              <div key={photo.id} className="by-galleryItem">
                <img src={photo.url} alt="" className="by-galleryImg" />
                <button
                  type="button"
                  className="by-galleryDelete"
                  onClick={() => void deleteExistingPhoto(photo)}
                >
                  Entfernen
                </button>
              </div>
            ))}

            {galleryFiles.map((file, idx) => (
              <div key={`new-${idx}`} className="by-galleryItem">
                <img
                  src={URL.createObjectURL(file)}
                  alt=""
                  className="by-galleryImg"
                />
                <button
                  type="button"
                  className="by-galleryDelete"
                  onClick={() => removeGalleryFile(idx)}
                >
                  Entfernen
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="by-toolbar">
          <button
            className="by-btn by-btn-accent"
            disabled={saving}
            type="submit"
          >
            {saving
              ? "Speichere…"
              : mode === "create"
                ? "Spot erstellen"
                : "Speichern"}
          </button>

          {success ? (
            <span className="by-muted by-small">{success}</span>
          ) : null}
        </div>
      </div>
    </form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="by-field">
      <div className="by-fieldLabel">{label}</div>
      {children}
    </div>
  );
}
