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

  async function load() {
    setLoading(true);
    setError("");

    const [overviewResult, documentsResult] = await Promise.all([
      supabase.rpc("admin_privacy_overview_v1"),
      supabase.rpc("admin_list_legal_documents_v1"),
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

    setOverview(overviewResult.data as Overview);
    setDocuments((documentsResult.data ?? []) as DocumentRow[]);
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
