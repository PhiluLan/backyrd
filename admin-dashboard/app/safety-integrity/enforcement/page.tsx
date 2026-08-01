"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type EnforcementRow = {
  user_id: string;
  display_name: string;
  active_points: number;
  confirmed_violations: number;
  active_measure_id: string | null;
  active_measure_type: string | null;
  active_measure_status: string | null;
  active_measure_ends_at: string | null;
  trust_score: number | string;
  total_reports: number;
  actioned_reports: number;
  no_violation_reports: number;
  report_restricted_until: string | null;
  updated_at: string;
};

const measureLabels: Record<string, string> = {
  warning: "Verwarnung",
  write_suspension: "Schreibsperre",
  account_restricted: "Account eingeschränkt",
  account_review: "Account-Prüfung",
};

function formatDate(value: string | null) {
  if (!value) return "ohne Ablaufdatum";
  return new Intl.DateTimeFormat("de-CH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function SafetyEnforcementPage() {
  const [rows, setRows] = useState<EnforcementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [workingId, setWorkingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError("");

    const { data, error: loadError } = await supabase.rpc(
      "safety_admin_enforcement_queue_v1",
      { p_limit: 500 },
    );

    if (loadError) {
      setError(loadError.message);
    } else {
      setRows((data ?? []) as EnforcementRow[]);
    }

    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const summary = useMemo(() => {
    return {
      users: rows.length,
      suspended: rows.filter(
        (row) => row.active_measure_type === "write_suspension",
      ).length,
      accountReview: rows.filter(
        (row) => row.active_measure_type === "account_review",
      ).length,
      reportRestricted: rows.filter(
        (row) =>
          row.report_restricted_until &&
          new Date(row.report_restricted_until).getTime() > Date.now(),
      ).length,
    };
  }, [rows]);

  async function createMeasure(
    userId: string,
    measureType:
      | "warning"
      | "write_suspension"
      | "account_review"
      | "account_restricted",
    durationHours: number | null,
  ) {
    setWorkingId(userId);

    const { error: actionError } = await supabase.rpc(
      "safety_admin_set_account_measure_v1",
      {
        p_user_id: userId,
        p_measure_type: measureType,
        p_duration_hours: durationHours,
        p_reason_code: "ADMIN_MANUAL_ENFORCEMENT",
        p_public_explanation:
          measureType === "warning"
            ? "Dein Account wurde wegen eines Richtlinienverstoßes verwarnt."
            : measureType === "write_suspension"
              ? "Du kannst vorübergehend keine neuen Inhalte veröffentlichen."
              : measureType === "account_restricted"
                ? "Dein Account wurde gesperrt. Im Safety Center kannst du die Entscheidung ansehen und anfechten."
                : "Dein Account wird vom Safety-Team überprüft.",
        p_internal_note:
          "Manual action via Safety V4.5 Admin Console.",
      },
    );

    if (actionError) {
      setError(actionError.message);
    }

    setWorkingId(null);
    await load();
  }

  async function revokeMeasure(measureId: string, userId: string) {
    setWorkingId(userId);

    const { error: actionError } = await supabase.rpc(
      "safety_admin_revoke_account_measure_v1",
      {
        p_measure_id: measureId,
        p_note: "Revoked via Safety V4.5 Admin Console.",
      },
    );

    if (actionError) {
      setError(actionError.message);
    }

    setWorkingId(null);
    await load();
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 28,
        background: "#080809",
        color: "#f7f7f8",
      }}
    >
      <div
        style={{
          maxWidth: 1500,
          margin: "0 auto",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 20,
            marginBottom: 24,
          }}
        >
          <div>
            <div
              style={{
                color: "#ff5a92",
                fontSize: 13,
                fontWeight: 900,
                letterSpacing: "0.16em",
              }}
            >
              SAFETY V4.5 + V4.6
            </div>
            <h1
              style={{
                margin: "10px 0 8px",
                fontSize: 38,
                letterSpacing: "-0.04em",
              }}
            >
              Account Enforcement
            </h1>
            <p style={{ color: "#92929b", margin: 0 }}>
              Wiederholungstäter, Schreibsperren und Reporter-Missbrauch.
            </p>
          </div>

          <a
            href="/safety-integrity"
            style={{
              color: "#fff",
              textDecoration: "none",
              padding: "12px 16px",
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.04)",
              fontWeight: 800,
            }}
          >
            ← Safety-Fälle
          </a>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: 12,
            marginBottom: 22,
          }}
        >
          {[
            ["Erfasste Nutzer", summary.users],
            ["Aktive Schreibsperren", summary.suspended],
            ["Account-Prüfungen", summary.accountReview],
            ["Melde-Sperren", summary.reportRestricted],
          ].map(([label, value]) => (
            <div
              key={String(label)}
              style={{
                padding: 18,
                borderRadius: 18,
                background: "rgba(255,255,255,0.035)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div style={{ color: "#8f8f98", fontSize: 13 }}>
                {label}
              </div>
              <strong
                style={{
                  display: "block",
                  marginTop: 6,
                  fontSize: 28,
                }}
              >
                {value}
              </strong>
            </div>
          ))}
        </div>

        {error ? (
          <div
            style={{
              padding: 16,
              marginBottom: 16,
              color: "#ff8c8c",
              borderRadius: 14,
              background: "rgba(255,70,70,0.08)",
              border: "1px solid rgba(255,70,70,0.18)",
            }}
          >
            {error}
          </div>
        ) : null}

        <div
          style={{
            overflowX: "auto",
            borderRadius: 20,
            border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(255,255,255,0.02)",
          }}
        >
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              minWidth: 1180,
            }}
          >
            <thead>
              <tr style={{ textAlign: "left", color: "#9a9aa3" }}>
                {[
                  "Nutzer",
                  "Punkte",
                  "Verstöße",
                  "Aktive Maßnahme",
                  "Reporter Trust",
                  "Reports",
                  "Kein Verstoß",
                  "Aktionen",
                ].map((label) => (
                  <th
                    key={label}
                    style={{
                      padding: "15px 16px",
                      fontSize: 12,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      borderBottom:
                        "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {!loading &&
                rows.map((row) => {
                  const trust = Number(row.trust_score ?? 1);
                  const noViolationRatio =
                    row.total_reports > 0
                      ? row.no_violation_reports / row.total_reports
                      : 0;

                  return (
                    <tr
                      key={row.user_id}
                      style={{
                        borderBottom:
                          "1px solid rgba(255,255,255,0.06)",
                      }}
                    >
                      <td style={{ padding: 16 }}>
                        <strong>{row.display_name}</strong>
                        <div
                          style={{
                            marginTop: 4,
                            color: "#777780",
                            fontSize: 11,
                          }}
                        >
                          {row.user_id}
                        </div>
                      </td>

                      <td style={{ padding: 16 }}>
                        <strong
                          style={{
                            color:
                              row.active_points >= 8
                                ? "#ff7474"
                                : row.active_points >= 5
                                  ? "#ffb15c"
                                  : "#fff",
                          }}
                        >
                          {row.active_points}
                        </strong>
                      </td>

                      <td style={{ padding: 16 }}>
                        {row.confirmed_violations}
                      </td>

                      <td style={{ padding: 16 }}>
                        {row.active_measure_type ? (
                          <>
                            <strong>
                              {measureLabels[
                                row.active_measure_type
                              ] ?? row.active_measure_type}
                            </strong>
                            <div
                              style={{
                                marginTop: 4,
                                color: "#8d8d96",
                                fontSize: 12,
                              }}
                            >
                              {formatDate(
                                row.active_measure_ends_at,
                              )}
                            </div>
                          </>
                        ) : (
                          <span style={{ color: "#73737b" }}>
                            Keine
                          </span>
                        )}
                      </td>

                      <td style={{ padding: 16 }}>
                        <strong
                          style={{
                            color:
                              trust < 0.45
                                ? "#ff7474"
                                : trust < 0.7
                                  ? "#ffb15c"
                                  : "#7bd99f",
                          }}
                        >
                          {Math.round(trust * 100)} %
                        </strong>
                      </td>

                      <td style={{ padding: 16 }}>
                        {row.total_reports}
                        <div
                          style={{
                            marginTop: 3,
                            color: "#777780",
                            fontSize: 12,
                          }}
                        >
                          {row.actioned_reports} bestätigt
                        </div>
                      </td>

                      <td style={{ padding: 16 }}>
                        {row.no_violation_reports}
                        <div
                          style={{
                            marginTop: 3,
                            color: "#777780",
                            fontSize: 12,
                          }}
                        >
                          {Math.round(noViolationRatio * 100)} %
                        </div>
                      </td>

                      <td style={{ padding: 16 }}>
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: 7,
                          }}
                        >
                          <button
                            disabled={workingId === row.user_id}
                            onClick={() =>
                              void createMeasure(
                                row.user_id,
                                "warning",
                                null,
                              )
                            }
                          >
                            Verwarnen
                          </button>
                          <button
                            disabled={workingId === row.user_id}
                            onClick={() =>
                              void createMeasure(
                                row.user_id,
                                "write_suspension",
                                24,
                              )
                            }
                          >
                            24h sperren
                          </button>
                          <button
                            disabled={workingId === row.user_id}
                            onClick={() =>
                              void createMeasure(
                                row.user_id,
                                "write_suspension",
                                168,
                              )
                            }
                          >
                            7 Tage
                          </button>
                          <button
                            disabled={workingId === row.user_id}
                            onClick={() =>
                              void createMeasure(
                                row.user_id,
                                "account_review",
                                null,
                              )
                            }
                          >
                            Account prüfen
                          </button>
                          <button
                            disabled={workingId === row.user_id}
                            onClick={() => {
                              const confirmed = window.confirm(
                                "Diesen Account vollständig sperren? Der Nutzer kann danach nur noch das Safety Center und den Einspruchsprozess öffnen.",
                              );
                              if (!confirmed) return;
                              void createMeasure(
                                row.user_id,
                                "account_restricted",
                                null,
                              );
                            }}
                            style={{
                              borderColor: "rgba(255,75,75,0.36)",
                              background: "rgba(180,35,35,0.16)",
                              color: "#ff8b8b",
                            }}
                          >
                            Account sperren
                          </button>
                          <button
                            disabled={workingId === row.user_id}
                            onClick={() => {
                              const confirmed = window.confirm(
                                "Diesen Account vollständig sperren? Der Nutzer kann danach nur noch das Safety Center und den Einspruchsprozess öffnen.",
                              );
                              if (!confirmed) return;
                              void createMeasure(
                                row.user_id,
                                "account_restricted",
                                null,
                              );
                            }}
                            style={{
                              borderColor: "rgba(255,75,75,0.36)",
                              background: "rgba(180,35,35,0.16)",
                              color: "#ff8b8b",
                            }}
                          >
                            Account sperren
                          </button>

                          {row.active_measure_id ? (
                            <button
                              disabled={workingId === row.user_id}
                              onClick={() =>
                                void revokeMeasure(
                                  row.active_measure_id!,
                                  row.user_id,
                                )
                              }
                            >
                              Maßnahme aufheben
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>

          {loading ? (
            <div
              style={{
                minHeight: 260,
                display: "grid",
                placeItems: "center",
                color: "#92929b",
              }}
            >
              Enforcement-Daten werden geladen …
            </div>
          ) : null}

          {!loading && rows.length === 0 ? (
            <div
              style={{
                minHeight: 260,
                display: "grid",
                placeItems: "center",
                color: "#92929b",
              }}
            >
              Noch keine Enforcement- oder Reporter-Daten.
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
