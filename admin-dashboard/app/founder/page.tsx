"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { EngineeringPanel } from "@/components/founder/EngineeringPanel";
import { founderDate, founderNumber } from "@/lib/founder";
import { supabase } from "@/lib/supabaseClient";
import type { FounderLiveProductOverview } from "@/types/founder";

const REFRESH_MS = 30_000;

export default function FounderControlCenterPage() {
  const [data, setData] = useState<FounderLiveProductOverview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [checkedAt, setCheckedAt] = useState(0);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setRefreshing(true);
    const { data: result, error: rpcError } = await supabase.rpc("founder_live_product_overview_v2");
    if (rpcError) {
      console.error("Founder live product overview could not be loaded", rpcError);
      setError("Der Live-Produktstand konnte gerade nicht geladen werden. Bestehende Werte werden nicht als aktuell ausgegeben.");
    } else if (!isLiveOverview(result)) {
      setError("Der Live-Produktstand hat einen unbekannten Vertrag und wird deshalb nicht angezeigt.");
    } else {
      setData(result);
      setError("");
    }
    setCheckedAt(Date.now());
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    let active = true;
    const run = () => { if (active && document.visibilityState === "visible") void load(true); };
    const initial = window.setTimeout(run, 0);
    const interval = window.setInterval(run, REFRESH_MS);
    document.addEventListener("visibilitychange", run);
    return () => {
      active = false;
      window.clearTimeout(initial);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", run);
    };
  }, [load]);

  const stale = data
    ? checkedAt - Date.parse(data.generatedAt) > data.freshForSeconds * 1_000
    : false;

  if (loading) return <div className="fcc-page"><div className="fcc-loading">Live-Produktstand wird sicher geladen …</div></div>;
  if (!data) return <div className="fcc-page"><div className="fcc-error">{error || "Der Live-Produktstand ist nicht verfügbar."}</div></div>;

  const isOn = data.product.effectiveState === "ON";
  const platform = data.trust.governance.platform_health;
  const lastDecision = data.activity.lastCurrentBindingSuccessAt ?? data.activity.lastSuccessfulDecisionAt;
  const criticalAttention = data.attention.filter((item) => item.severity === "CRITICAL").length;

  return (
    <div className="fcc-page fcc-livePage">
      <header className="fcc-liveHeader">
        <div>
          <span className="fcc-wordmark">BACKYRD · LIVE PRODUCT</span>
          <h1>Founder<br />Cockpit</h1>
          <p>Was im Produkt jetzt wirklich läuft – aus kanonischem Product-Control, versiegelten Decisions, World Knowledge, User Intelligence und Trust-Betrieb.</p>
        </div>
        <div className="fcc-liveHeaderActions">
          <span className={`fcc-liveFreshness ${stale ? "stale" : "fresh"}`}><i />{stale ? "Daten sind älter als erwartet" : "Live-Daten aktuell"}</span>
          <small>Stand {founderDate(data.generatedAt)} · automatisch alle 30 Sekunden</small>
          <button type="button" onClick={() => void load()} disabled={refreshing}>{refreshing ? "Aktualisiert …" : "Jetzt aktualisieren"}</button>
        </div>
      </header>

      {error ? <div className="fcc-inlineError fcc-liveLoadError">{error}</div> : null}

      <section className={`fcc-liveControl ${isOn ? "on" : "off"}`}>
        <div className="fcc-liveState">
          <span>Product-Control</span>
          <strong>{data.product.effectiveState}</strong>
          <p>{isOn ? "Decision vNext ist für die exakt gebundene Release-Identität freigeschaltet." : "Decision vNext ist fail-closed. Der Kill Switch ist wirksam."}</p>
        </div>
        <div className="fcc-liveRoute">
          <span>Einzige Product-Route</span>
          <strong>Decision vNext</strong>
          <p>Transport <b>{data.product.route}</b> · Generation {data.product.generation} · kein Legacy-Fallback</p>
        </div>
        <div className="fcc-liveBinding">
          <span>Gebundenes Artefakt</span>
          <code>{shortHash(data.product.artifactHash)}</code>
          <p>Release {shortHash(data.product.releaseHash)} · Source Set {shortHash(data.product.sourceSetHash)}</p>
          <small>{data.product.authorityExpiresAt ? `Authority bis ${founderDate(data.product.authorityExpiresAt)}` : "Keine aktive ON-Authority"}</small>
        </div>
      </section>

      <section className="fcc-liveMetrics" aria-label="Produkt heute">
        <LiveMetric label="Erfolgreiche Decisions · 24 h" value={founderNumber(data.activity.successfulDecisions24h)} detail="Exakt versiegelte Product-Antworten" tone="good" />
        <LiveMetric label="Aktive Decision-Nutzer · 24 h" value={founderNumber(data.activity.activeDecisionUsers24h)} detail="Eindeutige Nutzer mit versiegelter Product-Antwort" />
        <LiveMetric label="Nullergebnisse · 24 h" value={data.activity.zeroResultRate24h === null ? "—" : `${data.activity.zeroResultRate24h}%`} detail={`${founderNumber(data.activity.zeroResultDecisions24h)} erfolgreiche Antworten ohne Kandidaten`} tone={data.activity.zeroResultDecisions24h > 0 ? "warn" : "good"} />
        <LiveMetric label="Letzte gebundene Decision" value={lastDecision ? timeAgo(lastDecision, checkedAt || Date.parse(data.generatedAt)) : "Keine"} detail={lastDecision ? founderDate(lastDecision) : "Kein aktueller Erfolgsnachweis"} tone={lastDecision ? "good" : "bad"} />
        <LiveMetric label="Decision-Fehlerrate" value="Noch nicht messbar" detail="Wird bewusst nicht aus fehlenden Erfolgszeilen geschätzt" />
        <LiveMetric label="Founder-Aufmerksamkeit" value={founderNumber(criticalAttention)} detail={`${data.attention.length} Hinweise insgesamt`} tone={criticalAttention > 0 ? "bad" : "good"} />
      </section>

      <section className="fcc-liveSection">
        <div className="fcc-liveSectionHead"><div><span className="fcc-overline">01 · Produkt heute</span><h2>Decision vNext im echten Betrieb</h2></div><Link href="/user-intelligence">User Intelligence öffnen →</Link></div>
        <div className="fcc-liveCards">
          <LiveCard title="Product-Vertrag" status={data.product.singleRoute && !data.product.legacyFallback ? "Bestätigt" : "Prüfen"} good={data.product.singleRoute && !data.product.legacyFallback} rows={[
            ["Engine", "Decision vNext Product v1"],
            ["Route", data.product.route],
            ["Parallelroute", data.product.singleRoute ? "Keine" : "Ungeklärt"],
            ["Legacy-Fallback", data.product.legacyFallback ? "Aktiv" : "Verboten / nicht aktiv"],
          ]} />
          <LiveCard title="Nutzung & Personalisierung" status={`${founderNumber(data.activity.successfulDecisions24h)} Decisions · 24 h`} rows={[
            ["Personalisiert · 24 h", founderNumber(data.activity.personalizedDecisions24h)],
            ["Learning-Ereignisse · 24 h", founderNumber(data.users.learningEvents24h)],
            ["Learning-Ereignisse · 7 T", founderNumber(data.users.learningEvents7d)],
            ["Letztes Learning", data.users.lastLearningEventAt ? founderDate(data.users.lastLearningEventAt) : "Noch keines"],
          ]} />
          <LiveCard title="Nutzerbasis" status={`${founderNumber(data.users.registeredUsers)} Konten`} rows={[
            ["Aktiver Consent", founderNumber(data.users.consentedUsers)],
            ["Intelligence-Profil", founderNumber(data.users.usersWithIntelligenceProfile)],
            ["Decision-Nutzer · 24 h", founderNumber(data.activity.activeDecisionUsers24h)],
            ["Datenschutz", "Nur Aggregate, keine Identitäten"],
          ]} />
        </div>
      </section>

      <section className="fcc-liveSection">
        <div className="fcc-liveSectionHead"><div><span className="fcc-overline">02 · Qualität und Wissen</span><h2>World Knowledge im Product-Pfad</h2></div><Link href="/world-knowledge">World Knowledge öffnen →</Link></div>
        <div className="fcc-liveCoverage">
          <div className="fcc-liveCoverageDial" style={{ "--coverage": `${data.world.snapshotCoveragePercent}%` } as CSSProperties}>
            <strong>{data.world.snapshotCoveragePercent}%</strong><span>kanonische Snapshots</span>
          </div>
          <div className="fcc-liveCoverageStats">
            <LiveFact label="Freigegebene Spots" value={founderNumber(data.world.approvedSpots)} />
            <LiveFact label="Davon Basel" value={founderNumber(data.world.approvedBaselSpots)} />
            <LiveFact label="Mit Claims" value={founderNumber(data.world.spotsWithClaims)} />
            <LiveFact label="Mit Snapshot" value={founderNumber(data.world.spotsWithCanonicalSnapshot)} />
            <LiveFact label="Ohne Snapshot" value={founderNumber(data.world.spotsWithoutCanonicalSnapshot)} warning={data.world.spotsWithoutCanonicalSnapshot > 0} />
            <LiveFact label="Offene Wissenskonflikte" value={founderNumber(data.world.openReviewItems)} warning={data.world.openReviewItems > 0} />
          </div>
          <div className="fcc-liveWorldState">
            <span>Admin-Authoring</span>
            <strong>{data.world.adminAuthoringActive ? "Verfügbar" : "Nicht verfügbar"}</strong>
            <p>Letzter kanonischer Rebuild: {data.world.lastCanonicalRebuildAt ? founderDate(data.world.lastCanonicalRebuildAt) : "noch nicht belegt"}</p>
            <p>{data.world.failedRebuilds > 0 ? `${founderNumber(data.world.failedRebuilds)} fehlgeschlagene Rebuilds benötigen Prüfung.` : "Keine fehlgeschlagenen Rebuilds."}</p>
          </div>
        </div>
      </section>

      <section className="fcc-liveSection">
        <div className="fcc-liveSectionHead"><div><span className="fcc-overline">03 · Betrieb und Sicherheit</span><h2>Was jetzt Aufmerksamkeit braucht</h2></div><strong className={platform.status === "healthy" ? "good" : "warning"}>{platform.status === "healthy" ? "Betrieb gesund" : "Prüfung nötig"}</strong></div>
        <div className="fcc-liveOps">
          <div className="fcc-attentionList">
            {data.attention.map((item) => <article key={item.code} className={`fcc-attention ${item.severity.toLowerCase()}`}><span>{attentionIcon(item.severity)}</span><div><strong>{item.title}</strong><p>{item.detail}</p></div></article>)}
          </div>
          <div className="fcc-liveOpsFacts">
            <LiveFact label="Offene Incidents" value={founderNumber(platform.open_incidents)} warning={platform.open_incidents > 0} />
            <LiveFact label="Kritische Incidents" value={founderNumber(platform.critical_incidents)} warning={platform.critical_incidents > 0} />
            <LiveFact label="Überfällige Eskalationen" value={founderNumber(platform.overdue_escalations)} warning={platform.overdue_escalations > 0} />
            <LiveFact label="Aktives Break Glass" value={founderNumber(data.trust.governance.break_glass.active_count)} warning={data.trust.governance.break_glass.active_count > 0} />
            <LiveFact label="Trust-Fälle in Prüfung" value={founderNumber(data.trust.needs_human_review)} warning={data.trust.needs_human_review > 0} />
          </div>
        </div>
      </section>

      <section className="fcc-liveSection">
        <div className="fcc-liveSectionHead"><div><span className="fcc-overline">04 · Aktuelle Arbeit</span><h2>Repository und laufende Änderungen</h2></div></div>
        <EngineeringPanel compact />
      </section>

      <aside className="fcc-liveArchive">
        <div><span className="fcc-overline">Archiv</span><strong>Historische Basel-Launchbereitschaft</strong><p>{data.history.explanation}</p></div>
        <Link href={data.history.path}>Launch-Archiv öffnen →</Link>
      </aside>
    </div>
  );
}

function isLiveOverview(value: unknown): value is FounderLiveProductOverview {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return row.contractVersion === "backyrd.founder-live-product-overview@2.0"
    && typeof row.generatedAt === "string" && !!row.product && !!row.activity && !!row.world && !!row.users;
}

function LiveMetric({ label, value, detail, tone = "neutral" }: { label: string; value: string; detail: string; tone?: "good" | "warn" | "bad" | "neutral" }) {
  return <article className={`fcc-liveMetric ${tone}`}><span>{label}</span><strong>{value}</strong><p>{detail}</p></article>;
}

function LiveCard({ title, status, rows, good = true }: { title: string; status: string; rows: Array<[string, string]>; good?: boolean }) {
  return <article className="fcc-liveCard"><header><h3>{title}</h3><span className={good ? "good" : "warning"}>{status}</span></header><dl>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></article>;
}

function LiveFact({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) {
  return <div className={`fcc-liveFact ${warning ? "warning" : ""}`}><span>{label}</span><strong>{value}</strong></div>;
}

function shortHash(value: string | null): string {
  return value ? `${value.slice(0, 10)}…${value.slice(-6)}` : "nicht gebunden";
}

function timeAgo(value: string, referenceTime: number): string {
  const minutes = Math.max(0, Math.floor((referenceTime - Date.parse(value)) / 60_000));
  if (minutes < 1) return "Gerade eben";
  if (minutes < 60) return `vor ${minutes} Min.`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  return `vor ${Math.floor(hours / 24)} T.`;
}

function attentionIcon(severity: FounderLiveProductOverview["attention"][number]["severity"]): string {
  if (severity === "CRITICAL") return "!";
  if (severity === "WARNING") return "·";
  return "i";
}
