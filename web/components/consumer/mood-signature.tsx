import { reviewCountCopy } from "../../../packages/shared/src/presentation/mood";
import styles from "./mood-experience.module.css";

export function MoodSignature({ labels, compact = false, onRemove, reviewCount }: { labels: readonly string[]; compact?: boolean; reviewCount?: number | null; onRemove?: (label: string) => void }) {
  const visible = [...new Set(labels.filter(Boolean))].slice(0, 3);
  const countCopy = reviewCountCopy(reviewCount);
  if (!visible.length && !countCopy) return null;
  return <span className={`${styles.signature} ${compact ? styles.signatureCompact : ""}`}>
    {visible.length ? <span className={styles.wordmark}>MOODS</span> : null}
    <span className={styles.signatureWords}>{visible.map((label, index) => <span key={label} className={styles.signatureWord}>{index > 0 ? <span aria-hidden="true" className={styles.dot}>·</span> : null}{onRemove ? <button type="button" className={styles.removeMood} aria-label={`${label} entfernen`} onClick={() => onRemove(label)}>{label} ×</button> : label}</span>)}</span>
    {countCopy ? <span className={styles.hint}>{countCopy}</span> : null}
  </span>;
}
