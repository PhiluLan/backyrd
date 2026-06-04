// admin-dashboard/app/claims/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type ClaimStatus = "pending" | "approved" | "rejected" | "revoked";

type ClaimQueueItem = {
  claim_id: number;
  claim_status: ClaimStatus;
  spot_id: string;
  spot_name: string;
  spot_city: string | null;
  spot_address: string | null;
  user_id: string;
  claimant_name: string | null;
  claimant_role: string | null;
  business_email: string | null;
  business_domain: string | null;
  email_verified_at: string | null;
  domain_match_score: string | number | null;
  domain_match_reason: string | null;
  note: string | null;
  submitted_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type DecisionModal =
  | {
      mode: "approve" | "reject" | "revoke";
      claim: ClaimQueueItem;
      reason: string;
    }
  | null;

const STATUS_LABELS: Record<ClaimStatus, string> = {
  pending: "In Prüfung",
  approved: "Genehmigt",
  rejected: "Abgelehnt",
  revoked: "Entzogen",
};

function statusBadgeClass(status: ClaimStatus) {
  if (status === "approved") return "by-badge by-badge-green";
  if (status === "rejected") return "by-badge by-badge-red";
  if (status === "revoked") return "by-badge by-badge-red";
  return "by-badge by-badge-yellow";
}

function formatDate(value: string | null) {
  if (!value) return "—";

  try {
    return new Date(value).toLocaleString("de-CH", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

function scoreLabel(value: string | number | null) {
  if (value === null || value === undefined) return "—";

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value);

  return `${Math.round(numeric * 100)}%`;
}

function errorMessage(err: any) {
  const raw =
    err?.message ||
    err?.details ||
    err?.hint ||
    err?.error_description ||
    String(err ?? "");

  if (raw.includes("not_authenticated")) return "Nicht eingeloggt.";
  if (raw.includes("admin_required")) return "Admin-Rechte erforderlich.";
  if (raw.includes("claim_not_found")) return "Claim wurde nicht gefunden.";
  if (raw.includes("business_email_not_verified")) {
    return "Die Business-Mail wurde noch nicht per Code bestätigt.";
  }
  if (raw.includes("invalid_decision")) return "Ungültige Entscheidung.";
  if (raw.includes("claim_not_approved")) {
    return "Nur genehmigte Betreiberzugänge können entzogen werden.";
  }

  return raw || "Etwas ist schiefgelaufen.";
}

export default function ClaimsPage() {
  const [claims, setClaims] = useState<ClaimQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingClaimId, setSavingClaimId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<ClaimStatus | "all">("pending");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [decisionModal, setDecisionModal] = useState<DecisionModal>(null);

  useEffect(() => {
    void loadClaims();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  async function loadClaims() {
    setLoading(true);
    setError(null);

    const { data, error } = await supabase.rpc("get_spot_claim_queue_v2", {
      p_status: statusFilter === "all" ? null : statusFilter,
      p_limit: 100,
    });

    if (error) {
      console.error("Fehler beim Laden der Claims:", error);
      setError(errorMessage(error));
      setClaims([]);
    } else {
      setClaims((data ?? []) as ClaimQueueItem[]);
    }

    setLoading(false);
  }

  async function sendApprovalEmail(claimId: number) {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) throw new Error("not_authenticated");

    const response = await fetch(
      "https://hjgcrrzfjchzqoegcywn.supabase.co/functions/v1/send-spot-claim-approved-email",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ claimId }),
      }
    );

    const payload = await response.json().catch(() => null);

    if (!response.ok || payload?.ok === false) {
      throw new Error(payload?.message || payload?.error || "approval_email_failed");
    }
  }

  async function confirmDecisionModal() {
    if (!decisionModal) return;

    const { claim, mode, reason } = decisionModal;

    try {
      setSavingClaimId(claim.claim_id);
      setError(null);
      setNotice(null);

      if (mode === "revoke") {
        const { data, error } = await supabase.rpc("revoke_spot_operator_access_v1", {
          p_claim_id: claim.claim_id,
          p_reason: reason || "Betreiberzugang durch Admin entzogen.",
        });

        if (error) throw error;

        const row = Array.isArray(data) ? data[0] : data;
        if (!row?.ok) throw new Error("Zugang konnte nicht entzogen werden.");

        setDecisionModal(null);
        setNotice("Betreiberzugang wurde entzogen.");
        await loadClaims();
        return;
      }

      const decision = mode === "approve" ? "approved" : "rejected";

      const { data, error } = await supabase.rpc("decide_spot_claim_v2", {
        p_claim_id: claim.claim_id,
        p_decision: decision,
        p_rejection_reason:
          mode === "reject"
            ? reason || "Business-Mail konnte nicht eindeutig geprüft werden."
            : null,
      });

      if (error) throw error;

      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.ok) throw new Error("Entscheidung konnte nicht gespeichert werden.");

      if (mode === "approve") {
        try {
          await sendApprovalEmail(claim.claim_id);
          setNotice("Claim wurde genehmigt und die Erfolgs-Mail wurde versendet.");
        } catch (mailErr) {
          console.warn("Approval gespeichert, aber Mail konnte nicht gesendet werden:", mailErr);
          setError(
            "Claim wurde genehmigt, aber die Erfolgs-Mail konnte nicht gesendet werden."
          );
        }
      }

      if (mode === "reject") {
        setNotice("Claim wurde abgelehnt.");
      }

      setDecisionModal(null);
      await loadClaims();
    } catch (err: any) {
      console.error("Claim decision error:", err);
      setError(errorMessage(err));
    } finally {
      setSavingClaimId(null);
    }
  }

  const filteredClaims = useMemo(() => {
    const q = search.trim().toLowerCase();

    if (!q) return claims;

    return claims.filter((claim) => {
      return (
        claim.spot_name.toLowerCase().includes(q) ||
        (claim.spot_city ?? "").toLowerCase().includes(q) ||
        (claim.spot_address ?? "").toLowerCase().includes(q) ||
        (claim.claimant_name ?? "").toLowerCase().includes(q) ||
        (claim.claimant_role ?? "").toLowerCase().includes(q) ||
        (claim.business_email ?? "").toLowerCase().includes(q) ||
        (claim.business_domain ?? "").toLowerCase().includes(q)
      );
    });
  }, [claims, search]);

  const counts = useMemo(() => {
    return {
      total: claims.length,
      pending: claims.filter((c) => c.claim_status === "pending").length,
      approved: claims.filter((c) => c.claim_status === "approved").length,
      rejected: claims.filter((c) => c.claim_status === "rejected").length,
      revoked: claims.filter((c) => c.claim_status === "revoked").length,
    };
  }, [claims]);

  return (
    <div className="by-page">
      <div className="by-header">
        <div>
          <h1 className="by-title">Spot Claims</h1>
          <div className="by-subtitle">
            Betreiber-Anfragen prüfen, genehmigen oder ablehnen.
          </div>
        </div>

        <div className="by-toolbar">
          <button
            type="button"
            onClick={() => void loadClaims()}
            className="by-btn by-btn-soft"
          >
            {loading ? "Lade…" : "Neu laden"}
          </button>
        </div>
      </div>

      <div className="by-card by-section">
        <div className="by-toolbar">
          <input
            type="text"
            placeholder="Suche nach Spot, Mail, Domain oder Name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="by-input"
            style={{ maxWidth: 420 }}
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ClaimStatus | "all")}
            className="by-select"
            style={{ maxWidth: 220 }}
          >
            <option value="pending">Nur in Prüfung</option>
            <option value="approved">Nur genehmigt</option>
            <option value="rejected">Nur abgelehnt</option>
            <option value="revoked">Nur entzogen</option>
            <option value="all">Alle Claims</option>
          </select>

          <div className="by-muted by-small" style={{ marginLeft: "auto" }}>
            {filteredClaims.length} Claims
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
            gap: 12,
            marginTop: 16,
          }}
        >
          <div className="card p-3">
            <div className="by-muted by-small">Geladen</div>
            <div style={{ fontSize: 24, fontWeight: 950 }}>{counts.total}</div>
          </div>
          <div className="card p-3">
            <div className="by-muted by-small">In Prüfung</div>
            <div style={{ fontSize: 24, fontWeight: 950 }}>{counts.pending}</div>
          </div>
          <div className="card p-3">
            <div className="by-muted by-small">Genehmigt</div>
            <div style={{ fontSize: 24, fontWeight: 950 }}>{counts.approved}</div>
          </div>
          <div className="card p-3">
            <div className="by-muted by-small">Abgelehnt</div>
            <div style={{ fontSize: 24, fontWeight: 950 }}>{counts.rejected}</div>
          </div>
          <div className="card p-3">
            <div className="by-muted by-small">Entzogen</div>
            <div style={{ fontSize: 24, fontWeight: 950 }}>{counts.revoked}</div>
          </div>
        </div>
      </div>

      {notice ? (
        <div className="by-card by-section" style={{ borderColor: "rgba(34,197,94,0.35)" }}>
          <div style={{ color: "#16a34a", fontWeight: 900 }}>Erfolg</div>
          <div className="by-muted by-small" style={{ marginTop: 6 }}>
            {notice}
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="by-card by-section" style={{ borderColor: "rgba(239,68,68,0.35)" }}>
          <div style={{ color: "#ef4444", fontWeight: 900 }}>Fehler</div>
          <div className="by-muted by-small" style={{ marginTop: 6 }}>
            {error}
          </div>
        </div>
      ) : null}

      <div className="by-card by-section">
        {loading ? (
          <div className="by-muted by-small">Lade Claims…</div>
        ) : filteredClaims.length === 0 ? (
          <div className="by-muted by-small">
            Keine Claims für diesen Filter gefunden.
          </div>
        ) : (
          <div className="by-tableWrap">
            <table className="by-table">
              <thead>
                <tr>
                  <th>Spot</th>
                  <th>Antragsteller</th>
                  <th>Business-Mail</th>
                  <th>Domain</th>
                  <th>Status</th>
                  <th>Eingereicht</th>
                  <th style={{ textAlign: "right" }}>Aktion</th>
                </tr>
              </thead>

              <tbody>
                {filteredClaims.map((claim) => {
                  const isSaving = savingClaimId === claim.claim_id;
                  const isPending = claim.claim_status === "pending";
                  const isApproved = claim.claim_status === "approved";

                  return (
                    <tr key={claim.claim_id}>
                      <td>
                        <div style={{ fontWeight: 950 }}>{claim.spot_name}</div>
                        <div className="by-muted by-small">
                          {claim.spot_city ?? "—"}
                          {claim.spot_address ? ` · ${claim.spot_address}` : ""}
                        </div>
                        <div style={{ marginTop: 6 }}>
                          <Link href={`/spots/${claim.spot_id}`} className="by-link">
                            Spot öffnen
                          </Link>
                        </div>
                      </td>

                      <td>
                        <div style={{ fontWeight: 850 }}>
                          {claim.claimant_name ?? "—"}
                        </div>
                        <div className="by-muted by-small">
                          {claim.claimant_role ?? "Keine Rolle angegeben"}
                        </div>
                        {claim.note ? (
                          <div
                            className="by-muted by-small"
                            style={{
                              marginTop: 6,
                              maxWidth: 260,
                              whiteSpace: "normal",
                              lineHeight: 1.4,
                            }}
                          >
                            „{claim.note}“
                          </div>
                        ) : null}
                      </td>

                      <td>
                        <div style={{ fontWeight: 850 }}>
                          {claim.business_email ?? "—"}
                        </div>
                        <div className="by-muted by-small">
                          Code bestätigt: {claim.email_verified_at ? "Ja" : "Nein"}
                        </div>
                      </td>

                      <td>
                        <div style={{ fontWeight: 850 }}>
                          {claim.business_domain ?? "—"}
                        </div>
                        <div className="by-muted by-small">
                          Match: {scoreLabel(claim.domain_match_score)}
                        </div>
                        <div className="by-muted by-small">
                          {claim.domain_match_reason ?? "—"}
                        </div>
                      </td>

                      <td>
                        <span className={statusBadgeClass(claim.claim_status)}>
                          {STATUS_LABELS[claim.claim_status]}
                        </span>
                      </td>

                      <td className="by-muted">
                        {formatDate(claim.submitted_at ?? claim.created_at)}
                      </td>

                      <td style={{ textAlign: "right" }}>
                        {isPending ? (
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "flex-end",
                              gap: 8,
                              flexWrap: "wrap",
                            }}
                          >
                            <button
                              type="button"
                              disabled={isSaving}
                              onClick={() =>
                                setDecisionModal({
                                  mode: "approve",
                                  claim,
                                  reason: "",
                                })
                              }
                              className="by-btn by-btn-blue"
                            >
                              {isSaving ? "Speichere…" : "Genehmigen"}
                            </button>

                            <button
                              type="button"
                              disabled={isSaving}
                              onClick={() =>
                                setDecisionModal({
                                  mode: "reject",
                                  claim,
                                  reason:
                                    "Business-Mail konnte nicht eindeutig geprüft werden.",
                                })
                              }
                              className="by-btn by-btn-soft"
                            >
                              Ablehnen
                            </button>
                          </div>
                        ) : isApproved ? (
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "flex-end",
                              gap: 8,
                              flexWrap: "wrap",
                            }}
                          >
                            <button
                              type="button"
                              disabled={isSaving}
                              onClick={() =>
                                setDecisionModal({
                                  mode: "revoke",
                                  claim,
                                  reason: "Betreiberzugang durch Admin entzogen.",
                                })
                              }
                              className="by-btn by-btn-soft"
                            >
                              {isSaving ? "Speichere…" : "Zugang entziehen"}
                            </button>
                          </div>
                        ) : (
                          <span className="by-muted by-small">
                            Keine Aktion nötig
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {decisionModal ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(0,0,0,0.45)",
            backdropFilter: "blur(14px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 540,
              borderRadius: 28,
              background: "rgba(255,255,255,0.96)",
              border: "1px solid rgba(0,0,0,0.08)",
              boxShadow: "0 30px 80px rgba(0,0,0,0.25)",
              padding: 24,
              color: "#111",
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 18,
                background:
                  decisionModal.mode === "approve"
                    ? "rgba(34,197,94,0.14)"
                    : "rgba(239,68,68,0.12)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 26,
                marginBottom: 16,
              }}
            >
              {decisionModal.mode === "approve"
                ? "✅"
                : decisionModal.mode === "revoke"
                ? "⛔️"
                : "↩️"}
            </div>

            <h2 style={{ fontSize: 24, fontWeight: 950, marginBottom: 8 }}>
              {decisionModal.mode === "approve"
                ? "Betreiberzugang genehmigen?"
                : decisionModal.mode === "revoke"
                ? "Betreiberzugang entziehen?"
                : "Claim ablehnen?"}
            </h2>

            <p
              style={{
                color: "rgba(0,0,0,0.62)",
                lineHeight: 1.55,
                marginBottom: 18,
              }}
            >
              {decisionModal.mode === "approve"
                ? `Der Spot „${decisionModal.claim.spot_name}“ wird dem Betreiber zugewiesen. Danach erhält der Betreiber eine Erfolgs-Mail mit den nächsten Schritten.`
                : decisionModal.mode === "revoke"
                ? `Der Betreiber verliert den Zugriff auf „${decisionModal.claim.spot_name}“. Das verifizierte Badge wird entfernt.`
                : `Der Claim für „${decisionModal.claim.spot_name}“ wird abgelehnt.`}
            </p>

            <div
              style={{
                borderRadius: 18,
                background: "rgba(0,0,0,0.04)",
                padding: 14,
                marginBottom: 18,
              }}
            >
              <div style={{ fontWeight: 900 }}>{decisionModal.claim.spot_name}</div>
              <div
                style={{
                  color: "rgba(0,0,0,0.58)",
                  fontSize: 13,
                  marginTop: 4,
                }}
              >
                {decisionModal.claim.business_email ?? "Keine Business-Mail"} · Match{" "}
                {scoreLabel(decisionModal.claim.domain_match_score)}
              </div>
              <div
                style={{
                  color: "rgba(0,0,0,0.48)",
                  fontSize: 13,
                  marginTop: 4,
                }}
              >
                {decisionModal.claim.claimant_name ?? "—"}
                {decisionModal.claim.claimant_role
                  ? ` · ${decisionModal.claim.claimant_role}`
                  : ""}
              </div>
            </div>

            {decisionModal.mode !== "approve" ? (
              <>
                <label
                  style={{
                    display: "block",
                    fontSize: 13,
                    fontWeight: 900,
                    marginBottom: 8,
                  }}
                >
                  Grund
                </label>
                <textarea
                  value={decisionModal.reason}
                  onChange={(e) =>
                    setDecisionModal({
                      ...decisionModal,
                      reason: e.target.value,
                    })
                  }
                  rows={4}
                  style={{
                    width: "100%",
                    borderRadius: 16,
                    border: "1px solid rgba(0,0,0,0.12)",
                    padding: 12,
                    resize: "vertical",
                    marginBottom: 18,
                    color: "#111",
                    background: "#fff",
                    outline: "none",
                  }}
                />
              </>
            ) : null}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                type="button"
                onClick={() => setDecisionModal(null)}
                className="by-btn by-btn-soft"
              >
                Abbrechen
              </button>

              <button
                type="button"
                onClick={() => void confirmDecisionModal()}
                disabled={savingClaimId === decisionModal.claim.claim_id}
                className={
                  decisionModal.mode === "approve"
                    ? "by-btn by-btn-blue"
                    : "by-btn by-btn-soft"
                }
              >
                {savingClaimId === decisionModal.claim.claim_id
                  ? "Speichere…"
                  : decisionModal.mode === "approve"
                  ? "Genehmigen"
                  : decisionModal.mode === "revoke"
                  ? "Zugang entziehen"
                  : "Ablehnen"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}