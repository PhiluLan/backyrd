import { SettingsShell } from "@/components/consumer/settings-shell";
import { ButtonLink } from "@/components/consumer/ui";
export default function NotificationSettingsPage() {
  return (
    <SettingsShell title="BENACHRICHTIGUNGEN">
      <p className="b-muted">
        Deine Mitteilungen erscheinen sicher in Backyrd. Browser-Push wird erst
        angeboten, wenn dafür eine vollständig unterstützte Web-Verbindung
        besteht.
      </p>
      <div className="b-surface" style={{ padding: 24, marginTop: 24 }}>
        <div className="b-setting-row">
          <div>
            <p className="b-kicker">Im Web verfügbar</p>
            <h2 className="b-card-title" style={{ marginTop: 8 }}>
              Mitteilungen in Backyrd
            </h2>
            <p className="b-meta" style={{ maxWidth: 580 }}>
              Safety- und Konto-Mitteilungen bleiben in deinem persönlichen
              Bereich abrufbar. Eine Browser-Berechtigung wird nicht ohne
              funktionierende Zustellung angefragt.
            </p>
          </div>
          <div className="b-form-actions">
            <ButtonLink href="/notifications">Mitteilungen öffnen</ButtonLink>
            <ButtonLink href="/settings/consents" variant="secondary">
              Einwilligungen verwalten
            </ButtonLink>
          </div>
        </div>
      </div>
    </SettingsShell>
  );
}
