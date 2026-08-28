"use client";
import { FormEvent, useEffect, useState } from "react";
import { SettingsShell } from "@/components/consumer/settings-shell";
import { Button, StateView, Toast } from "@/components/consumer/ui";
import { supabase } from "@/lib/supabase/client";
export default function EditProfilePage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [form, setForm] = useState({
    display_name: "",
    username: "",
    city: "",
    bio: "",
    website: "",
    instagram: "",
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    void (async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) {
        setLoading(false);
        return;
      }
      setUserId(user.user.id);
      const { data, error } = await supabase
        .from("profiles")
        .select("display_name,username,city,bio,website,instagram")
        .eq("id", user.user.id)
        .maybeSingle();
      if (error) setError(true);
      else if (data)
        setForm({
          display_name: data.display_name ?? "",
          username: data.username ?? "",
          city: data.city ?? "",
          bio: data.bio ?? "",
          website: data.website ?? "",
          instagram: data.instagram ?? "",
        });
      setLoading(false);
    })();
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!userId) return;
    const username = form.username
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._]/g, "");
    if (form.display_name.trim().length < 2 || username.length < 3) {
      setToast("Name und Benutzername sind noch nicht vollständig.");
      return;
    }
    setBusy(true);
    const payload = {
      ...form,
      display_name: form.display_name.trim(),
      username,
      city: form.city.trim() || null,
      bio: form.bio.trim() || null,
      website: form.website.trim() || null,
      instagram: form.instagram.trim() || null,
    };
    const { error } = await supabase
      .from("profiles")
      .update(payload)
      .eq("id", userId);
    if (!error) {
      void supabase.rpc("safety_register_content_snapshot_v1", {
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
      setToast("Profil gespeichert.");
    } else
      setToast(
        error.code === "23505"
          ? "Dieser Benutzername ist schon vergeben."
          : "Das Profil konnte nicht gespeichert werden.",
      );
    setBusy(false);
  }
  return (
    <SettingsShell title="PROFIL BEARBEITEN">
      {loading ? (
        <div className="b-skeleton" style={{ height: 480, borderRadius: 22 }} />
      ) : error ? (
        <StateView
          title="Profil nicht geladen"
          message="Versuch es gleich nochmals."
        />
      ) : !userId ? (
        <StateView
          title="Anmeldung nötig"
          message="Melde dich an, um dein Profil zu bearbeiten."
          actionLabel="Anmelden"
          onAction={() => location.assign("/login?next=/settings/profile")}
        />
      ) : (
        <form className="b-form" onSubmit={submit}>
          <div className="b-form-row">
            <Field
              label="Name"
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
          <div className="b-form-actions">
            <Button
              type="button"
              variant="secondary"
              onClick={() => history.back()}
            >
              Abbrechen
            </Button>
            <Button type="submit" disabled={busy}>
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
