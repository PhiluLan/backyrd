"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type UserRow = {
  user_id: string;
  display_name: string | null;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  city: string | null;
  country: string | null;
  created_at: string;
  owned_spots_count: number;
  reviews_count: number;
  taste_concepts_count: number;
  taste_updated_at: string | null;
};

function displayName(u: UserRow) {
  const full = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
  return u.display_name ?? (full ? full : null) ?? (u.username ? `@${u.username}` : null) ?? "—";
}

export default function UsersPage() {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from("admin_user_overview_v1")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      setError(error.message);
      setRows([]);
    } else {
      setRows((data ?? []) as UserRow[]);
    }

    setLoading(false);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;

    return rows.filter((u) => {
      const hay = [
        u.display_name,
        u.username,
        u.first_name,
        u.last_name,
        u.city,
        u.country,
        u.user_id,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return hay.includes(q);
    });
  }, [rows, search]);

  return (
    <div className="by-page">
      <div className="by-header">
        <div>
          <h1 className="by-title">Users</h1>
          <div className="by-subtitle">Übersicht: Spots (Owner), Reviews, Taste-Profil.</div>
        </div>

        <div className="by-toolbar">
          <Link href="/users/invite" className="by-btn by-btn-blue">
            + Invite User
          </Link>

          <button className="by-btn by-btn-soft" onClick={() => void load()} disabled={loading}>
            {loading ? "Lade…" : "Neu laden"}
          </button>
        </div>
      </div>

      <div className="by-card by-section">
        <div className="by-toolbar">
          <input
            type="text"
            placeholder="Suche nach Name, Username, Stadt, UUID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="by-input"
            style={{ maxWidth: 520 }}
          />

          <div className="by-muted by-small" style={{ marginLeft: "auto" }}>
            {filtered.length} Users
          </div>
        </div>
      </div>

      {error ? (
        <div className="by-alert by-alertError">{error}</div>
      ) : null}

      <div className="by-card by-section">
        {loading ? (
          <div className="by-muted by-small">Lade Users…</div>
        ) : filtered.length === 0 ? (
          <div className="by-muted by-small">Keine Users gefunden.</div>
        ) : (
          <div className="by-tableWrap">
            <table className="by-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Ort</th>
                  <th>Owner Spots</th>
                  <th>Reviews</th>
                  <th>Taste</th>
                  <th>Created</th>
                  <th style={{ textAlign: "right" }}>Aktion</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.user_id}>
                    <td>
                      <div className="by-userCell">
                        {u.avatar_url ? (
                          <img src={u.avatar_url} alt="" className="by-avatar by-avatar-sm" />
                        ) : (
                          <div className="by-avatar by-avatar-sm" />
                        )}

                        <div>
                          <div style={{ fontWeight: 1000 }}>{displayName(u)}</div>
                          <div className="by-muted by-xs">
                            {u.username ? `@${u.username}` : u.user_id}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="by-muted">
                      {(u.city ?? "—") + (u.country ? `, ${u.country}` : "")}
                    </td>

                    <td>{u.owned_spots_count ?? 0}</td>
                    <td>{u.reviews_count ?? 0}</td>

                    <td>
                      {u.taste_concepts_count ?? 0}
                      {u.taste_updated_at ? (
                        <div className="by-muted by-xs">
                          updated {new Date(u.taste_updated_at).toLocaleDateString("de-CH")}
                        </div>
                      ) : null}
                    </td>

                    <td className="by-muted">
                      {new Date(u.created_at).toLocaleDateString("de-CH")}
                    </td>

                    <td style={{ textAlign: "right" }}>
                      <Link href={`/users/${u.user_id}`} className="by-link">
                        Details
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
