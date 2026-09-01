"use client";
import { useEffect, useState } from "react";
import { SettingsShell } from "@/components/consumer/settings-shell";
import { StateView, Toast } from "@/components/consumer/ui";
import { supabase } from "@/lib/supabase/client";
export default function PrivacyPage() {
  const [user, setUser] = useState<string | null>(null);
  const [privateValue, setPrivate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data.user?.id ?? null;
      setUser(id);
      if (id) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("is_private")
          .eq("id", id)
          .maybeSingle();
        setPrivate(Boolean(profile?.is_private));
      }
      setLoading(false);
    })();
  }, []);
  async function toggle() {
    if (!user) return;
    const next = !privateValue;
    setPrivate(next);
    const { error } = await supabase.rpc("set_my_profile_privacy_v1", {
      p_is_private: next,
    });
    if (error) {
      setPrivate(!next);
      setToast("Die Sichtbarkeit konnte nicht gespeichert werden.");
    } else
      setToast(
        next
          ? "Dein Profil ist jetzt privat."
          : "Dein Profil ist jetzt öffentlich.",
      );
  }
  return (
    <SettingsShell title="SICHTBARKEIT" kicker="DEIN PROFIL">
      {loading ? (
        <div className="b-skeleton" style={{ height: 220, borderRadius: 22 }} />
      ) : !user ? (
        <StateView
          title="Anmeldung nötig"
          message="Deine Sichtbarkeit gehört zu deinem Konto."
        />
      ) : (
        <div className="b-surface" style={{ padding: 24 }}>
          <div className="b-setting-row">
            <div>
              <h2 className="b-card-title">Privates Profil</h2>
              <p className="b-muted">
                Wenn aktiv, sehen nur bestehende Follow-Beziehungen deine
                freigegebenen Inhalte. Deine eigene Sicht bleibt unverändert.
              </p>
            </div>
            <button
              type="button"
              className="b-switch"
              role="switch"
              aria-checked={privateValue}
              aria-label="Privates Profil"
              onClick={() => void toggle()}
            />
          </div>
        </div>
      )}
      {toast ? (
        <Toast message={toast} onDismiss={() => setToast(null)} />
      ) : null}
    </SettingsShell>
  );
}
