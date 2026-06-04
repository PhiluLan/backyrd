"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type ProfileRow = {
  id: string;
  display_name: string | null;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  city: string | null;
  country: string | null;
  is_admin: boolean | null;
  created_at: string | null;
};

type ClaimRow = {
  id: number | string; // bigint → kann je nach client als number oder string kommen
  spot_id: string;
  user_id: string;
  status: "pending" | "approved" | "rejected" | string;
  proof: string | null;
  note: string | null;
  created_at: string | null;
  updated_at: string | null;
};

function safeClaimId(v: number | string): number {
  if (typeof v === "number") return v;
  const n = Number(v);
  if (Number.isFinite(n)) return n;
  // fallback (sollte bei sequence bigint praktisch nie passieren)
  return 0;
}

export default function SpotOwnerPage() {
  const params = useParams<{ id: string }>();
  const spotId = params?.id as string;

  const [spotName, setSpotName] = useState<string>("");
  const [currentOwnerId, setCurrentOwnerId] = useState<string | null>(null);

  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [claims, setClaims] = useState<ClaimRow[]>([]);

  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [loadingClaims, setLoadingClaims] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!spotId) return;
    setMsg(null);
    void boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spotId]);

  async function boot() {
    await loadSpot();
    await Promise.all([loadProfiles(""), loadClaims()]);
  }

  async function loadSpot() {
    const { data, error } = await supabase
      .from("spots")
      .select("name, owner_id")
      .eq("id", spotId)
      .single();

    if (error) {
      console.error("loadSpot error:", error);
      setMsg(error.message);
      return;
    }

    setSpotName(data?.name ?? "");
    setCurrentOwnerId(data?.owner_id ?? null);
  }

  async function loadProfiles(q: string) {
    setLoadingProfiles(true);
    setMsg(null);

    const { data, error } = await supabase.rpc("admin_list_profiles_v1", {
      p_query: q,
      p_limit: 500,
    });

    if (error) {
      console.error("admin_list_profiles_v1 error:", {
        message: error.message,
        code: (error as any).code,
        details: (error as any).details,
        hint: (error as any).hint,
      });
      setProfiles([]);
      setMsg(error.message);
      setLoadingProfiles(false);
      return;
    }

    setProfiles((data ?? []) as ProfileRow[]);
    setLoadingProfiles(false);
  }

  async function loadClaims() {
    if (!spotId) return;
    setLoadingClaims(true);
    setMsg(null);

    const { data, error } = await supabase
      .from("spot_claims")
      .select("id, spot_id, user_id, status, proof, note, created_at, updated_at")
      .eq("spot_id", spotId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("loadClaims error:", error);
      setClaims([]);
      setMsg(error.message);
      setLoadingClaims(false);
      return;
    }

    setClaims((data ?? []) as ClaimRow[]);
    setLoadingClaims(false);
  }

  const filteredProfiles = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return profiles;

    return profiles.filter((p) => {
      const hay = [
        p.first_name,
        p.last_name,
        p.display_name,
        p.username,
        p.city,
        p.country,
        p.id,
        p.is_admin ? "admin" : "",
        `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim(),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return hay.includes(q);
    });
  }, [profiles, search]);

  async function setOwnerManual(userId: string | null) {
    setSaving(true);
    setMsg(null);

    const { error } = userId
      ? await supabase.rpc("admin_set_spot_owner_v1", {
          p_spot_id: spotId,
          p_owner_id: userId,
        })
      : await supabase.rpc("admin_clear_spot_owner_v1", {
          p_spot_id: spotId,
        });

    if (error) {
      console.error("setOwnerManual error:", error);
      setMsg(error.message);
      setSaving(false);
      return;
    }

    await loadSpot();
    setMsg("Owner aktualisiert.");
    setSaving(false);
  }

  async function approveClaim(claimId: number | string) {
    setSaving(true);
    setMsg(null);

    const { error } = await supabase.rpc("admin_approve_spot_claim_v1", {
      p_claim_id: safeClaimId(claimId),
      p_reject_others: true,
    });

    if (error) {
      console.error("approveClaim error:", error);
      setMsg(error.message);
      setSaving(false);
      return;
    }

    await Promise.all([loadSpot(), loadClaims()]);
    setMsg("Claim approved. Owner gesetzt.");
    setSaving(false);
  }

  async function rejectClaim(claimId: number | string) {
    setSaving(true);
    setMsg(null);

    const { error } = await supabase.rpc("admin_reject_spot_claim_v1", {
      p_claim_id: safeClaimId(claimId),
    });

    if (error) {
      console.error("rejectClaim error:", error);
      setMsg(error.message);
      setSaving(false);
      return;
    }

    await loadClaims();
    setMsg("Claim rejected.");
    setSaving(false);
  }

  const currentOwner = useMemo(() => {
    if (!currentOwnerId) return null;
    return profiles.find((p) => p.id === currentOwnerId) ?? null;
  }, [currentOwnerId, profiles]);

  const ownerDisplay = useMemo(() => {
    if (!currentOwnerId) return "—";
    const p = currentOwner;
    if (!p) return currentOwnerId;

    const full = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
    const primary =
      full || p.display_name || (p.username ? `@${p.username}` : p.id);

    return primary;
  }, [currentOwner, currentOwnerId]);

  const pendingClaims = useMemo(
    () => claims.filter((c) => c.status === "pending"),
    [claims]
  );

  function renderUserMini(userId: string) {
    const p = profiles.find((x) => x.id === userId) ?? null;
    if (!p) {
      return (
        <div className="by-userRow">
          <div className="by-avatar" />
          <div className="by-stack" style={{ gap: 6 }}>
            <div style={{ fontWeight: 900 }}>{userId}</div>
            <div className="by-muted by-small by-mono">{userId}</div>
          </div>
        </div>
      );
    }

    const full = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
    const primary =
      full || p.display_name || (p.username ? `@${p.username}` : p.id);

    const secondary =
      p.username && primary !== `@${p.username}` ? `@${p.username}` : p.display_name;

    return (
      <div className="by-userRow">
        {p.avatar_url ? (
          <img src={p.avatar_url} alt="" className="by-avatar" />
        ) : (
          <div className="by-avatar" />
        )}

        <div style={{ lineHeight: 1.2 }}>
          <div style={{ fontWeight: 1000 }}>
            {primary}{" "}
            {p.is_admin ? <span className="by-badge">admin</span> : null}
          </div>
          <div className="by-muted by-small">
            {secondary ? secondary : "—"}
          </div>
          <div className="by-muted by-small">
            {(p.city ?? "—") + (p.country ? `, ${p.country}` : "")}
          </div>
          <div className="by-muted by-xs by-mono">{p.id}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="by-page">
      <div className="by-row">
        <div>
          <h1 className="by-title">Owner / Claims</h1>
          <div className="by-subtitle by-muted">
            Spot: <span style={{ color: "white" }}>{spotName || spotId}</span>
          </div>
        </div>

        <Link href={`/spots/${spotId}`} className="by-link">
          Zurück
        </Link>
      </div>

      {msg ? (
        <div className="by-panel by-section">
          <div className="by-muted by-small">{msg}</div>
        </div>
      ) : null}

      {/* Current Owner */}
      <div className="by-card by-section">
        <div className="by-row" style={{ alignItems: "flex-start" }}>
          <div className="by-stack">
            <div style={{ fontWeight: 1000 }}>Aktueller Owner</div>

            {currentOwnerId ? (
              <div className="by-userRow">
                {currentOwner?.avatar_url ? (
                  <img src={currentOwner.avatar_url} alt="" className="by-avatar" />
                ) : (
                  <div className="by-avatar" />
                )}

                <div style={{ lineHeight: 1.2 }}>
                  <div style={{ fontWeight: 1000 }}>
                    {ownerDisplay}{" "}
                    {currentOwner?.is_admin ? <span className="by-badge">admin</span> : null}
                  </div>
                  <div className="by-muted by-small">
                    {(currentOwner?.city ?? "—") +
                      (currentOwner?.country ? `, ${currentOwner.country}` : "")}
                  </div>
                  <div className="by-muted by-xs by-mono">{currentOwnerId}</div>
                </div>
              </div>
            ) : (
              <div className="by-muted by-small">—</div>
            )}
          </div>

          <button
            className="by-btn by-btn-blue"
            disabled={saving || !currentOwnerId}
            onClick={() => void setOwnerManual(null)}
          >
            Owner entfernen
          </button>
        </div>
      </div>

      {/* Pending Claims */}
      <div className="by-card by-section">
        <div className="by-row">
          <div className="by-stack" style={{ gap: 6 }}>
            <div style={{ fontWeight: 1000 }}>Pending Claims</div>
            <div className="by-muted by-small">
              Approve setzt den Owner & rejected alle anderen Claims (für diesen Spot).
            </div>
          </div>

          <button
            className="by-btn by-btn-soft"
            disabled={loadingClaims || saving}
            onClick={() => void loadClaims()}
          >
            {loadingClaims ? "Lade…" : "Reload Claims"}
          </button>
        </div>

        <div style={{ height: 12 }} />

        {pendingClaims.length === 0 ? (
          <div className="by-muted by-small">Keine pending Claims.</div>
        ) : (
          <div className="by-list">
            {pendingClaims.map((c) => (
              <div key={String(c.id)} className="by-listItem">
                <div className="by-row" style={{ alignItems: "flex-start" }}>
                  <div className="by-stack" style={{ gap: 10, flex: 1 }}>
                    {renderUserMini(c.user_id)}

                    <div className="by-actions">
                      <span className="by-badge by-badge-yellow">pending</span>
                      {c.created_at ? (
                        <span className="by-badge">
                          {new Date(c.created_at).toLocaleString("de-CH")}
                        </span>
                      ) : null}
                      <span className="by-badge by-mono">claim #{String(c.id)}</span>
                    </div>

                    {c.proof ? (
                      <div className="by-panel" style={{ padding: 12 }}>
                        <div className="by-muted by-xs" style={{ marginBottom: 6 }}>
                          Proof
                        </div>
                        <div style={{ fontWeight: 800 }}>{c.proof}</div>
                      </div>
                    ) : null}

                    {c.note ? (
                      <div className="by-panel" style={{ padding: 12 }}>
                        <div className="by-muted by-xs" style={{ marginBottom: 6 }}>
                          Note
                        </div>
                        <div style={{ fontWeight: 800, whiteSpace: "pre-wrap" }}>
                          {c.note}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="by-actions">
                    <button
                      className="by-btn by-btn-accent"
                      disabled={saving}
                      onClick={() => void approveClaim(c.id)}
                      title="Approve (setzt Owner, rejected andere Claims)"
                    >
                      Approve
                    </button>
                    <button
                      className="by-btn by-btn-soft"
                      disabled={saving}
                      onClick={() => void rejectClaim(c.id)}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Manual Override */}
      <div className="by-card by-section">
        <div className="by-stack" style={{ gap: 6 }}>
          <div style={{ fontWeight: 1000 }}>Manual Override</div>
          <div className="by-muted by-small">
            Owner direkt setzen (Admin). Normalerweise: Claims approve.
          </div>
        </div>

        <div style={{ height: 12 }} />

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Suche User (Name, Username, Stadt, UUID)…"
          className="by-input"
        />

        <div style={{ height: 12 }} />

        <div className="by-row">
          <button
            className="by-btn by-btn-blue"
            onClick={() => void loadProfiles(search)}
            disabled={loadingProfiles || saving}
          >
            {loadingProfiles ? "Lade…" : "Neu laden"}
          </button>

          <div className="by-muted by-small">
            {saving ? "Speichere…" : ""}
          </div>
        </div>

        <div style={{ height: 12 }} />

        <div className="by-list">
          {filteredProfiles.length === 0 ? (
            <div className="by-listItem">
              <div className="by-muted by-small">Keine User gefunden.</div>
            </div>
          ) : (
            filteredProfiles.map((p) => {
              const rowFullName = [p.first_name, p.last_name]
                .filter(Boolean)
                .join(" ")
                .trim();

              const primary =
                rowFullName ||
                p.display_name ||
                (p.username ? `@${p.username}` : p.id);

              return (
                <button
                  key={p.id}
                  onClick={() => void setOwnerManual(p.id)}
                  disabled={saving}
                  className="by-listItem"
                  style={{
                    width: "100%",
                    textAlign: "left",
                    cursor: saving ? "not-allowed" : "pointer",
                  }}
                >
                  <div className="by-userRow">
                    {p.avatar_url ? (
                      <img src={p.avatar_url} alt="" className="by-avatar by-avatar-sm" />
                    ) : (
                      <div className="by-avatar by-avatar-sm" />
                    )}

                    <div style={{ lineHeight: 1.2 }}>
                      <div style={{ fontWeight: 1000 }}>
                        {primary}
                        {p.id === currentOwnerId ? " ✅" : ""}
                        {p.is_admin ? <span className="by-badge" style={{ marginLeft: 8 }}>admin</span> : null}
                      </div>

                      <div className="by-muted by-small">
                        {p.username ? `@${p.username}` : "—"}
                      </div>

                      <div className="by-muted by-small">
                        {(p.city ?? "—") + (p.country ? `, ${p.country}` : "")}
                      </div>

                      <div className="by-muted by-xs by-mono">{p.id}</div>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
