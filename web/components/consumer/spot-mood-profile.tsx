"use client";
import Link from "next/link";
import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { rankMoodSupport, publicMoodCount, moodSupportFraction } from "../../../packages/shared/src/presentation/mood";
import type { PublicSpotDetailDTO } from "@/lib/public-spot-detail";
import { Dialog } from "./ui";
import styles from "./mood-experience.module.css";

export function SpotMoodProfile({ moods }: { moods: PublicSpotDetailDTO["top_moods"] }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ranked = rankMoodSupport(moods);
  if (!ranked.length) return <p className={styles.hint}>Noch keine Moods geteilt</p>;
  const strongestCount = publicMoodCount(ranked[0]);
  return <div className={styles.summary}>
    <h2 className={styles.summaryTitle}>Moods</h2>
    <p className={styles.summarySubtitle}>So wird dieser Ort beschrieben</p>
    <div className={styles.topMoods}>{ranked.slice(0, 3).map(mood => {
      const count = publicMoodCount(mood), fraction = moodSupportFraction(mood, strongestCount);
      return <div key={mood.concept_key}>
        <div className={styles.leadingLabel}><span className={styles.leadingMood}>{mood.label}</span>{count !== null ? <span className={styles.moodCount} aria-label={`${count} ${count === 1 ? "Person" : "Personen"}`}>{count}</span> : null}</div>
        {fraction !== null ? <div className={styles.supportTrack} aria-hidden="true"><div className={styles.supportFill} style={{ width: `${fraction * 100}%` }} /></div> : null}
      </div>;
    })}</div>
    {ranked.length > 3 ? <div className={styles.otherMoods}>{ranked.slice(3, 10).map(mood => <div key={mood.concept_key} className={styles.otherMood}><span>{mood.label}</span>{publicMoodCount(mood) !== null ? <span className={styles.moodCount} aria-label={`${publicMoodCount(mood)} ${publicMoodCount(mood) === 1 ? "Person" : "Personen"}`}>{publicMoodCount(mood)}</span> : null}</div>)}</div> : null}
    {ranked.some(mood => mood.evidence_state === "EARLY") ? <p className={`${styles.hint} ${styles.earlyEvidence}`}>Erste Eindrücke</p> : null}
    <button type="button" className={styles.allMoodsAction} onClick={() => setOpen(true)}><span>Alle Moods ansehen</span><span aria-hidden="true">→</span></button>
    {open ? createPortal(<Dialog open={open} title="Alle Moods" onClose={close}>
      <p className={styles.hint}>Die Zahlen zeigen, wie viele Gäste den Ort so beschrieben haben.</p>
      <div className={styles.moodDetails}>{ranked.map(mood => <Link key={mood.concept_key} className={styles.moodLink} href={`/places?mood=${encodeURIComponent(mood.label)}`}>
        <span>{mood.label}</span><span className={styles.hint}>{publicMoodCount(mood) === null ? "Erste Eindrücke" : `${publicMoodCount(mood)} ${publicMoodCount(mood) === 1 ? "Person" : "Personen"}`} ↗</span>
      </Link>)}</div>
    </Dialog>, document.body) : null}
  </div>;
}
