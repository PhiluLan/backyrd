"use client";
import { FormEvent, useState } from "react";
import { SettingsShell } from "@/components/consumer/settings-shell";
import { Button, Toast } from "@/components/consumer/ui";
export default function SupportPage() {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (subject.trim().length < 3 || message.trim().length < 10) {
      setToast("Beschreibe kurz, wobei du Hilfe brauchst.");
      return;
    }
    const href = `mailto:hello@backyrd.ch?subject=${encodeURIComponent(subject.trim())}&body=${encodeURIComponent(message.trim())}`;
    window.location.href = href;
  }
  return (
    <SettingsShell title="SUPPORT">
      <p className="b-muted">
        Hilfe ohne Umwege. Für Sicherheitsmeldungen nutze bitte das Safety
        Center, damit der richtige Prozess greift.
      </p>
      <form className="b-form" onSubmit={submit} style={{ marginTop: 28 }}>
        <div className="b-input-group">
          <label className="b-label" htmlFor="support-subject">
            Thema
          </label>
          <input
            id="support-subject"
            className="b-input"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
          />
        </div>
        <div className="b-input-group">
          <label className="b-label" htmlFor="support-message">
            Nachricht
          </label>
          <textarea
            id="support-message"
            className="b-textarea"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Was ist passiert und wobei können wir helfen?"
          />
        </div>
        <Button type="submit">E-Mail vorbereiten</Button>
      </form>
      <p className="b-meta" style={{ marginTop: 24 }}>
        hello@backyrd.ch · Spalenring 64 · 4055 Basel
      </p>
      {toast ? (
        <Toast message={toast} onDismiss={() => setToast(null)} />
      ) : null}
    </SettingsShell>
  );
}
