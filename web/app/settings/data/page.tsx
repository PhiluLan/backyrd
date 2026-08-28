"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SettingsShell } from "@/components/consumer/settings-shell";
import { Button, Dialog, StateView, Toast } from "@/components/consumer/ui";
import { supabase } from "@/lib/supabase/client";
type Row = {
  request_id: string;
  request_type: string;
  status: string;
  requested_at: string;
  scheduled_for: string | null;
  export_expires_at: string | null;
};
export default function DataPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc(
      "get_my_data_rights_requests_v1",
    );
    setError(Boolean(error));
    setRows((Array.isArray(data) ? data : []) as Row[]);
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const deletion = useMemo(
    () =>
      rows.find(
        (row) =>
          row.request_type === "account_deletion" &&
          ["requested", "scheduled", "processing"].includes(row.status),
      ),
    [rows],
  );
  async function exportData() {
    setBusy(true);
    try {
      const { error } = await supabase.rpc("request_my_data_export_v1");
      if (error) throw error;
      const { data, error: functionError } = await supabase.functions.invoke(
        "generate-data-export",
        { body: {} },
      );
      if (functionError || !data?.download_url) throw functionError;
      window.open(data.download_url, "_blank", "noopener,noreferrer");
      setToast("Dein Datenexport ist bereit.");
      await load();
    } catch {
      setToast("Der Datenexport konnte gerade nicht erstellt werden.");
    } finally {
      setBusy(false);
    }
  }
  async function requestDeletion() {
    setBusy(true);
    setConfirm(false);
    const { error } = await supabase.rpc("request_my_account_deletion_v1", {
      p_user_note: null,
    });
    setToast(
      error
        ? "Die Löschanfrage konnte nicht vorgemerkt werden."
        : "Die Löschung ist mit Sicherheitsfrist vorgemerkt.",
    );
    await load();
    setBusy(false);
  }
  async function cancelDeletion() {
    setBusy(true);
    const { data, error } = await supabase.rpc("cancel_my_account_deletion_v1");
    setToast(
      !error && data === true
        ? "Die Löschanfrage ist storniert."
        : "Die Anfrage konnte nicht storniert werden.",
    );
    await load();
    setBusy(false);
  }
  return (
    <SettingsShell title="MEINE DATEN" kicker="DATENRECHTE">
      {loading ? (
        <div className="b-skeleton" style={{ height: 400, borderRadius: 22 }} />
      ) : error ? (
        <StateView
          title="Datenrechte nicht geladen"
          message="Versuch es gleich nochmals."
          actionLabel="Erneut versuchen"
          onAction={() => void load()}
        />
      ) : (
        <>
          <section className="b-settings-section">
            <h2 className="b-section-title">Datenexport</h2>
            <p className="b-muted">
              Erstellt eine maschinenlesbare Kopie deiner Profil-, Moment-,
              Decision- und Einwilligungsdaten.
            </p>
            <Button disabled={busy} onClick={() => void exportData()}>
              Datenkopie erstellen
            </Button>
          </section>
          <section
            className="b-surface"
            style={{ padding: 24 }}
            data-danger="true"
          >
            <p className="b-kicker" style={{ color: "var(--red)" }}>
              Vorsicht
            </p>
            <h2 className="b-section-title" style={{ marginTop: 8 }}>
              Konto und Daten löschen
            </h2>
            <p className="b-muted">
              Die Anfrage erhält eine 14-tägige Sicherheitsfrist. Ownership,
              Safety-Daten und öffentliche Inhalte werden kontrolliert
              behandelt.
            </p>
            {deletion ? (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => void cancelDeletion()}
              >
                Löschanfrage stornieren
              </Button>
            ) : (
              <Button
                variant="danger"
                disabled={busy}
                onClick={() => setConfirm(true)}
              >
                Löschung vormerken
              </Button>
            )}
          </section>
        </>
      )}
      <Dialog
        open={confirm}
        title="Konto wirklich löschen?"
        onClose={() => setConfirm(false)}
      >
        <p className="b-muted">
          Dein Konto wird nicht sofort gelöscht. Zuerst beginnt die bestehende
          14-tägige Sicherheitsfrist.
        </p>
        <div className="b-form-actions">
          <Button variant="secondary" onClick={() => setConfirm(false)}>
            Abbrechen
          </Button>
          <Button variant="danger" onClick={() => void requestDeletion()}>
            Verbindlich vormerken
          </Button>
        </div>
      </Dialog>
      {toast ? (
        <Toast message={toast} onDismiss={() => setToast(null)} />
      ) : null}
    </SettingsShell>
  );
}
