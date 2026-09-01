"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Concept = { concept_key: string; canonical_label: string; cluster_key: string | null; active: boolean };
type Alias = { concept_key: string; normalized_expression: string };
type Candidate = { normalized_expression: string; sample_expression: string; usage_count: number; affected_spots: number };
type Usage = { concept_key: string; concept_contributors: number };
type InvalidExpression = { normalized_expression: string; raw_expression: string; invalid_reason: string | null; updated_at: string };
type InvalidCandidate = { normalized_expression: string; sample_expression: string; usage_count: number; invalid_reason: string | null; last_seen_at: string };

function summarizeInvalid(rows: InvalidExpression[]): InvalidCandidate[] {
  const grouped = new Map<string, InvalidCandidate>();
  for (const row of rows) {
    const current = grouped.get(row.normalized_expression);
    if (current) {
      current.usage_count += 1;
      if (row.updated_at > current.last_seen_at) current.last_seen_at = row.updated_at;
    } else {
      grouped.set(row.normalized_expression, {
        normalized_expression: row.normalized_expression,
        sample_expression: row.raw_expression,
        usage_count: 1,
        invalid_reason: row.invalid_reason,
        last_seen_at: row.updated_at,
      });
    }
  }
  return [...grouped.values()].sort((a, b) => b.usage_count - a.usage_count || b.last_seen_at.localeCompare(a.last_seen_at));
}

export default function MoodsPage() {
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [aliases, setAliases] = useState<Alias[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [invalidExpressions, setInvalidExpressions] = useState<InvalidExpression[]>([]);
  const [usage, setUsage] = useState<Usage[]>([]);
  const [search, setSearch] = useState("");
  const [target, setTarget] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [conceptResult, aliasResult, candidateResult, invalidResult, usageResult] = await Promise.all([
      supabase.from("backyrd_mood_concepts_v1").select("concept_key,canonical_label,cluster_key,active").order("canonical_label"),
      supabase.from("backyrd_mood_aliases_v1").select("concept_key,normalized_expression").eq("active", true),
      supabase.from("backyrd_mood_unresolved_candidates_v1").select("*").order("usage_count", { ascending: false }),
      supabase.from("backyrd_review_mood_expressions_v1").select("normalized_expression,raw_expression,invalid_reason,updated_at").eq("resolution_status", "INVALID").order("updated_at", { ascending: false }).limit(500),
      supabase.from("backyrd_spot_mood_profile_v1").select("concept_key,concept_contributors"),
    ]);
    const error = conceptResult.error ?? aliasResult.error ?? candidateResult.error ?? invalidResult.error ?? usageResult.error;
    if (error) setMessage(error.message);
    setConcepts((conceptResult.data ?? []) as Concept[]);
    setAliases((aliasResult.data ?? []) as Alias[]);
    setCandidates((candidateResult.data ?? []) as Candidate[]);
    setInvalidExpressions((invalidResult.data ?? []) as InvalidExpression[]);
    setUsage((usageResult.data ?? []) as Usage[]);
  }, []);

  // Initial client-side Admin read; subsequent refreshes are explicit actions.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);
  const filtered = useMemo(() => concepts.filter((concept) =>
    `${concept.canonical_label} ${concept.concept_key}`.toLowerCase().includes(search.toLowerCase())), [concepts, search]);
  const aliasCount = (key: string) => aliases.filter((alias) => alias.concept_key === key).length;
  const usageCount = (key: string) => usage.filter((row) => row.concept_key === key)
    .reduce((sum, row) => sum + row.concept_contributors, 0);
  const invalidCandidates = useMemo(() => summarizeInvalid(invalidExpressions), [invalidExpressions]);

  async function resolve(expression: string, action: "MAP_ALIAS" | "MARK_INVALID", targetKey?: string) {
    setBusy(true); setMessage(null);
    const { error } = await supabase.rpc("backyrd_admin_resolve_mood_candidate_v1", {
      p_expression: expression,
      p_action: action,
      p_concept_key: action === "MAP_ALIAS" ? targetKey : null,
      p_reason: action === "MAP_ALIAS" ? "Semantisch geprüfte Alias-Zuordnung" : "Kein gültiger Product Mood",
    });
    setBusy(false);
    if (error) setMessage(error.message);
    else { setMessage("Aktion gespeichert; betroffene Spot-Profile wurden neu aufgebaut."); await load(); }
  }

  return <div className="by-page">
    <div className="by-header"><div><h1 className="by-title">Mood Engine</h1><div className="by-subtitle">Community-Mood-Konzepte, Aliasse und offene Ausdrücke.</div></div><button className="by-btn by-btn-soft" onClick={() => void load()}>Neu laden</button></div>
    {message ? <div className="by-card by-section by-small">{message}</div> : null}
    <div className="by-card by-section"><input className="by-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Konzept suchen…" /></div>
    <div className="by-card by-section"><h2>Kanonische Konzepte</h2><div className="by-tableWrap"><table className="by-table"><thead><tr><th>Label</th><th>Cluster</th><th>Aliasse</th><th>Beiträge</th></tr></thead><tbody>{filtered.map((concept) => <tr key={concept.concept_key}><td><strong>{concept.canonical_label}</strong><div className="by-muted by-xs by-mono">{concept.concept_key}</div></td><td>{concept.cluster_key ?? "—"}</td><td>{aliasCount(concept.concept_key)}</td><td>{usageCount(concept.concept_key)}</td></tr>)}</tbody></table></div></div>
    <div className="by-card by-section"><h2>Offene Mood-Ausdrücke</h2>{candidates.length === 0 ? <p className="by-muted">Keine offenen Kandidaten.</p> : <div className="by-tableWrap"><table className="by-table"><thead><tr><th>Ausdruck</th><th>Status</th><th>Nutzung</th><th>Zuordnung</th><th>Aktion</th></tr></thead><tbody>{candidates.map((candidate) => <tr key={candidate.normalized_expression}><td><strong>{candidate.sample_expression}</strong><div className="by-muted by-xs">{candidate.affected_spots} Spots</div></td><td>Offen</td><td>{candidate.usage_count}</td><td><select className="by-input" value={target[candidate.normalized_expression] ?? ""} onChange={(event) => setTarget((current) => ({ ...current, [candidate.normalized_expression]: event.target.value }))}><option value="">Konzept wählen…</option>{concepts.filter((concept) => concept.active).map((concept) => <option key={concept.concept_key} value={concept.concept_key}>{concept.canonical_label}</option>)}</select></td><td><button className="by-btn by-btn-soft" disabled={busy || !target[candidate.normalized_expression]} onClick={() => void resolve(candidate.sample_expression, "MAP_ALIAS", target[candidate.normalized_expression])}>Als Alias</button> <button className="by-btn by-btn-soft" disabled={busy} onClick={() => void resolve(candidate.sample_expression, "MARK_INVALID")}>Ungültig</button></td></tr>)}</tbody></table></div>}</div>
    <div className="by-card by-section"><h2>Ungültige Mood-Ausdrücke</h2>{invalidCandidates.length === 0 ? <p className="by-muted">Keine ungültigen Ausdrücke.</p> : <div className="by-tableWrap"><table className="by-table"><thead><tr><th>Ausdruck</th><th>Status</th><th>Grund</th><th>Nutzung</th></tr></thead><tbody>{invalidCandidates.map((candidate) => <tr key={candidate.normalized_expression}><td><strong>{candidate.sample_expression}</strong></td><td>Ungültig</td><td>{candidate.invalid_reason ?? "Nicht als Product Mood zugelassen"}</td><td>{candidate.usage_count}</td></tr>)}</tbody></table></div>}</div>
  </div>;
}
