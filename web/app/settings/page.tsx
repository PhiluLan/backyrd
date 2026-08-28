import Link from "next/link";
import { SettingsShell } from "@/components/consumer/settings-shell";
import { AccountActions } from "@/components/consumer/account-actions";
const items = [
  ["/settings/profile", "Profil", "Name, Bio, Stadt und Links"],
  ["/settings/privacy", "Sichtbarkeit", "Öffentlichkeit deines Profils"],
  [
    "/settings/consents",
    "Datenschutz & Einwilligungen",
    "Optionale Verarbeitungen verwalten",
  ],
  ["/settings/data", "Meine Daten", "Export und Kontolöschung"],
  [
    "/settings/notifications",
    "Benachrichtigungen",
    "Mitteilungen von Backyrd",
  ],
  ["/settings/safety", "Sicherheit", "Kontostatus und Moderation"],
  ["/settings/support", "Support", "Hilfe und Kontakt"],
] as const;
export default function SettingsPage() {
  return (
    <SettingsShell title="EINSTELLUNGEN">
      <p className="b-muted">
        Der ruhige Ort für dein Konto, deine Privatsphäre und Hilfe.
      </p>
      <div style={{ display: "grid", gap: 8, marginTop: 28 }}>
        {items.map(([href, title, copy]) => (
          <Link
            key={href}
            href={href}
            className="b-setting-row b-surface"
            style={{ padding: "14px 18px" }}
          >
            <span>
              <strong>{title}</strong>
              <span
                className="b-meta"
                style={{ display: "block", marginTop: 4 }}
              >
                {copy}
              </span>
            </span>
            <span>→</span>
          </Link>
        ))}
      </div>
      <AccountActions />
    </SettingsShell>
  );
}
