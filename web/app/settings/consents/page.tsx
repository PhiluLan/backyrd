"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { SettingsShell } from "@/components/consumer/settings-shell";
import { StateView, Toast } from "@/components/consumer/ui";
import { supabase } from "@/lib/supabase/client";
type Row = {
  purpose_key: string;
  title_de: string;
  description_de: string;
  is_required: boolean;
  current_status: string;
  document_id: string | null;
};
const labels: Record<string, { title: string; description: string }> = {
  personalized_recommendations: {
    title: "Persönliche Vorschläge",
    description:
      "Vorhandene freigegebene Signale dürfen deine Vorschläge besser abstimmen.",
  },
  optional_product_analytics: {
    title: "Optionale Produktanalyse",
    description: "Hilft Backyrd, das Produkt gezielt zu verbessern.",
  },
  precise_location: {
    title: "Präziser Standort",
    description:
      "Zeigt Orte in deiner Nähe. Dein Browser fragt zusätzlich nach deiner Erlaubnis. Du kannst deine Stadt auch selbst eingeben.",
  },
  push_notifications: {
    title: "Push-Benachrichtigungen",
    description:
      "Erlaubt relevante Benachrichtigungen auf unterstützten Geräten.",
  },
  marketing_messages: {
    title: "Neuigkeiten von Backyrd",
    description: "Optionale Produktneuigkeiten und ausgewählte Updates.",
  },
  photo_ai_processing: {
    title: "Fotoanalyse",
    description:
      "Ausgewählte Fotos dürfen für unterstützte Funktionen analysiert werden.",
  },
  model_improvement: {
    title: "Produktverbesserung",
    description:
      "Freigegebene Daten dürfen im vorgesehenen Rahmen Backyrd verbessern.",
  },
};
export default function ConsentsPage() {
  const pending = useRef(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const { data, error: loadError } = await supabase.rpc("get_my_consent_state_v1", { p_locale: "de-CH" });
      if (loadError || !Array.isArray(data) || data.length === 0) throw loadError ?? new Error("consents_missing");
      setRows(data as Row[]);
    } catch { setError(true); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function toggle(row: Row) {
    if (row.is_required || pending.current) return;
    const granted = row.current_status !== "granted";
    pending.current = true; setSaving(row.purpose_key); setToast(null);
    try {
      const { data, error: saveError } = await supabase.rpc("set_my_consent_v1", {
        p_purpose_key: row.purpose_key, p_granted: granted, p_document_id: row.document_id,
        p_source: "web", p_app_version: "consumer-web", p_locale: "de-CH",
      });
      if (saveError) throw saveError;
      const saved = Array.isArray(data) ? data.find((item: Row & { status?: string }) => item.purpose_key === row.purpose_key) : null;
      const expected = granted ? "granted" : "withdrawn";
      if (!saved || saved.status !== expected) throw new Error("consent_not_confirmed");
      setRows((current) => current.map((item) => item.purpose_key === row.purpose_key ? { ...item, current_status: expected } : item));
      const title = labels[row.purpose_key]?.title ?? row.title_de;
      setToast(`${title}: ${granted ? "aktiviert" : "deaktiviert"} und gespeichert.`);
    } catch {
      setToast("Die Änderung konnte nicht bestätigt werden. Bitte lade die Einstellungen erneut und prüfe den gespeicherten Stand.");
    } finally { pending.current = false; setSaving(null); }
  }
  return (
    <SettingsShell
      title="EINWILLIGUNGEN"
      kicker="DEINE DATEN. DEINE KONTROLLE."
    >
      <p className="b-muted">
        Optionale Entscheidungen sind nie vorausgewählt. Erforderliche
        Rechtsgrundlagen bleiben klar gekennzeichnet.
      </p>
      {loading ? (
        <div
          className="b-skeleton"
          style={{ height: 420, borderRadius: 22, marginTop: 24 }}
        />
      ) : error ? (
        <StateView
          title="Einwilligungen nicht geladen"
          message="Versuch es gleich nochmals."
          actionLabel="Erneut versuchen"
          onAction={() => void load()}
        />
      ) : (
        <div style={{ marginTop: 24 }}>
          {rows.map((row) => {
            const text = labels[row.purpose_key] ?? {
              title: row.title_de,
              description: row.description_de,
            };
            return (
              <div className="b-setting-row" key={row.purpose_key}>
                <div>
                  <strong>{text.title}</strong>
                  <p
                    className="b-meta"
                    style={{ maxWidth: 560, margin: "5px 0 0" }}
                  >
                    {text.description}
                    {row.is_required ? " · Erforderlich" : ""}
                  </p>
                </div>
                <button
                  type="button"
                  className="b-switch"
                  role="switch"
                  aria-label={text.title}
                  aria-busy={saving === row.purpose_key}
                  aria-checked={
                    row.current_status === "granted"
                  }
                  disabled={row.is_required || saving !== null}
                  onClick={() => void toggle(row)}
                />
              </div>
            );
          })}
        </div>
      )}
      <p className="b-meta"><Link href="/settings/history">Meine Entscheidungen und Dokumente ansehen</Link></p>
      {toast ? (
        <Toast message={toast} onDismiss={() => setToast(null)} />
      ) : null}
    </SettingsShell>
  );
}
