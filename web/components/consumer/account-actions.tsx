"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { Button, Dialog, Toast } from "./ui";
export function AccountActions() {
  const [confirm, setConfirm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  async function logout() {
    const { error } = await supabase.auth.signOut();
    if (error) {
      setToast("Abmelden hat gerade nicht funktioniert.");
      return;
    }
    window.location.replace("/");
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
      <Button variant="secondary" onClick={() => setConfirm(true)}>
        Abmelden
      </Button>
      <Dialog
        open={confirm}
        title="Wirklich abmelden?"
        onClose={() => setConfirm(false)}
      >
        <p className="b-muted">Du kannst dich jederzeit wieder anmelden.</p>
        <div className="b-form-actions">
          <Button variant="secondary" onClick={() => setConfirm(false)}>
            Hierbleiben
          </Button>
          <Button onClick={() => void logout()}>Abmelden</Button>
        </div>
      </Dialog>
      {toast ? (
        <Toast message={toast} onDismiss={() => setToast(null)} />
      ) : null}
    </section>
  );
}
