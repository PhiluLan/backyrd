"use client";
import Link from "next/link";
import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { moodEvidenceCopy } from "../../../packages/shared/src/presentation/mood";
import type { PublicSpotDetailDTO } from "@/lib/public-spot-detail";
import { MoodSignature } from "./mood-signature";
import { Dialog } from "./ui";
import styles from "./mood-experience.module.css";

export function SpotMoodProfile({ moods }: { moods: PublicSpotDetailDTO["top_moods"] }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  if (!moods.length) return <p className={styles.hint}>Noch keine Moods geteilt</p>;
  return <>
    <button type="button" className={styles.identityButton} onClick={() => setOpen(true)} aria-label={`Moods: ${moods.slice(0, 3).map(m => m.label).join(", ")}. Eindrücke ansehen`}>
      <MoodSignature labels={moods.map(m => m.label)} />
      <span className={styles.infoMark} aria-hidden="true">i</span>
    </button>
    {moods[0].evidence_state === "EARLY" ? <p className={styles.hint}>Erste Eindrücke</p> : null}
    {open ? createPortal(<Dialog open={open} title="Die Moods dieses Ortes" onClose={close}>
      <p className={styles.hint}>So haben Gäste den Ort erlebt. Welche Moods zu dir passen, entscheidest du.</p>
      <div className={styles.moodDetails}>{moods.map(mood => <div key={mood.concept_key}>
        <h3>{mood.label}</h3><p>{moodEvidenceCopy(mood)}</p>
        <Link className={styles.textButton} href={`/places?mood=${encodeURIComponent(mood.label)}`}>Orte mit diesem Mood entdecken ↗</Link>
      </div>)}</div>
    </Dialog>, document.body) : null}
  </>;
}
