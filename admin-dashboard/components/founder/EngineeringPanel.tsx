"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { founderDate } from "@/lib/founder";
import { supabase } from "@/lib/supabaseClient";
import type { FounderEngineering } from "@/types/founder";

export function EngineeringPanel({ compact = false }: { compact?: boolean }) {
  const [data, setData] = useState<FounderEngineering | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setError("Admin session unavailable");
      setLoading(false);
      return;
    }
    try {
      const response = await fetch("/api/admin/founder/engineering", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const body = (await response.json()) as FounderEngineering | { error: string };
      if (!response.ok || "error" in body) {
        throw new Error("error" in body ? body.error : "engineering_unavailable");
      }
      setData(body);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Engineering data unavailable");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    const interval = window.setInterval(() => void load(), 45_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [load]);

  return (
    <section className="fcc-panel fcc-engineering">
      <div className="fcc-panelHead">
        <div>
          <span className="fcc-overline">System · GitHub</span>
          <h2>Live Engineering</h2>
        </div>
        <Link href="/founder/engineering">Engineering →</Link>
      </div>

      {loading ? <div className="fcc-inlineState">Engineering state wird geladen …</div> : null}
      {error ? <div className="fcc-inlineError">{error === "github_not_configured" ? "GitHub server credential is not configured." : error}</div> : null}
      {data ? (
        <>
          <div className="fcc-engineeringMain">
            <div>
              <span>Main</span>
              <a href={data.main.url} target="_blank" rel="noreferrer">{data.main.shortSha}</a>
              <small>{data.main.message}</small>
            </div>
            <div>
              <span>Current area</span>
              <strong>{data.inferredArea}</strong>
              <small>Derived from recent merge and open branches</small>
            </div>
            <div>
              <span>Latest merge</span>
              {data.latestMerge ? (
                <>
                  <a href={data.latestMerge.url} target="_blank" rel="noreferrer">#{data.latestMerge.number}</a>
                  <small>{data.latestMerge.title} · {founderDate(data.latestMerge.mergedAt)}</small>
                </>
              ) : (
                <><strong>—</strong><small>No merged pull request found.</small></>
              )}
            </div>
            <div>
              <span>Open PRs</span>
              <strong>{data.openPullRequests.length}</strong>
              <small>Updated {founderDate(data.refreshedAt)}</small>
            </div>
          </div>

          {!compact || data.openPullRequests.length > 0 ? (
            <div className="fcc-prList">
              {data.openPullRequests.length === 0 ? (
                <div className="fcc-empty">No open pull requests.</div>
              ) : data.openPullRequests.slice(0, compact ? 4 : 20).map((pull) => (
                <a className="fcc-pr" href={pull.url} target="_blank" rel="noreferrer" key={pull.number}>
                  <span className="fcc-prNumber">#{pull.number}</span>
                  <div><strong>{pull.title}</strong><small>{pull.branch} · {founderDate(pull.updatedAt)}</small></div>
                  <span className={`fcc-ci ${pull.ciStatus}`}>CI {pull.ciStatus}</span>
                  <span className={`fcc-merge ${pull.mergeability}`}>{pull.mergeability}</span>
                </a>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
