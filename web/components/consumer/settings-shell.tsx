import Link from "next/link";
import type { ReactNode } from "react";
const links = [
  ["/settings", "Übersicht"],
  ["/settings/profile", "Profil bearbeiten"],
  ["/settings/privacy", "Privatsphäre"],
  ["/settings/consents", "Einwilligungen"],
  ["/settings/data", "Meine Daten"],
  ["/settings/history", "Verlauf & Dokumente"],
  ["/settings/notifications", "Benachrichtigungen"],
  ["/settings/decision-history", "Für-jetzt-Verlauf"],
  ["/settings/safety", "Sicherheit"],
  ["/settings/support", "Support"],
] as const;
export function SettingsShell({
  title,
  kicker = "DEIN BACKYRD",
  children,
}: {
  title: string;
  kicker?: string;
  children: ReactNode;
}) {
  return (
    <div className="b-container b-main">
      <div className="b-settings-layout">
        <nav className="b-settings-nav" aria-label="Einstellungen">
          {links.map(([href, label]) => (
            <Link key={href} href={href}>
              {label}
            </Link>
          ))}
        </nav>
        <section aria-labelledby="settings-title">
          <p className="b-kicker">{kicker}</p>
          <h1 id="settings-title" className="b-display b-page-title" style={{ marginTop: 10 }}>
            {title}
          </h1>
          <div className="b-marker" />
          {children}
        </section>
      </div>
    </div>
  );
}
