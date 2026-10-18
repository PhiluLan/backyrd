import Link from "next/link";
import { moodEvidenceCopy, moodIsProminent } from "../../../packages/shared/src/presentation/mood";
import type { PublicSpotDetailDTO } from "@/lib/public-spot-detail";
import styles from "./mood-experience.module.css";

export function SpotMoodProfile({ moods }: { moods: PublicSpotDetailDTO["top_moods"] }) {
  return <section className={styles.portrait} aria-label="Atmosphäre aus der Community">
    <h2 className="b-section-title">So fühlt es sich hier an</h2>
    <p className={styles.hint}>{moods.length ? "Von Gästen beschrieben. Jeder Besuch kann anders sein." : "Noch keine Eindrücke. Beschreibe nach deinem Besuch, wie sich der Ort angefühlt hat."}</p>
    {moods.length > 0 ? <>
      {moods[0].evidence_state === "EARLY" ? <p className={styles.hint}>Erste Eindrücke</p> : null}
      <div className={styles.chips}>{moods.map(mood => <Link key={mood.concept_key} className={`${styles.chip} ${moodIsProminent(mood) ? styles.active : ""}`} href={`/places?mood=${encodeURIComponent(mood.label)}`} aria-label={`Orte mit dem Mood ${mood.label} entdecken`}>{mood.label} ↗</Link>)}</div>
      <p className={styles.hint}>Tippe auf einen Mood und entdecke weitere Orte mit diesem Eindruck.</p>
      <details className={styles.evidence}><summary>Woher kommen die Eindrücke?</summary><p>Gäste beschreiben die Atmosphäre nach ihrem Besuch. Jede Person zählt ausgewogen mit, auch bei mehreren Besuchen. Die Begriffe beschreiben den Ort und sind keine Qualitätsnote.</p>{moods.map(mood => <p key={mood.concept_key}><strong>{mood.label}:</strong> {moodEvidenceCopy(mood)}</p>)}</details>
    </> : null}
  </section>;
}
