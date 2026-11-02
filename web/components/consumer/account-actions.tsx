"use client";
import { useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { Button, Dialog, Toast } from "./ui";
export function AccountActions() {
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  async function logout() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setToast(null);
    try {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) throw error;
      window.location.replace("/");
    } catch { setToast("Abmelden konnte nicht bestätigt werden. Bitte prüfe deine Verbindung und versuche es erneut."); }
    finally { pending.current = false; setBusy(false); }
  }
  return (
    <section className="b-surface" style={{ padding: 24, marginTop: 42 }}>
      <p className="b-kicker">Konto</p>
      <h2 className="b-section-title" style={{ marginTop: 8 }}>
        Abmelden
      </h2>
      <p className="b-muted">
        Du wirst nur in diesem Browser abgemeldet. Dein Konto und deine Inhalte
        bleiben bestehen.
      </p>
      <Button variant="secondary" disabled={busy} onClick={() => setConfirm(true)}>
        Abmelden
      </Button>
      <Dialog
        open={confirm}
        title="Wirklich abmelden?"
        onClose={() => { if (!busy) setConfirm(false); }}
      >
        <p className="b-muted">Du kannst dich jederzeit wieder anmelden.</p>
        <div className="b-form-actions">
          <Button variant="secondary" disabled={busy} onClick={() => setConfirm(false)}>
            Hierbleiben
          </Button>
          <Button disabled={busy} onClick={() => void logout()}>{busy ? "Wird abgemeldet …" : "Abmelden"}</Button>
        </div>
      </Dialog>
      {toast ? (
        <Toast message={toast} onDismiss={() => setToast(null)} />
      ) : null}
    </section>
  );
}
