"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { BlockedPeople } from "@/components/consumer/blocked-people";
import { SettingsShell } from "@/components/consumer/settings-shell";
import { Button, StateView, Toast } from "@/components/consumer/ui";
import { supabase } from "@/lib/supabase/client";
export default function PrivacyPage() {
  const [user, setUser] = useState<string | null>(null);
  const [privateValue, setPrivate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const pending = useRef(false);
  const load = useCallback(async () => {
    setLoading(true); setFailed(false);
    try {
      const { data, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      const id = data.user?.id ?? null;
      setUser(id);
      if (!id) return;
      const { data: profile, error } = await supabase.from("profiles").select("is_private").eq("id", id).single();
      if (error || typeof profile?.is_private !== "boolean") throw error ?? new Error("privacy_missing");
      setPrivate(profile.is_private);
    } catch { setFailed(true); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function apply(next: boolean) {
    if (!user || pending.current) return;
    pending.current = true; setBusy(true); setToast(null);
    try {
      const { data, error } = await supabase.rpc("set_my_profile_privacy_v1", { p_is_private: next });
      const saved = Array.isArray(data) ? data[0] : data;
      if (error || saved?.is_private !== next || saved?.user_id !== user) throw error ?? new Error("privacy_not_confirmed");
      setPrivate(saved.is_private); setConfirming(false);
      setToast(next ? "Dein Profil ist jetzt privat. Die Änderung wurde gespeichert." : "Dein Profil ist jetzt öffentlich. Die Änderung wurde gespeichert.");
    } catch { setToast("Die Änderung konnte nicht bestätigt werden. Bitte lade die Einstellung erneut und prüfe den gespeicherten Stand."); }
    finally { pending.current = false; setBusy(false); }
  }
  return <SettingsShell title="SICHTBARKEIT" kicker="DEIN PROFIL">
    {loading ? <div className="b-skeleton" style={{ height: 220, borderRadius: 22 }} /> : failed ? <StateView title="Sichtbarkeit nicht geladen" message="Deine gespeicherte Einstellung ist gerade nicht verfügbar." actionLabel="Erneut versuchen" onAction={() => void load()} /> : !user ? <StateView title="Anmeldung nötig" message="Melde dich an, um deine Sichtbarkeit zu ändern." actionLabel="Anmelden" onAction={() => location.assign("/login?next=/settings/privacy")} /> : <div className="b-surface" style={{ padding: 24 }}>
      <div className="b-setting-row"><div><h2 className="b-card-title">Privates Profil</h2><p className="b-muted">Dein Profil und deine Momente sind dann für andere verborgen. Du kannst nicht markiert werden. Wer deinen vollständigen Nutzernamen kennt, kann dir schreiben. Blockieren verhindert Kontakt. Bereits veröffentlichte Ortseindrücke können auf Ortsseiten sichtbar bleiben.</p></div>
        <button type="button" className="b-switch" role="switch" aria-checked={privateValue} aria-label="Privates Profil" disabled={busy || confirming} aria-busy={busy} onClick={() => privateValue ? void apply(false) : setConfirming(true)} />
      </div>
      {confirming ? <section aria-label="Privates Profil bestätigen"><h3>Konto privat setzen?</h3><p>Bestehende Follower und deine Folge-Verbindungen werden entfernt. Wenn du dein Profil später wieder öffentlich machst, werden diese Verbindungen nicht wiederhergestellt.</p><Button variant="secondary" disabled={busy} onClick={() => setConfirming(false)}>Abbrechen</Button> <Button disabled={busy} onClick={() => void apply(true)}>{busy ? "Wird gespeichert …" : "Privat setzen"}</Button></section> : null}
    </div>}
    {user ? <BlockedPeople /> : null}
    {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}
  </SettingsShell>;
}
