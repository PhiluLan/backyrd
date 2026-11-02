"use client";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { parsePendingLegalDocuments, safeAccountReturnPath, type PendingLegalDocument } from "@backyrd/shared";
import { AuthGate } from "@/components/consumer/auth-gate";
import { Button, StateView } from "@/components/consumer/ui";
import { supabase } from "@/lib/supabase/client";

type Document = PendingLegalDocument;
function LegalConsentForm() {
  const params = useSearchParams();
  const next = safeAccountReturnPath(params.get("next"), "/onboarding");
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data, error: loadError } = await supabase.rpc("get_my_pending_legal_documents_v1", { p_locale: "de-CH" });
      if (loadError || !Array.isArray(data)) throw loadError ?? new Error("documents_unavailable");
      const documents = parsePendingLegalDocuments(data);
      const gate = await supabase.rpc("get_my_legal_gate_status_v1", { p_locale: "de-CH" });
      const status = Array.isArray(gate.data) ? gate.data[0] : gate.data;
      if (gate.error || typeof status?.gate_required !== "boolean" || (documents.length === 0 && status.gate_required)) throw gate.error ?? new Error("legal_status_unavailable");
      setDocuments(documents);
    } catch { setError("Die Dokumente konnten nicht geladen werden. Bitte versuche es erneut."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function accept() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(null);
    try {
      for (const document of documents) {
        const { data, error: acceptError } = await supabase.rpc("accept_legal_document_v1", {
          p_document_id: document.document_id, p_source: "web", p_app_version: "consumer-web", p_locale: "de-CH",
        });
        if (acceptError || data !== true) throw acceptError ?? new Error("acceptance_not_confirmed");
      }
      const { data, error: gateError } = await supabase.rpc("get_my_legal_gate_status_v1", { p_locale: "de-CH" });
      const status = Array.isArray(data) ? data[0] : data;
      if (gateError || status?.gate_required !== false) throw gateError ?? new Error("gate_not_clear");
      window.location.replace(new URL(next, location.origin).pathname.replace(/\/+$/, "") === "/legal-consent" ? "/onboarding" : next);
    } catch { setError("Die Bestätigung konnte noch nicht vollständig gespeichert werden. Bitte versuche es erneut. Bereits bestätigte Dokumente bleiben gespeichert."); }
    finally { pending.current = false; setBusy(false); }
  }
  if (loading) return <StateView title="Dokumente werden geladen" message="Einen kurzen Moment." />;
  if (error && documents.length === 0) return <StateView title="Dokumente nicht geladen" message={error} actionLabel="Erneut versuchen" onAction={() => void load()} />;
  return <section className="b-narrow b-main">
    <p className="b-kicker">Dein Konto · wichtige Dokumente</p><h1 className="b-display b-page-title">Bevor du weitermachst.</h1>
    <p className="b-muted">Bitte lies und bestätige die aktuell erforderlichen Dokumente. Optionale Einwilligungen sind darin nicht eingeschlossen und bleiben deine eigene Entscheidung.</p>
    {documents.map((document) => <article className="b-surface" key={document.document_id} style={{ padding: 24, marginBottom: 18 }}>
      <h2>{document.title}</h2><p className="b-meta">Version {document.version}</p>
      {document.summary ? <p>{document.summary}</p> : null}
      <details><summary>Vollständiges Dokument lesen</summary><div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{document.content_markdown}</div></details>
    </article>)}
    {error ? <p role="alert" className="b-field-error">{error}</p> : null}
    <Button disabled={busy} onClick={() => void accept()}>{busy ? "Wird gespeichert …" : documents.length ? "Dokumente bestätigen und weiter" : "Alles bestätigt · Weiter"}</Button>
  </section>;
}
export default function LegalConsentPage() {
  return <AuthGate><Suspense fallback={<p role="status">Dokumente werden vorbereitet …</p>}><LegalConsentForm /></Suspense></AuthGate>;
}
