import { moodCountCopy } from "../../../packages/shared/src/presentation/mood";
import styles from "./mood-experience.module.css";

export function MoodSignature({ labels, compact = false, onRemove, moodCount }: { labels: readonly string[]; compact?: boolean; moodCount?: number | null; onRemove?: (label: string) => void }) {
  const visible = [...new Set(labels.filter(Boolean))].slice(0, 3);
  const countCopy = moodCountCopy(moodCount);
  if (!visible.length && !countCopy) return null;
  return <span className={`${styles.signature} ${compact ? styles.signatureCompact : ""}`}>
    {countCopy ? <span className={styles.total}>{countCopy}</span> : null}
    {visible.map((label, index) => <span key={label} className={styles.signatureWord}>{countCopy || index > 0 ? <span aria-hidden="true" className={styles.dot}>·</span> : null}{onRemove ? <button type="button" className={styles.removeMood} aria-label={`${label} entfernen`} onClick={() => onRemove(label)}>{label} ×</button> : label}</span>)}
  </span>;
}
