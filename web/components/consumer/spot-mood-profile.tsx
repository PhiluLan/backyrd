"use client";

import { useState, type CSSProperties } from "react";
import type { PublicSpotDetailDTO } from "@/lib/public-spot-detail";
import { Dialog } from "./ui";

type SpotMood = PublicSpotDetailDTO["top_moods"][number];

function strengthWidth(percentage: number | null) {
  const value = Number(percentage);
  if (!Number.isFinite(value)) return 0;
  return Math.max(12, Math.min(100, value));
}

function communityCopy(mood: SpotMood) {
  if (mood.evidence_state === "EARLY") {
    return "Ein erster Eindruck aus der Community. Noch ist die Grundlage zu klein für eine Gewichtung.";
  }
  if (mood.rank <= 2) {
    return "Dieser Mood gehört zu den zwei prägendsten Community-Eindrücken für diesen Ort.";
  }
  return "Dieser Mood taucht in den Community-Eindrücken zu diesem Ort wiederkehrend auf.";
}

export function SpotMoodProfile({ moods }: { moods: SpotMood[] }) {
  const [showAll, setShowAll] = useState(false);
  const [selected, setSelected] = useState<SpotMood | null>(null);
  const early = moods[0]?.evidence_state === "EARLY";
  const visible = showAll ? moods : moods.slice(0, 5);

  return (
    <>
      {early ? <p className="b-muted b-mood-early">Erste Eindrücke</p> : null}
      <div className="b-mood-profile">
        {visible.map((mood) => {
          const established = mood.evidence_state === "ESTABLISHED";
          const prominent = established && mood.rank <= 2;
          return (
            <button
              aria-label={`${mood.label}${prominent ? ", besonders prägender Community-Eindruck" : ""}`}
              className="b-mood-pill"
              data-prominent={prominent}
              key={mood.concept_key}
              onClick={() => setSelected(mood)}
              style={
                established
                  ? ({ "--mood-strength": `${strengthWidth(mood.percentage)}%` } as CSSProperties)
                  : undefined
              }
              type="button"
            >
              <span>{mood.label}</span>
              {established ? <i aria-hidden="true" className="b-mood-strength" /> : null}
            </button>
          );
        })}
      </div>
      {moods.length > 5 ? (
        <button
          aria-expanded={showAll}
          className="b-mood-more"
          onClick={() => setShowAll((current) => !current)}
          type="button"
        >
          {showAll ? "Weniger anzeigen" : "Mehr anzeigen"}
          <span aria-hidden="true">{showAll ? "↑" : "↓"}</span>
        </button>
      ) : null}

      <Dialog open={Boolean(selected)} onClose={() => setSelected(null)} title={selected?.label ?? "Mood"}>
        {selected ? (
          <div className="b-mood-detail">
            <p className="b-kicker">Community-Eindruck</p>
            <p className="b-body">{communityCopy(selected)}</p>
            {selected.evidence_state === "ESTABLISHED" && typeof selected.concept_contributors === "number" ? (
              <div className="b-mood-evidence">
                <strong>{selected.concept_contributors}</strong>
                <span>
                  {selected.concept_contributors === 1
                    ? "Community-Stimme bildet die Grundlage."
                    : "Community-Stimmen bilden die Grundlage."}
                </span>
              </div>
            ) : null}
          </div>
        ) : null}
      </Dialog>
    </>
  );
}
