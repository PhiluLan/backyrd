"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { EngineeringPanel } from "@/components/founder/EngineeringPanel";
import {
  categoryLabel,
  founderDate,
  founderGateTitle,
  founderGateWhy,
  founderNumber,
  founderOwner,
  gateStatusLabels,
  milestoneLabels,
  sourceLabels,
} from "@/lib/founder";
import { supabase } from "@/lib/supabaseClient";
import type { FounderOverview } from "@/types/founder";

export default function FounderControlCenterPage() {
  const [data, setData] = useState<FounderOverview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: result, error: rpcError } = await supabase.rpc("founder_launch_overview_v1");
      if (cancelled) return;
      if (rpcError) {
        console.error("Founder overview could not be loaded", rpcError);
        setError("Die Launch-Daten konnten gerade nicht geladen werden. Bitte versuche es erneut.");
      }
      else setData(result as FounderOverview);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) return <div className="fcc-page"><div className="fcc-loading">Founder Cockpit wird aufgebaut …</div></div>;
  if (error || !data) return <div className="fcc-page"><div className="fcc-error">{error || "Die Launch-Daten sind gerade nicht verfügbar."}</div></div>;

  const readiness = data.readiness;
  const isBlocked = readiness.launch_status === "BLOCKED";
  const criticalSentence = readiness.p0_remaining === 1
    ? "1 kritischer Punkt muss vor dem öffentlichen Basel-Launch noch erledigt werden."
    : `${readiness.p0_remaining} kritische Punkte müssen vor dem öffentlichen Basel-Launch noch erledigt werden.`;
  return (
    <div className="fcc-page">
      <header className="fcc-hero">
        <div className="fcc-heroCopy">
          <span className="fcc-wordmark">BACKYRD</span>
          <div className="fcc-launchLabel">Basel Launch</div>
          <h1>Founder<br />Cockpit</h1>
          <p>Der klare Überblick über Launchbereitschaft, aktuelle Blocker und nachgewiesenen Fortschritt.</p>
        </div>
        <div className={`fcc-readiness ${readiness.launch_status.toLowerCase()}`}>
          <span>Launchbereitschaft</span>
          <strong>{Math.round(readiness.readiness_percent)}<em>%</em></strong>
          <div className="fcc-readinessTrack"><i style={{ width: `${readiness.readiness_percent}%` }} /></div>
          <div className="fcc-launchVerdict">
            <small>Status</small>
            <b>{isBlocked ? "Öffentlicher Launch blockiert" : "Öffentlicher Launch freigegeben"}</b>
          </div>
          <p className="fcc-readinessInterpretation">
            {isBlocked ? `Wir machen Fortschritte, aber ${criticalSentence}` : "Alle kritischen Launch-Kriterien sind bestätigt. Der öffentliche Basel-Launch ist freigegeben."}
          </p>
          <div className="fcc-readinessMeta">
            <span><b>{readiness.p0_remaining}</b> kritische Punkte offen</span>
            <span>Aktualisiert {founderDate(data.last_updated)}</span>
          </div>
        </div>
      </header>

      <section className="fcc-kpis">
        <Kpi label="Aktive Nutzer diese Woche" value={founderNumber(data.kpis.wau)} source="automatic" interpretation={`${founderNumber(data.kpis.wau)} Nutzer waren diese Woche aktiv.`} />
        <Kpi label="Aktive Nutzer diesen Monat" value={founderNumber(data.kpis.mau)} source="automatic" interpretation={`${founderNumber(data.kpis.mau)} Nutzer waren diesen Monat aktiv.`} />
        <Kpi label="Entscheidungen diese Woche" value={founderNumber(data.kpis.decisions_week)} source="automatic" interpretation={`${founderNumber(data.kpis.decisions_week)} Entscheidungen wurden diese Woche gestartet.`} />
        <Kpi label="Launchbereite Basel-Spots" value={founderNumber(data.kpis.basel_launch_ready_spots)} source="automatic" interpretation={`${founderNumber(data.kpis.basel_launch_ready_spots)} Basel-Spots erfüllen aktuell die Launch-Anforderungen.`} />
        <Kpi label="Offene Trust-&-Safety-Fälle" value={founderNumber(data.kpis.open_trust_alerts)} source="automatic" interpretation={`${founderNumber(data.kpis.open_trust_alerts)} Fälle benötigen noch Aufmerksamkeit.`} danger={data.kpis.open_trust_alerts > 0} />
        <Kpi label="Temporär eingeschränkte Verteilung" value={founderNumber(data.trust_health.distribution.states.reduced + data.trust_health.distribution.states.quarantined)} source="automatic" interpretation={`${founderNumber(data.trust_health.distribution.states.reduced)} reduziert, ${founderNumber(data.trust_health.distribution.states.quarantined)} vorübergehend quarantänisiert.`} />
        <Kpi label="Distribution-Wiederherstellung" value={data.trust_health.distribution.overdue_evaluations === 0 && data.trust_health.distribution.expired_active_overrides === 0 && data.trust_health.distribution.admin_events_missing_actor === 0 ? "Gesund" : "Prüfung nötig"} source="system" interpretation={`${founderNumber(data.trust_health.distribution.restorations_24h)} automatische Wiederherstellungen in 24 Stunden; ${founderNumber(data.trust_health.distribution.overdue_evaluations)} überfällige Auswertungen; ${founderNumber(data.trust_health.distribution.admin_events_missing_actor)} Admin-Ereignisse ohne Akteur.`} danger={data.trust_health.distribution.overdue_evaluations > 0 || data.trust_health.distribution.expired_active_overrides > 0 || data.trust_health.distribution.failed_evaluations > 0 || data.trust_health.distribution.admin_events_missing_actor > 0} />
        <Kpi label="Empfehlungsqualität" value="Noch nicht genügend Daten" source="automatic" interpretation="Wir messen zuverlässig, sobald Empfehlungen mit echten Ergebnissen verbunden sind." subdued />
      </section>

      <section className="fcc-grid fcc-gridTop">
        <article className="fcc-panel">
          <div className="fcc-panelHead">
            <div><span className="fcc-overline">Launch-Fortschritt</span><h2>Bereitschaft nach Bereichen</h2></div>
            <Link href="/founder/launch-readiness">Launch-Übersicht öffnen →</Link>
          </div>
          <div className="fcc-categories">
            {readiness.categories.map((category) => (
              <div className="fcc-category" key={category.key}>
                <div><span>{categoryLabel(category.key, category.label)}</span><small>{category.weight}% Gewichtung</small><b>{Math.round(category.readiness)}%</b></div>
                <div><i style={{ width: `${category.readiness}%` }} /></div>
              </div>
            ))}
          </div>
        </article>

        <article className="fcc-panel fcc-blockerPanel">
          <div className="fcc-panelHead"><div><span className="fcc-overline">Heute entscheidend</span><h2>Öffentlicher Launch noch blockiert</h2><p className="fcc-panelIntro">Diese Punkte müssen vor dem öffentlichen Basel-Launch bestätigt sein.</p></div><b>{readiness.p0_remaining} kritisch</b></div>
          <div className="fcc-gateList">
            {data.blockers.map((gate) => (
              <Link href={`/founder/launch-readiness/${gate.key}`} className="fcc-gateRow" key={gate.key}>
                <span className="fcc-priority P0">Kritisch</span>
                <div><strong>{founderGateTitle(gate.key, gate.title)}</strong>{founderGateWhy(gate.key) ? <p>{founderGateWhy(gate.key)}</p> : null}<small>Verantwortlich: {founderOwner(gate.owner)} · Fehlender Nachweis: {gate.status === "verify" ? "abschliessende Bestätigung" : "Launch-Kriterium noch nicht erfüllt"}</small></div>
                <span className={`fcc-status ${gate.status}`}>{gateStatusLabels[gate.status]}</span>
              </Link>
            ))}
          </div>
        </article>
      </section>

      <EngineeringPanel compact />

      <section className="fcc-grid">
        <article className="fcc-panel">
          <div className="fcc-panelHead"><div><span className="fcc-overline">Manuell + System</span><h2>Weg zum Basel-Launch</h2></div></div>
          <div className="fcc-road">
            {data.milestones.map((milestone) => (
              <div className={`fcc-milestone ${milestone.status}`} key={milestone.id}>
                <i /><div><strong>{milestoneLabels[milestone.milestone_key] ?? milestone.title}</strong><small>{sourceLabels[milestone.source_type]} · {gateStatusLabels[milestone.status]}</small></div>
              </div>
            ))}
          </div>
        </article>
        <article className="fcc-panel">
          <div className="fcc-panelHead"><div><span className="fcc-overline">Geprüfte Nachweise</span><h2>Kürzlich bestätigt</h2></div></div>
          {data.recently_verified.map((gate) => (
            <Link href={`/founder/launch-readiness/${gate.key}`} className="fcc-verified" key={gate.key}>
              <span>✓</span><div><strong>{founderGateTitle(gate.key, gate.title)}</strong><small>{founderDate(gate.verification_date)}</small></div>
            </Link>
          ))}
          {data.recently_verified.length === 0 ? <div className="fcc-empty">Noch kein Launch-Kriterium wurde bestätigt.</div> : null}
        </article>
      </section>
    </div>
  );
}
function Kpi({ label, value, source, interpretation, danger = false, subdued = false }: {
  label: string;
  value: string;
  source: "automatic" | "system" | "manual";
  interpretation: string;
  danger?: boolean;
  subdued?: boolean;
}) {
  return <article className={`fcc-kpi ${danger ? "danger" : ""} ${subdued ? "subdued" : ""}`}><span>{label}</span><strong>{value}</strong><p>{interpretation}</p><small>{sourceLabels[source]}</small></article>;
}
