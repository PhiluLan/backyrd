"use client";
import Link from "next/link";
import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { moodEvidenceCopy, rankMoodSupport, publicMoodCount, moodSupportRatio, reviewCountCopy } from "../../../packages/shared/src/presentation/mood";
import type { PublicSpotDetailDTO } from "@/lib/public-spot-detail";
import { MoodSignature } from "./mood-signature";
import { Dialog } from "./ui";
import styles from "./mood-experience.module.css";

export function SpotMoodProfile({ moods, reviewCount }: { moods: PublicSpotDetailDTO["top_moods"]; reviewCount?: number | null }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ranked = rankMoodSupport(moods);
  const renderRow = (mood: typeof moods[number]) => {
    const count = publicMoodCount(mood), ratio = moodSupportRatio(mood);
    return <div key={mood.concept_key} className={styles.supportRow}>
      <div className={styles.supportLabel}><span>{mood.label}</span><span className={styles.hint}>{count === null ? "Erste Eindrücke" : `${count} ${count === 1 ? "Person" : "Personen"}`}</span></div>
      {ratio !== null ? <div aria-hidden="true" className={styles.track}><div className={styles.fill} style={{ width: `${ratio * 100}%` }} /></div> : null}
    </div>;
  };
  if (!ranked.length) return <><MoodSignature labels={[]} reviewCount={reviewCount} /><p className={styles.hint}>Noch keine Moods geteilt</p></>;
  return <>
    <button type="button" className={styles.identityButton} onClick={() => setOpen(true)} aria-label={`Moods: ${ranked.slice(0, 3).map(m => m.label).join(", ")}.${reviewCountCopy(reviewCount) ? ` ${reviewCountCopy(reviewCount)}.` : ""} Eindrücke ansehen`}>
      <MoodSignature labels={ranked.map(m => m.label)} reviewCount={reviewCount} />
      <span className={styles.infoMark} aria-hidden="true">i</span>
    </button>
    {ranked[0].evidence_state === "EARLY" ? <p className={styles.hint}>Erste Eindrücke</p> : null}
    <div className={styles.distribution}>
      <p className={styles.hint}>So haben Gäste den Ort erlebt</p>
      {ranked.slice(0, 3).map(renderRow)}
      <button type="button" className={styles.textButton} onClick={() => setOpen(true)}>Alle Moods ansehen →</button>
    </div>
    {open ? createPortal(<Dialog open={open} title="Die Moods dieses Ortes" onClose={close}>
      <p className={styles.hint}>So haben Gäste den Ort erlebt. Welche Moods zu dir passen, entscheidest du.</p>
      {reviewCountCopy(reviewCount) ? <p className={styles.hint}>{reviewCountCopy(reviewCount)}</p> : null}
      <p className={styles.hint}>Jede Person zählt pro Mood einmal. Mehrere Moods sind möglich. Die Balken zeigen den Anteil der Gäste mit Mood-Angaben.</p>
      <div className={styles.moodDetails}>{ranked.map(mood => <div key={mood.concept_key}>
        {renderRow(mood)}<p>{moodEvidenceCopy(mood)}</p>
        <Link className={styles.textButton} href={`/places?mood=${encodeURIComponent(mood.label)}`}>Orte mit diesem Mood entdecken ↗</Link>
      </div>)}</div>
    </Dialog>, document.body) : null}
  </>;
}
