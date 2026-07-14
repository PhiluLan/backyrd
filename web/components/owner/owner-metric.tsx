export function OwnerMetric({ label, value, detail, accent = false }: { label: string; value: string | number; detail?: string; accent?: boolean }) {
  return (
    <div className={`owner-kpi-card ${accent ? "owner-kpi-card-accent" : ""}`}>
      <div className="owner-kpi-label">{label}</div>
      <div className="owner-kpi-value">{value}</div>
      {detail && <div className="owner-kpi-detail">{detail}</div>}
    </div>
  );
}
