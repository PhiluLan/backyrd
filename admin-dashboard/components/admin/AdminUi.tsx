import Link from "next/link";
import type { ReactNode } from "react";

export function AdminPageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="admin-pageHeader">
      <div>
        {eyebrow ? <div className="admin-eyebrow">{eyebrow}</div> : null}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions ? <div className="admin-pageActions">{actions}</div> : null}
    </header>
  );
}

export function FilterBar({ children, resultLabel }: { children: ReactNode; resultLabel?: string }) {
  return (
    <section className="admin-filterBar" aria-label="Filter">
      <div className="admin-filterControls">{children}</div>
      {resultLabel ? <span className="admin-resultCount">{resultLabel}</span> : null}
    </section>
  );
}

export function StatusBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "success" | "warning" | "danger" | "info" | "neutral";
}) {
  return <span className={`admin-statusBadge ${tone}`}>{children}</span>;
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="admin-emptyState">
      <span aria-hidden="true">◎</span>
      <strong>{title}</strong>
      <p>{description}</p>
      {action ? <Link href={action.href}>{action.label}</Link> : null}
    </div>
  );
}

export function LoadingState({ label = "Daten werden geladen …" }: { label?: string }) {
  return (
    <div className="admin-loadingState" role="status">
      <i aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="admin-errorState" role="alert">
      <div>
        <strong>Da ist etwas schiefgelaufen.</strong>
        <span>{message}</span>
      </div>
      {onRetry ? <button type="button" onClick={onRetry}>Erneut versuchen</button> : null}
    </div>
  );
}

export function SectionCard({
  title,
  description,
  status,
  children,
  id,
}: {
  title: string;
  description?: string;
  status?: "complete" | "unknown" | "review";
  children: ReactNode;
  id?: string;
}) {
  const statusLabel = status === "complete" ? "Fertig" : status === "review" ? "Prüfen" : "Noch unklar";
  return (
    <section className="admin-sectionCard" id={id}>
      <header>
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {status ? <StatusBadge tone={status === "complete" ? "success" : status === "review" ? "warning" : "neutral"}>{statusLabel}</StatusBadge> : null}
      </header>
      {children}
    </section>
  );
}
