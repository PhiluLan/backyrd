"use client";
import Link from "next/link";
import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { rankMoodSupport, publicMoodCount } from "../../../packages/shared/src/presentation/mood";
import type { PublicSpotDetailDTO } from "@/lib/public-spot-detail";
import { Dialog } from "./ui";
import styles from "./mood-experience.module.css";

export function SpotMoodProfile({ moods }: { moods: PublicSpotDetailDTO["top_moods"] }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ranked = rankMoodSupport(moods);
  if (!ranked.length) return <p className={styles.hint}>Noch keine Moods geteilt</p>;
  return <div className={styles.summary}>
    <p className={styles.summaryText}>{ranked.slice(0, 10).map((mood, index) => <span key={mood.concept_key}>{index ? " · " : ""}{mood.label}{publicMoodCount(mood) !== null ? ` (${publicMoodCount(mood)})` : ""}</span>)}</p>
    {ranked[0].evidence_state === "EARLY" ? <p className={styles.hint}>Erste Eindrücke</p> : null}
    <button type="button" className={styles.textButton} onClick={() => setOpen(true)}>Mehr anzeigen</button>
    {open ? createPortal(<Dialog open={open} title="Alle Moods" onClose={close}>
      <p className={styles.hint}>Die Zahlen zeigen, wie viele Gäste den Ort so beschrieben haben.</p>
      <div className={styles.moodDetails}>{ranked.map(mood => <Link key={mood.concept_key} className={styles.moodLink} href={`/places?mood=${encodeURIComponent(mood.label)}`}>
        <span>{mood.label}</span><span className={styles.hint}>{publicMoodCount(mood) === null ? "Erste Eindrücke" : `${publicMoodCount(mood)} ${publicMoodCount(mood) === 1 ? "Person" : "Personen"}`} ↗</span>
      </Link>)}</div>
    </Dialog>, document.body) : null}
  </div>;
}
