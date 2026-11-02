"use client";
import { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { SettingsShell } from "@/components/consumer/settings-shell";
import { Avatar, Button, StateView, Toast } from "@/components/consumer/ui";
import { isAccountUsername, profilePhotoObjectKey } from "@backyrd/shared";
import { useUnsavedChanges } from "@/lib/use-unsaved-changes";
import { supabase } from "@/lib/supabase/client";
export default function EditProfilePage() {
  const pending = useRef(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [form, setForm] = useState({
    display_name: "",
    username: "",
    city: "",
    bio: "",
    website: "",
    instagram: "",
  });
  const [baseline, setBaseline] = useState("");
  const { confirmLeave, allowLeave } = useUnsavedChanges(Boolean(baseline) && JSON.stringify(form) !== baseline);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError(false);
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      setUserId(auth.user?.id ?? null);
      if (!auth.user) return;
      const { data, error: profileError } = await supabase.from("profiles")
        .select("display_name,username,city,bio,website,instagram,avatar_url").eq("id", auth.user.id).single();
      if (profileError || !data) throw profileError ?? new Error("profile_missing");
      const loaded = { display_name: data.display_name ?? "", username: data.username ?? "", city: data.city ?? "", bio: data.bio ?? "", website: data.website ?? "", instagram: data.instagram ?? "" };
      setForm(loaded); setBaseline(JSON.stringify(loaded)); setAvatar(data.avatar_url);
    } catch { setError(true); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function uploadPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file || !userId || pending.current) return;
    if (!["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/avif"].includes(file.type) || file.size > 8 * 1024 * 1024) {
      setToast("Bitte wähle ein Bild (JPG, PNG, WebP, HEIC, HEIF oder AVIF) mit höchstens 8 MB."); return;
    }
    pending.current = true; setPhotoBusy(true); setToast(null);
    try {
      const key = profilePhotoObjectKey(userId, crypto.randomUUID());
      const { error: uploadError } = await supabase.storage.from("profile-photos").upload(key, file, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;
      const { data: publicUrl } = supabase.storage.from("profile-photos").getPublicUrl(key);
      const { data, error: updateError } = await supabase.from("profiles").update({ avatar_url: publicUrl.publicUrl, header_photo_url: publicUrl.publicUrl }).eq("id", userId).select("id,display_name,username,bio").single();
      if (updateError || data?.id !== userId) throw updateError ?? new Error("avatar_save_not_confirmed");
      setAvatar(publicUrl.publicUrl);
      const snapshot = await supabase.rpc("safety_register_content_snapshot_v1", {
        p_entity_type: "profile", p_entity_id: userId, p_content_type: "profile", p_actor_user_id: userId, p_spot_id: null,
        p_text_content: [data.display_name, data.username, data.bio].filter(Boolean).join("\n"),
        p_image_urls: [publicUrl.publicUrl], p_source_surface: "web_profile_avatar_upload", p_source_context: { client: "consumer_web" },
      });
      setToast(snapshot.error ? "Profilfoto gespeichert. Die Inhaltsprüfung konnte noch nicht bestätigt werden." : "Profilfoto gespeichert.");
    } catch { setToast("Das neue Profilfoto konnte nicht vollständig gespeichert werden. Bitte prüfe deine Verbindung und versuche es erneut."); }
    finally { pending.current = false; setPhotoBusy(false); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    if (!userId) { setToast("Melde dich bitte erneut an. Deine Eingaben bleiben erhalten."); return; }
    const username = form.username.trim().toLowerCase();
    if (form.display_name.trim().length < 2 || form.display_name.trim().length > 60) {
      setToast("Bitte gib einen Namen mit 2 bis 60 Zeichen ein."); return;
    }
    if (!isAccountUsername(username)) {
      setToast("Dein Benutzername braucht 3 bis 24 Zeichen: Buchstaben ohne Umlaute, Zahlen, Punkt oder Unterstrich."); return;
    }
    pending.current = true;
    setToast(null); setBusy(true);
    const payload = {
      ...form,
      display_name: form.display_name.trim(),
      username,
      city: form.city.trim() || null,
      bio: form.bio.trim() || null,
      website: form.website.trim() || null,
      instagram: form.instagram.trim() || null,
    };
    try {
    const { data, error } = await supabase
      .from("profiles")
      .update(payload)
      .eq("id", userId).select("id").single();
    if (!error && data?.id === userId) {
      setBaseline(JSON.stringify(form));
      const snapshot = await supabase.rpc("safety_register_content_snapshot_v1", {
        p_entity_type: "profile",
        p_entity_id: userId,
        p_content_type: "profile",
        p_actor_user_id: userId,
        p_spot_id: null,
        p_text_content: Object.values(payload).filter(Boolean).join("\n"),
        p_image_urls: [],
        p_source_surface: "web_edit_profile",
        p_source_context: { client: "consumer_web" },
      });
      setToast(snapshot.error ? "Profil gespeichert. Die Inhaltsprüfung konnte noch nicht bestätigt werden." : "Profil gespeichert.");
    } else
      setToast(
        error?.code === "23505"
          ? "Dieser Benutzername ist schon vergeben."
          : "Das Profil konnte nicht gespeichert werden.",
      );
    } catch {
      setToast("Das Profil konnte nicht gespeichert werden. Deine Eingaben bleiben erhalten. Prüfe deine Verbindung und versuche es erneut.");
    } finally { pending.current = false; setBusy(false); }
  }
  return (
    <SettingsShell title="PROFIL BEARBEITEN">
      {loading ? (
        <div className="b-skeleton" style={{ height: 480, borderRadius: 22 }} />
      ) : error ? (
        <StateView
          title="Profil nicht geladen"
          message="Deine bestehenden Angaben konnten nicht geladen werden."
          actionLabel="Erneut versuchen"
          onAction={() => void load()}
        />
      ) : !userId ? (
        <StateView
          title="Anmeldung nötig"
          message="Melde dich an, um dein Profil zu bearbeiten."
          actionLabel="Anmelden"
          onAction={() => location.assign("/login?next=/settings/profile")}
        />
      ) : (
        <form className="b-form" onSubmit={submit} aria-busy={busy || photoBusy}>
          <div className="b-setting-row">
            <Avatar src={avatar} name={form.display_name || "Profil"} size="lg" />
            <div><Button variant="secondary" disabled={busy || photoBusy} onClick={() => photoInput.current?.click()}>{photoBusy ? "Foto wird gespeichert …" : "Profilfoto wählen"}</Button><p className="b-meta">Ein neues Profilfoto wird sofort gespeichert. Höchstens 8 MB.</p></div>
            <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif" hidden onChange={(event) => void uploadPhoto(event)} />
          </div>
          <fieldset className="b-form-fields" disabled={busy || photoBusy}>
          <div className="b-form-row">
            <Field
              label="Öffentlicher Name"
              value={form.display_name}
              onChange={(display_name) => setForm({ ...form, display_name })}
            />
            <Field
              label="Benutzername"
              value={form.username}
              onChange={(username) => setForm({ ...form, username })}
            />
          </div>
          <Field
            label="Stadt"
            value={form.city}
            onChange={(city) => setForm({ ...form, city })}
          />
          <div className="b-input-group">
            <label className="b-label" htmlFor="bio">
              Bio
            </label>
            <textarea
              id="bio"
              className="b-textarea"
              maxLength={500}
              value={form.bio}
              onChange={(event) =>
                setForm({ ...form, bio: event.target.value })
              }
            />
          </div>
          <div className="b-form-row">
            <Field
              label="Website"
              value={form.website}
              onChange={(website) => setForm({ ...form, website })}
            />
            <Field
              label="Instagram"
              value={form.instagram}
              onChange={(instagram) => setForm({ ...form, instagram })}
            />
          </div>
          </fieldset>
          <div className="b-form-actions">
            <Button
              type="button"
              variant="secondary"
              disabled={busy || photoBusy}
              onClick={() => { if (confirmLeave()) { allowLeave(); history.back(); } }}
            >
              Abbrechen
            </Button>
            <Button type="submit" disabled={busy || photoBusy}>
              {busy ? "Wird gespeichert …" : "Speichern"}
            </Button>
          </div>
        </form>
      )}
      {toast ? (
        <Toast message={toast} onDismiss={() => setToast(null)} />
      ) : null}
    </SettingsShell>
  );
}
function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = label.toLowerCase().replace(/\s/g, "-");
  return (
    <div className="b-input-group">
      <label className="b-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="b-input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
