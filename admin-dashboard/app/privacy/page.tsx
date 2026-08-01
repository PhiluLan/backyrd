"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type PurposeMetric = {
  purpose_key: string;
  title: string;
  requires_consent: boolean;
  is_required: boolean;
  default_enabled: boolean;
  granted_users: number;
  withdrawn_users: number;
  not_set_profiles: number;
};

type Overview = {
  profiles_total: number;
  documents_total: number;
  documents_draft: number;
  documents_published: number;
  documents_retired: number;
  acceptances_total: number;
  consent_events_total: number;
  pending_required_acceptances: number;
  purposes: PurposeMetric[];
};

type DocumentRow = {
  document_id: string;
  document_type: string;
  version: string;
  locale: string;
  title: string;
  status: string;
  requires_acceptance: boolean;
  requires_reacceptance: boolean;
  change_summary: string | null;
  published_at: string | null;
  effective_at: string | null;
  retired_at: string | null;
  created_at: string;
  updated_at: string;
};

type DocumentDetail = DocumentRow & {
  summary: string | null;
  content_markdown: string;
};


type DataRightsRow = {
  request_id: string;
  user_id: string;
  display_name: string | null;
  username: string | null;
  contact_email: string | null;
  request_type: "data_export" | "account_deletion";
  status: string;
  requested_at: string;
  scheduled_for: string | null;
  completed_at: string | null;
  export_expires_at: string | null;
  failure_code: string | null;
  user_note: string | null;
  admin_note: string | null;
  metadata: Record<string, unknown>;
  deletion_phase: string | null;
  deletion_started_at: string | null;
  deletion_finished_at: string | null;
  deletion_summary: Record<string, unknown>;
};

const TYPES = [
  "privacy_notice",
  "terms_of_service",
  "community_guidelines",
  "consent_information",
  "marketing_information",
  "location_information",
  "analytics_information",
  "media_ai_information",
];

function formatDate(value: string | null) {
  if (!value) return "–";
  return new Intl.DateTimeFormat("de-CH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function PrivacyAdminPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editor, setEditor] = useState<DocumentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [dataRights, setDataRights] = useState<DataRightsRow[]>([]);
  const [deletionPreview, setDeletionPreview] = useState<Record<
    string,
    any
  >>({});
  const [deletingRequestId, setDeletingRequestId] = useState<string | null>(
    null,
  );

  async function load() {
    setLoading(true);
    setError("");

    const [overviewResult, documentsResult, dataRightsResult] =
      await Promise.all([
        supabase.rpc("admin_privacy_overview_v1"),
        supabase.rpc("admin_list_legal_documents_v1"),
        supabase.rpc("admin_list_data_rights_requests_v1", {
          p_status: null,
          p_limit: 200,
        }),
      ]);

    if (overviewResult.error) {
      setError(overviewResult.error.message);
      setLoading(false);
      return;
    }

    if (documentsResult.error) {
      setError(documentsResult.error.message);
      setLoading(false);
      return;
    }

    if (dataRightsResult.error) {
      setError(dataRightsResult.error.message);
      setLoading(false);
      return;
    }

    setOverview(overviewResult.data as Overview);
    setDocuments((documentsResult.data ?? []) as DocumentRow[]);
    setDataRights((dataRightsResult.data ?? []) as DataRightsRow[]);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function selectDocument(id: string) {
    setSelectedId(id);
    setError("");

    const { data, error } = await supabase.rpc(
      "admin_get_legal_document_v1",
      { p_document_id: id },
    );

    if (error) {
      setError(error.message);
      return;
    }

    setEditor(((data ?? [])[0] ?? null) as DocumentDetail | null);
  }

  function newDraft() {
    setSelectedId(null);
    setEditor({
      document_id: "",
      document_type: "privacy_notice",
      version: "1.0",
      locale: "de-CH",
      title: "",
      summary: "",
      content_markdown: "",
      status: "draft",
      requires_acceptance: false,
      requires_reacceptance: false,
      change_summary: "",
      published_at: null,
      effective_at: null,
      retired_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  async function saveDraft() {
    if (!editor) return;

    setSaving(true);
    setError("");

    const { data, error } = await supabase.rpc(
      "admin_upsert_legal_document_draft_v1",
      {
        p_document_id: editor.document_id || null,
        p_document_type: editor.document_type,
        p_version: editor.version,
        p_locale: editor.locale,
        p_title: editor.title,
        p_summary: editor.summary || null,
        p_content_markdown: editor.content_markdown,
        p_requires_acceptance: editor.requires_acceptance,
        p_requires_reacceptance: editor.requires_reacceptance,
        p_change_summary: editor.change_summary || null,
      },
    );

    setSaving(false);

    if (error) {
      setError(error.message);
      return;
    }

    await load();
    await selectDocument(data as string);
  }

  async function publishDocument() {
    if (!editor?.document_id || editor.status !== "draft") return;

    setSaving(true);
    setError("");

    const preview = await supabase.rpc(
      "admin_preview_legal_publication_v1",
      { p_document_id: editor.document_id },
    );

    if (preview.error) {
      setSaving(false);
      setError(preview.error.message);
      return;
    }

    const details = (preview.data ?? [])[0];
    const affected = Number(details?.affected_user_count ?? 0);

    const confirmed = window.confirm(
      `Dokument ${editor.title} Version ${editor.version} veröffentlichen?\n\n` +
      `Betroffene Nutzer für eine verpflichtende Bestätigung: ${affected}\n\n` +
      `Veröffentlichte Dokumente sind inhaltlich unveränderlich.`,
    );

    if (!confirmed) {
      setSaving(false);
      return;
    }

    const published = await supabase.rpc(
      "admin_publish_legal_document_v1",
      {
        p_document_id: editor.document_id,
        p_effective_at: new Date().toISOString(),
      },
    );

    setSaving(false);

    if (published.error) {
      setError(published.error.message);
      return;
    }

    await load();
    await selectDocument(editor.document_id);
  }

  async function updateDataRightsRequest(
    requestId: string,
    status: string,
  ) {
    const note = window.prompt("Interne Notiz (optional):") ?? "";

    const { error } = await supabase.rpc(
      "admin_update_data_rights_request_v1",
      {
        p_request_id: requestId,
        p_status: status,
        p_admin_note: note || null,
      },
    );

    if (error) {
      setError(error.message);
      return;
    }

    await load();
  }

  async function previewDeletion(requestId: string) {
    setError("");

    const { data, error } = await supabase.rpc(
      "admin_preview_account_deletion_v1",
      { p_request_id: requestId },
    );

    if (error) {
      setError(error.message);
      return;
    }

    setDeletionPreview((current) => ({
      ...current,
      [requestId]: data,
    }));
  }

  async function executeDeletion(request: DataRightsRow) {
    const isAuthRecovery =
      request.status === "failed" &&
      request.deletion_phase === "auth_deletion" &&
      Boolean(request.deletion_started_at);

    if (!isAuthRecovery) {
      const preview = deletionPreview[request.request_id];

      if (!preview) {
        await previewDeletion(request.request_id);
        window.alert(
          "Preflight wurde geladen. Prüfe die Blocker und starte danach erneut.",
        );
        return;
      }

      if (preview.can_execute !== true) {
        const blockerValues = Object.values(
          preview.blockers ?? {},
        ).filter(Boolean);

        window.alert(
          blockerValues.length > 0
            ? `Löschung blockiert:\n${blockerValues.join("\n")}`
            : "Löschung blockiert. Der Preflight ist nicht ausführbar.",
        );
        return;
      }
    }

    const confirmation = window.prompt(
      isAuthRecovery
        ? "Die persönlichen Daten wurden bereits entfernt. " +
          "Jetzt wird ausschließlich das verbliebene Auth-Konto gelöscht.\n\n" +
          "Tippe DELETE, um den Recovery-Schritt auszuführen:"
        : "Diese Aktion löscht das Konto unwiderruflich.\n\n" +
          "Tippe DELETE, um fortzufahren:",
    );

    if (confirmation !== "DELETE") return;

    setDeletingRequestId(request.request_id);
    setError("");

    const { data, error } = await supabase.functions.invoke(
      "process-account-deletion",
      {
        body: {
          request_id: request.request_id,
          confirmation: "DELETE",
        },
      },
    );

    setDeletingRequestId(null);

    if (error) {
      let details = error.message;

      try {
        const context = (error as { context?: Response }).context;
        if (context) {
          const body = await context.clone().json();
          details =
            body?.details ??
            body?.error ??
            JSON.stringify(body);
        }
      } catch {
        // Keep the original Supabase client message.
      }

      setError(details);
      return;
    }

    if (!data?.ok) {
      setError(
        data?.details ??
          data?.error ??
          "Die Kontolöschung konnte nicht abgeschlossen werden.",
      );
      return;
    }

    window.alert(
      isAuthRecovery
        ? "Das verbliebene Auth-Konto wurde endgültig gelöscht."
        : "Das Testkonto wurde vollständig gelöscht.",
    );

    setDeletionPreview((current) => {
      const next = { ...current };
      delete next[request.request_id];
      return next;
    });

    await load();
  }


  const purposeRows = useMemo(
    () => overview?.purposes ?? [],
    [overview],
  );

  return (
    <div className="bi-page privacyAdmin">
      <header className="bi-header">
        <div>
          <div className="bi-eyebrow">Governance & compliance</div>
          <h1>Privacy & Legal</h1>
          <p>
            Einwilligungen, Dokumentversionen, Re-Consent und
            Veröffentlichungen zentral steuern.
          </p>
        </div>

        <button className="privacyPrimary" onClick={newDraft}>
          + Neuer Entwurf
        </button>
      </header>

      {error && <div className="bi-error">{error}</div>}
      {loading && <div className="bi-state">Privacy Center wird geladen …</div>}

      {overview && (
        <>
          <section className="privacyKpis">
            <Kpi label="Profile" value={overview.profiles_total} />
            <Kpi label="Entwürfe" value={overview.documents_draft} />
            <Kpi label="Veröffentlicht" value={overview.documents_published} />
            <Kpi
              label="Offene Bestätigungen"
              value={overview.pending_required_acceptances}
            />
          </section>

          <section className="bi-card privacySection">
            <div className="privacySectionHead">
              <div>
                <span>Consent health</span>
                <h2>Einwilligungen</h2>
              </div>
              <strong>{overview.consent_events_total} Audit-Events</strong>
            </div>

            <div className="privacyPurposeGrid">
              {purposeRows.map((purpose) => (
                <article key={purpose.purpose_key} className="privacyPurpose">
                  <div>
                    <span>{purpose.title}</span>
                    <small>{purpose.purpose_key}</small>
                  </div>
                  <dl>
                    <div>
                      <dt>Aktiv</dt>
                      <dd>{purpose.granted_users}</dd>
                    </div>
                    <div>
                      <dt>Widerrufen</dt>
                      <dd>{purpose.withdrawn_users}</dd>
                    </div>
                    <div>
                      <dt>Nicht gesetzt</dt>
                      <dd>{purpose.not_set_profiles}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          </section>

          <section className="privacyWorkspace">
            <div className="bi-card privacyDocuments">
              <div className="privacySectionHead">
                <div>
                  <span>Document registry</span>
                  <h2>Rechtsdokumente</h2>
                </div>
                <strong>{documents.length} Versionen</strong>
              </div>

              <div className="privacyDocumentList">
                {documents.map((document) => (
                  <button
                    key={document.document_id}
                    type="button"
                    className={
                      selectedId === document.document_id ? "active" : ""
                    }
                    onClick={() => void selectDocument(document.document_id)}
                  >
                    <div>
                      <strong>{document.title}</strong>
                      <span>
                        {document.document_type} · v{document.version}
                      </span>
                    </div>
                    <i className={`privacyStatus ${document.status}`}>
                      {document.status}
                    </i>
                  </button>
                ))}
              </div>
            </div>

            <div className="bi-card privacyEditor">
              {!editor ? (
                <div className="privacyEmpty">
                  <strong>Dokument auswählen</strong>
                  <span>
                    Entwurf öffnen oder eine neue Dokumentversion erstellen.
                  </span>
                </div>
              ) : (
                <>
                  <div className="privacySectionHead">
                    <div>
                      <span>
                        {editor.status === "draft"
                          ? "Editierbarer Entwurf"
                          : "Unveränderliche Version"}
                      </span>
                      <h2>{editor.title || "Neuer Entwurf"}</h2>
                    </div>
                    <i className={`privacyStatus ${editor.status}`}>
                      {editor.status}
                    </i>
                  </div>

                  <div className="privacyForm">
                    <label>
                      Dokumenttyp
                      <select
                        value={editor.document_type}
                        disabled={editor.status !== "draft"}
                        onChange={(event) =>
                          setEditor({
                            ...editor,
                            document_type: event.target.value,
                          })
                        }
                      >
                        {TYPES.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      Version
                      <input
                        value={editor.version}
                        disabled={editor.status !== "draft"}
                        onChange={(event) =>
                          setEditor({ ...editor, version: event.target.value })
                        }
                      />
                    </label>

                    <label>
                      Sprache
                      <input
                        value={editor.locale}
                        disabled={editor.status !== "draft"}
                        onChange={(event) =>
                          setEditor({ ...editor, locale: event.target.value })
                        }
                      />
                    </label>

                    <label className="wide">
                      Titel
                      <input
                        value={editor.title}
                        disabled={editor.status !== "draft"}
                        onChange={(event) =>
                          setEditor({ ...editor, title: event.target.value })
                        }
                      />
                    </label>

                    <label className="wide">
                      Zusammenfassung
                      <textarea
                        rows={3}
                        value={editor.summary ?? ""}
                        disabled={editor.status !== "draft"}
                        onChange={(event) =>
                          setEditor({ ...editor, summary: event.target.value })
                        }
                      />
                    </label>

                    <label className="wide">
                      Inhalt in Markdown
                      <textarea
                        rows={18}
                        value={editor.content_markdown}
                        disabled={editor.status !== "draft"}
                        onChange={(event) =>
                          setEditor({
                            ...editor,
                            content_markdown: event.target.value,
                          })
                        }
                      />
                    </label>

                    <label className="wide">
                      Änderungszusammenfassung
                      <input
                        value={editor.change_summary ?? ""}
                        disabled={editor.status !== "draft"}
                        onChange={(event) =>
                          setEditor({
                            ...editor,
                            change_summary: event.target.value,
                          })
                        }
                      />
                    </label>

                    <label className="privacyCheck">
                      <input
                        type="checkbox"
                        checked={editor.requires_acceptance}
                        disabled={editor.status !== "draft"}
                        onChange={(event) =>
                          setEditor({
                            ...editor,
                            requires_acceptance: event.target.checked,
                          })
                        }
                      />
                      Bestätigung erforderlich
                    </label>

                    <label className="privacyCheck">
                      <input
                        type="checkbox"
                        checked={editor.requires_reacceptance}
                        disabled={editor.status !== "draft"}
                        onChange={(event) =>
                          setEditor({
                            ...editor,
                            requires_reacceptance: event.target.checked,
                          })
                        }
                      />
                      Erneute Bestätigung erzwingen
                    </label>
                  </div>

                  <div className="privacyActions">
                    {editor.status === "draft" && (
                      <>
                        <button
                          className="privacySecondary"
                          disabled={saving}
                          onClick={() => void saveDraft()}
                        >
                          {saving ? "Speichert …" : "Entwurf speichern"}
                        </button>
                        <button
                          className="privacyPrimary"
                          disabled={saving || !editor.document_id}
                          onClick={() => void publishDocument()}
                        >
                          Veröffentlichung prüfen
                        </button>
                      </>
                    )}

                    {editor.status !== "draft" && (
                      <span className="privacyImmutable">
                        Veröffentlicht: {formatDate(editor.published_at)}
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          </section>

          <section className="bi-card privacySection">
            <div className="privacySectionHead">
              <div>
                <span>Data rights queue</span>
                <h2>Export- & Löschanfragen</h2>
              </div>
              <strong>{dataRights.length} Anfragen</strong>
            </div>

            {dataRights.length === 0 ? (
              <div className="privacyEmpty">
                <strong>Keine offenen Datenschutzanfragen</strong>
                <span>Neue Export- und Löschanfragen erscheinen hier.</span>
              </div>
            ) : (
              <div className="privacyRequestTable">
                {dataRights.map((request) => (
                  <article key={request.request_id} className="privacyRequest">
                    <div className="privacyRequestMain">
                      <strong>
                        {request.request_type === "data_export"
                          ? "Datenexport"
                          : "Kontolöschung"}
                      </strong>
                      <span>
                        {request.display_name ||
                          request.username ||
                          request.contact_email ||
                          request.user_id}
                      </span>
                      <small>
                        Angefordert: {formatDate(request.requested_at)}
                        {request.scheduled_for
                          ? ` · geplant: ${formatDate(request.scheduled_for)}`
                          : ""}
                      </small>
                    </div>

                    {request.status === "failed" &&
                      request.deletion_phase === "auth_deletion" &&
                      request.deletion_started_at && (
                        <div className="privacyPreflight">
                          <strong>Auth-Recovery bereit</strong>
                          <span>
                            Produktdaten und Profil wurden bereits entfernt.
                          </span>
                          <small>
                            Es wird nur noch das verbliebene Auth-Konto
                            gelöscht und die Anfrage abgeschlossen.
                          </small>
                        </div>
                      )}

                    {deletionPreview[request.request_id] && (
                      <div className="privacyPreflight">
                        <strong>
                          {deletionPreview[request.request_id].can_execute
                            ? "Bereit zur Löschung"
                            : "Löschung blockiert"}
                        </strong>
                        <span>
                          Eigene Spots:{" "}
                          {deletionPreview[request.request_id].owned_spots}
                          {" · "}
                          Erstellte Spots:{" "}
                          {deletionPreview[request.request_id].created_spots}
                        </span>
                        {Object.keys(
                          deletionPreview[request.request_id].blockers ?? {},
                        ).length > 0 && (
                          <small>
                            {Object.values(
                              deletionPreview[request.request_id].blockers,
                            ).join(" ")}
                          </small>
                        )}
                      </div>
                    )}

                    <i className={`privacyStatus ${request.status}`}>
                      {request.status}
                    </i>

                    <div className="privacyRequestActions">
                      {request.request_type === "account_deletion" &&
                        ["scheduled", "processing", "failed"].includes(
                          request.status,
                        ) && (
                          <>
                            <button
                              className="privacySecondary"
                              onClick={() =>
                                void previewDeletion(request.request_id)
                              }
                            >
                              Preflight prüfen
                            </button>

                            <button
                              className="privacyDanger"
                              disabled={
                                deletingRequestId === request.request_id
                              }
                              onClick={() =>
                                void executeDeletion(request)
                              }
                            >
                              {deletingRequestId === request.request_id
                                ? "Löscht …"
                                : request.status === "failed" &&
                                    request.deletion_phase ===
                                      "auth_deletion" &&
                                    request.deletion_started_at
                                  ? "Auth-Löschung abschließen"
                                  : "Konto endgültig löschen"}
                            </button>

                            <button
                              className="privacySecondary"
                              onClick={() =>
                                void updateDataRightsRequest(
                                  request.request_id,
                                  "rejected",
                                )
                              }
                            >
                              Ablehnen
                            </button>
                          </>
                        )}

                      {request.request_type === "data_export" &&
                        request.status === "processing" && (
                          <button
                            className="privacySecondary"
                            onClick={() =>
                              void updateDataRightsRequest(
                                request.request_id,
                                "completed",
                              )
                            }
                          >
                            Als erledigt markieren
                          </button>
                        )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <article className="bi-kpi">
      <span>{label}</span>
      <strong>{value.toLocaleString("de-CH")}</strong>
      <div />
    </article>
  );
}
