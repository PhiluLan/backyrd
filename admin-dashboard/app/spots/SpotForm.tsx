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

const STATUS_OPTIONS: SpotStatus[] = ["pending", "approved", "rejected", "hidden"];

const PRICE_LEVEL_OPTIONS = [
  { value: 1, label: "$" },
  { value: 2, label: "$$" },
  { value: 3, label: "$$$" },
  { value: 4, label: "$$$$" },
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

interface OpeningHour {
  day_of_week: string;
  open_time: string | null;
  close_time: string | null;
  closed: boolean;
}

interface SpotPhoto {
  id: string;
  url: string;
}

/* ---------------------------------------------
   GOOGLE MAPS HELFER
--------------------------------------------- */

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
  const item = comp.find((c: any) =>
    c.types.includes("locality") || c.types.includes("postal_town")
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

/* ---------------------------------------------
   SPOT FORM
--------------------------------------------- */

export function SpotForm({ mode, initialValues, spotId, onSaved }: SpotFormProps) {
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
    }
  );

  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);

  const [openingHours, setOpeningHours] = useState<OpeningHour[]>(
    DAYS_OF_WEEK.map((day) => ({
      day_of_week: day,
      open_time: null,
      close_time: null,
      closed: true,
    }))
  );

  const [existingGallery, setExistingGallery] = useState<SpotPhoto[]>([]);
  const [galleryFiles, setGalleryFiles] = useState<File[]>([]);
  const [headerFile, setHeaderFile] = useState<File | null>(null);

  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const addressInputRef = useRef<HTMLInputElement | null>(null);

  /* ---------------------------------------------
     GOOGLE AUTOCOMPLETE
  --------------------------------------------- */
  useEffect(() => {
    async function init() {
      const apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY;
      if (!apiKey) {
        console.warn("Kein Google Maps API Key gesetzt");
        return;
      }

      await loadGoogleScript(apiKey);

      if (!addressInputRef.current || !(window as any).google) return;

      const autocomplete = new (window as any).google.maps.places.Autocomplete(
        addressInputRef.current,
        {
          types: ["address"],
          componentRestrictions: { country: "ch" },
        }
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

    init();
  }, []);

  /* ---------------------------------------------
     Kategorien laden
  --------------------------------------------- */
  useEffect(() => {
    async function loadCategories() {
      const { data, error } = await supabase.from("categories").select("id, name");
      if (!error && data) setCategories(data);
    }
    loadCategories();
  }, []);

  /* ---------------------------------------------
     PREVIEW FÜR HEADER-FOTO
  --------------------------------------------- */
  useEffect(() => {
    if (!values.header_photo_path) {
      setPhotoPreviewUrl(null);
      return;
    }

    // Wenn bereits eine volle URL gespeichert ist:
    if (values.header_photo_path.startsWith("http")) {
      setPhotoPreviewUrl(values.header_photo_path);
      return;
    }

    const { data } = supabase.storage
      .from("spot-photos")
      .getPublicUrl(values.header_photo_path);

    setPhotoPreviewUrl(data?.publicUrl ?? null);
  }, [values.header_photo_path]);

  /* ---------------------------------------------
     Öffnungszeiten aus initialValues übernehmen
  --------------------------------------------- */
  useEffect(() => {
    if (!initialValues?.opening_hours) return;

    const mapped = DAYS_OF_WEEK.map((day) => {
      const existing = initialValues.opening_hours?.find(
        (e: any) => e.day_of_week === day
      );

      return {
        day_of_week: day,
        open_time: existing?.open_time ? existing.open_time.slice(0, 5) : null,
        close_time: existing?.close_time ? existing.close_time.slice(0, 5) : null,
        closed: existing?.open_time ? false : true,
      };
    });

    setOpeningHours(mapped);
  }, [initialValues]);

  /* ---------------------------------------------
     Galerie aus DB laden (Edit-Modus)
  --------------------------------------------- */
  useEffect(() => {
    if (!spotId) return;

    async function loadGallery() {
      const { data, error } = await supabase
        .from("spot_photos")
        .select("id, url")
        .eq("spot_id", spotId)
        .order("created_at", { ascending: true });

      if (!error && data) {
        setExistingGallery(data as SpotPhoto[]);
      }
    }

    loadGallery();
  }, [spotId]);

  /* ---------------------------------------------
     Helpers
  --------------------------------------------- */

  function handleChange<K extends keyof SpotFormValues>(key: K, value: SpotFormValues[K]) {
    setValues((p) => ({ ...p, [key]: value }));
  }

  function updateOpeningHour(index: number, patch: Partial<OpeningHour>) {
    setOpeningHours((prev) =>
      prev.map((oh, i) => (i === index ? { ...oh, ...patch } : oh))
    );
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
      // Storage entfernen (optional, aber nice)
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

    // 1. In Storage hochladen
    const { error: uploadError } = await supabase.storage
      .from("spot-photos")
      .upload(filename, file);

    if (uploadError) throw uploadError;

    // 2. Public URL erzeugen
    const { data } = supabase.storage
      .from("spot-photos")
      .getPublicUrl(filename);

    const url = data.publicUrl;

    // 3. Spot: header_photo_path updaten
    await supabase
      .from("spots")
      .update({ header_photo_path: url })
      .eq("id", spotId);

    // 4. WICHTIG: Auch in spot_photos eintragen
    await supabase.from("spot_photos").insert({
      spot_id: spotId,
      url,
    });

    return url;
  }


  async function uploadGalleryPhotos(files: File[], spotId: string) {
    for (const file of files) {
      const ext = file.name.split(".").pop();
      const filename = `gallery-${spotId}-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      const { error } = await supabase.storage
        .from("spot-photos")
        .upload(filename, file);

      if (error) throw error;

      const { data } = supabase.storage
        .from("spot-photos")
        .getPublicUrl(filename);

      const url = data.publicUrl;

      await supabase.from("spot_photos").insert({
        spot_id: spotId,
        url,
      });
    }
  }


  async function upsertOpeningHours(spotId: string) {
    await supabase.from("spot_hours").delete().eq("spot_id", spotId);

    const rows = openingHours.map((oh, idx) => ({
      spot_id: spotId,
      idx,
      day_of_week: oh.day_of_week,
      open_time: oh.closed ? null : oh.open_time ? oh.open_time + ":00" : null,
      close_time: oh.closed ? null : oh.close_time ? oh.close_time + ":00" : null,
    }));

    const { error } = await supabase.from("spot_hours").insert(rows);
    if (error) throw error;
  }

  /* ---------------------------------------------
     SUBMIT
  --------------------------------------------- */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    let savedSpotId = spotId ?? null;

    // ❗ opening_hours entfernen, damit Supabase nicht versucht, es zu speichern
    const { opening_hours, ...cleanValues } = values;

    const payload: SpotFormValues = {
      ...cleanValues,
      lat: cleanValues.lat ?? null,
      lng: cleanValues.lng ?? null,
    };

    try {
      // Spot speichern
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

      // Öffnungszeiten
      await upsertOpeningHours(savedSpotId);

      // Headerfoto
      if (headerFile) {
        setUploadingPhoto(true);
        await uploadHeaderPhoto(headerFile, savedSpotId);
        setHeaderFile(null);
        setUploadingPhoto(false);
      }

      // Galerie
      if (galleryFiles.length > 0) {
        setUploadingPhoto(true);
        await uploadGalleryPhotos(galleryFiles, savedSpotId);
        setUploadingPhoto(false);
      }

      setSuccess("Gespeichert!");
      onSaved?.();

    } catch (err: any) {
      console.error(err);
      setError(err.message ?? "Fehler beim Speichern.");
    } finally {
      setSaving(false);
    }
  }



  /* ---------------------------------------------
     RENDER
  --------------------------------------------- */

  return (
    <>
      <form onSubmit={handleSubmit} className="spot-form">
        {error && <p className="form-message form-error">{error}</p>}
        {success && <p className="form-message form-success">{success}</p>}

        {/* NAME */}
        <div className="form-group">
          <label className="form-label">Name *</label>
          <input
            type="text"
            required
            value={values.name}
            onChange={(e) => handleChange("name", e.target.value)}
            className="form-input"
          />
        </div>

        {/* ADRESSE */}
        <div className="form-group">
          <label className="form-label">Adresse</label>
          <input
            type="text"
            ref={addressInputRef}
            value={values.address ?? ""}
            onChange={(e) => handleChange("address", e.target.value)}
            className="form-input"
          />
        </div>

        {/* STADT + LAND */}
        <div className="form-grid grid-2">
          <div className="form-group">
            <label className="form-label">Stadt</label>
            <input
              type="text"
              value={values.city ?? ""}
              onChange={(e) => handleChange("city", e.target.value)}
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Land</label>
            <input
              type="text"
              value={values.country ?? ""}
              onChange={(e) => handleChange("country", e.target.value)}
              className="form-input"
            />
          </div>
        </div>

        {/* LAT + LNG */}
        <div className="form-grid grid-2">
          <div className="form-group">
            <label className="form-label">Latitude</label>
            <input
              type="number"
              step="0.000001"
              value={values.lat ?? ""}
              onChange={(e) =>
                handleChange(
                  "lat",
                  e.target.value === "" ? null : Number(e.target.value)
                )
              }
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Longitude</label>
            <input
              type="number"
              step="0.000001"
              value={values.lng ?? ""}
              onChange={(e) =>
                handleChange(
                  "lng",
                  e.target.value === "" ? null : Number(e.target.value)
                )
              }
              className="form-input"
            />
          </div>
        </div>

        {/* KATEGORIE / PREISLEVEL / STATUS */}
        <div className="form-grid grid-3">
          <div className="form-group">
            <label className="form-label">Kategorie</label>
            <select
              value={values.category_id ?? ""}
              onChange={(e) =>
                handleChange("category_id", e.target.value || null)
              }
              className="form-input"
            >
              <option value="">– wählen –</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Preislevel</label>
            <select
              value={values.price_level ?? ""}
              onChange={(e) =>
                handleChange(
                  "price_level",
                  e.target.value === "" ? null : Number(e.target.value)
                )
              }
              className="form-input"
            >
              <option value="">–</option>
              {PRICE_LEVEL_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Status</label>
            <select
              value={values.status}
              onChange={(e) =>
                handleChange("status", e.target.value as SpotStatus)
              }
              className="form-input"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* WEBSITE */}
        <div className="form-group">
          <label className="form-label">Website</label>
          <input
            type="url"
            value={values.website ?? ""}
            onChange={(e) => handleChange("website", e.target.value)}
            className="form-input"
          />
        </div>

        {/* PHONE + MAIL */}
        <div className="form-grid grid-2">
          <div className="form-group">
            <label className="form-label">Telefon</label>
            <input
              type="tel"
              value={values.phone ?? ""}
              onChange={(e) => handleChange("phone", e.target.value)}
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label className="form-label">E-Mail</label>
            <input
              type="email"
              value={values.email ?? ""}
              onChange={(e) => handleChange("email", e.target.value)}
              className="form-input"
            />
          </div>
        </div>

        {/* ÖFFNUNGSZEITEN */}
        <div className="hours-section">
          <h3 className="section-title">Öffnungszeiten</h3>

          {openingHours.map((oh, index) => (
            <div className="hours-row" key={oh.day_of_week}>
              <div className="hours-day">{oh.day_of_week}</div>

              <label className="hours-closed">
                <input
                  type="checkbox"
                  checked={oh.closed}
                  onChange={(e) =>
                    updateOpeningHour(index, {
                      closed: e.target.checked,
                      open_time: e.target.checked ? null : oh.open_time,
                      close_time: e.target.checked ? null : oh.close_time,
                    })
                  }
                />
                <span>Geschlossen</span>
              </label>

              <div className="hours-times">
                <input
                  type="time"
                  value={oh.open_time ?? ""}
                  disabled={oh.closed}
                  onChange={(e) =>
                    updateOpeningHour(index, {
                      open_time: e.target.value || null,
                    })
                  }
                  className="form-input time-input"
                />

                <span>–</span>

                <input
                  type="time"
                  value={oh.close_time ?? ""}
                  disabled={oh.closed}
                  onChange={(e) =>
                    updateOpeningHour(index, {
                      close_time: e.target.value || null,
                    })
                  }
                  className="form-input time-input"
                />
              </div>
            </div>
          ))}
        </div>

        {/* HEADER FOTO */}
        <div className="form-group">
          <label className="form-label">Header Foto</label>

          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleHeaderFileChange}
            className="file-input"
          />

          {uploadingPhoto && (
            <p className="form-message">Foto wird hochgeladen…</p>
          )}

          {photoPreviewUrl && (
            <img src={photoPreviewUrl} className="photo-preview" alt="Header" />
          )}
        </div>

        {/* GALERIE */}
        <div className="form-group">
          <label className="form-label">Galerie-Fotos</label>

          <input
            type="file"
            accept="image/*"
            multiple
            onChange={handleGalleryFilesChange}
            className="file-input"
          />

          <div className="gallery-grid">
            {existingGallery.map((photo) => (
              <div key={photo.id} className="gallery-item">
                <img src={photo.url} alt="" className="gallery-img" />
                <button
                  type="button"
                  className="gallery-delete"
                  onClick={() => deleteExistingPhoto(photo)}
                >
                  Entfernen
                </button>
              </div>
            ))}

            {galleryFiles.map((file, idx) => (
              <div key={`new-${idx}`} className="gallery-item">
                <img
                  src={URL.createObjectURL(file)}
                  alt=""
                  className="gallery-img"
                />
                <button
                  type="button"
                  className="gallery-delete"
                  onClick={() => removeGalleryFile(idx)}
                >
                  Entfernen
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* SUBMIT */}
        <button className="btn-primary" disabled={saving}>
          {saving ? "Speichere…" : mode === "create" ? "Spot erstellen" : "Speichern"}
        </button>
      </form>

      {/* CSS */}
      <style jsx>{`
        .spot-form {
          max-width: 720px;
          margin-bottom: 4rem;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }

        .form-label {
          font-weight: 500;
          font-size: 0.9rem;
        }

        .form-message {
          font-size: 0.9rem;
        }

        .form-error {
          color: #ff6b6b;
        }

        .form-success {
          color: #4ade80;
        }

        .form-input {
          background: #771919;
          border: 1px solid rgba(255, 255, 255, 0.15);
          padding: 0.55rem 0.75rem;
          border-radius: 8px;
          color: var(--foreground);
        }

        .form-input::placeholder {
          color: rgba(255, 255, 255, 0.4);
        }

        .form-grid {
          display: grid;
          gap: 1rem;
        }
        .grid-2 {
          grid-template-columns: repeat(2, 1fr);
        }
        .grid-3 {
          grid-template-columns: repeat(3, 1fr);
        }

        @media (max-width: 700px) {
          .grid-2,
          .grid-3 {
            grid-template-columns: 1fr;
          }
        }

        .hours-section {
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          padding-top: 1rem;
        }

        .section-title {
          font-size: 1.1rem;
          margin-bottom: 0.7rem;
        }

        .hours-row {
          display: grid;
          grid-template-columns: 120px 140px 1fr;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.25rem;
        }

        .hours-day {
          font-size: 0.9rem;
        }

        .hours-closed {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          font-size: 0.85rem;
        }

        .hours-times {
          display: flex;
          gap: 0.4rem;
          align-items: center;
        }

        .time-input {
          max-width: 110px;
        }

        .file-input {
          border: none;
          padding: 0;
          margin: 0;
          color: var(--foreground);
          font-size: 0.85rem;
        }

        .photo-preview {
          margin-top: 0.5rem;
          max-width: 100%;
          max-height: 260px;
          object-fit: cover;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.15);
        }

        .gallery-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
          gap: 0.75rem;
          margin-top: 0.75rem;
        }

        .gallery-item {
          position: relative;
          border-radius: 10px;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.12);
        }

        .gallery-img {
          width: 100%;
          height: 100px;
          object-fit: cover;
          display: block;
        }

        .gallery-delete {
          position: absolute;
          right: 6px;
          bottom: 6px;
          padding: 0.2rem 0.45rem;
          border-radius: 999px;
          border: none;
          font-size: 0.7rem;
          background: rgba(0, 0, 0, 0.7);
          color: #fff;
          cursor: pointer;
        }

        .btn-primary {
          background: var(--accent);
          color: white;
          border: none;
          padding: 0.7rem 1.2rem;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
        }

        .btn-primary:disabled {
          opacity: 0.6;
          cursor: default;
        }
      `}</style>
    </>
  );
}
