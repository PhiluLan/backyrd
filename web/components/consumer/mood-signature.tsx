import styles from "./mood-experience.module.css";

export function MoodSignature({ labels, compact = false, onRemove }: { labels: readonly string[]; compact?: boolean; onRemove?: (label: string) => void }) {
  const visible = [...new Set(labels.filter(Boolean))].slice(0, compact ? 2 : 3);
  if (!visible.length) return null;
  return <span className={`${styles.signature} ${compact ? styles.signatureCompact : ""}`}>
    <span className={styles.wordmark}>MOODS</span>
    <span className={styles.signatureWords}>{visible.map((label, index) => <span key={label} className={styles.signatureWord}>{index > 0 ? <span aria-hidden="true" className={styles.dot}>·</span> : null}{onRemove ? <button type="button" className={styles.removeMood} aria-label={`${label} entfernen`} onClick={() => onRemove(label)}>{label} ×</button> : label}</span>)}</span>
  </span>;
}
