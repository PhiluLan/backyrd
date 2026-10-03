"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { OwnerShell } from "@/components/owner/owner-shell";
import { supabase } from "@/lib/supabase/client";

type BillingStatus = "NONE" | "CHECKOUT_PENDING" | "INCOMPLETE" | "ACTIVE" | "PAST_DUE" | "UNPAID" | "PAUSED" | "CANCELED";
type BillingSpot = {
  spotId: string;
  name: string;
  city: string | null;
  checkoutEligible: boolean;
  billing: { status: BillingStatus; active: boolean; paidUntil: string | null; cancelAtPeriodEnd: boolean };
};
type Overview = { checkoutAvailable: boolean; spots: BillingSpot[] };
type Invoice = { id: string; createdAt: string; amountRappen: number; status: string; url: string | null };

const dateLabel = (value: string) => new Intl.DateTimeFormat("de-CH", { day: "numeric", month: "long", year: "numeric" }).format(new Date(value));

function statusCopy(spot: BillingSpot) {
  if (spot.billing.active && spot.billing.cancelAtPeriodEnd) return { label: "Gekündigt · noch aktiv", tone: "ending", text: `Dein Pro-Zugang bleibt bis ${dateLabel(spot.billing.paidUntil!)} aktiv.` };
  if (spot.billing.active) return { label: "Owner Pro aktiv", tone: "active", text: `Bezahlt bis ${dateLabel(spot.billing.paidUntil!)}. Die Verlängerung erfolgt automatisch.` };
  if (spot.billing.status === "CHECKOUT_PENDING") return { label: "Checkout begonnen", tone: "pending", text: "Der Zahlungsvorgang wurde noch nicht bestätigt." };
  if (spot.billing.status === "PAST_DUE" || spot.billing.status === "UNPAID") return { label: "Zahlung offen", tone: "warning", text: "Die letzte Zahlung ist fehlgeschlagen. Bitte prüfe dein Zahlungsmittel." };
  if (spot.billing.status === "PAUSED") return { label: "Abo pausiert", tone: "warning", text: "Die Abrechnung ist pausiert. Pro ist derzeit nicht aktiv." };
  if (spot.billing.status === "INCOMPLETE") return { label: "Zahlung nicht abgeschlossen", tone: "warning", text: "Deine erste Zahlung wurde nicht bestätigt." };
  if (spot.billing.status === "CANCELED") return { label: "Abo beendet", tone: "neutral", text: "Für diesen Spot ist aktuell kein Pro-Abo aktiv." };
  return { label: "Owner Basic", tone: "neutral", text: "Dein Spot kann ohne Abo in den Basisbereichen gepflegt werden." };
}

async function billingFetch(path: string, init?: RequestInit) {
  const request = async (refresh: boolean) => {
    const auth = refresh ? await supabase.auth.refreshSession() : await supabase.auth.getSession();
    const token = auth.data.session?.access_token;
    if (!token) throw new Error("Bitte melde dich erneut an.");
    return fetch(path, {
      ...init,
      headers: { ...init?.headers, authorization: `Bearer ${token}`, ...(init?.body ? { "content-type": "application/json" } : {}) },
      cache: "no-store",
    });
  };
  let response = await request(false);
  if (response.status === 401) response = await request(true);
  if (!response.ok) throw new Error(response.status === 403
    ? "Du bist für diesen Spot nicht als Betreiber:in verifiziert."
    : "Die Abrechnung ist gerade nicht erreichbar. Bitte versuche es erneut.");
  return response.json() as Promise<unknown>;
}

export default function OwnerBillingPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [returning, setReturning] = useState(false);

  const load = useCallback(async (preferred?: string | null) => {
    const data = await billingFetch("/api/owner/billing") as Overview;
    if (!Array.isArray(data.spots) || typeof data.checkoutAvailable !== "boolean") throw new Error("Ungültige Antwort.");
    setOverview(data);
    setSelectedId((current) => {
      const requested = preferred ?? current;
      return data.spots.some((spot) => spot.spotId === requested) ? requested : data.spots[0]?.spotId ?? null;
    });
    return data;
  }, []);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams(window.location.search);
    const preferred = params.get("spot");
    const checkout = params.get("checkout");
    void load(preferred).then(async (data) => {
      if (!active) return;
      if (checkout === "cancel" && preferred && data.spots.some((spot) => spot.spotId === preferred)) {
        try {
          await billingFetch("/api/owner/billing/cancel-checkout", { method: "POST", body: JSON.stringify({ spotId: preferred }) });
          if (active) await load(preferred);
        } catch { /* status remains truthful and can be retried */ }
        if (active) setMessage("Du hast den Checkout verlassen. Es wurde kein Pro-Zugang aktiviert.");
      }
      if (checkout === "return" && preferred) {
        setReturning(true);
        let confirmed = false;
        for (let attempt = 0; attempt < 8 && active; attempt += 1) {
          const refreshed = attempt === 0 ? data : await load(preferred);
          if (refreshed.spots.find((spot) => spot.spotId === preferred)?.billing.active) {
            setMessage("Willkommen bei Owner Pro. Dein Spot ist jetzt freigeschaltet.");
            setReturning(false);
            confirmed = true;
            break;
          }
          await new Promise((resolve) => window.setTimeout(resolve, 1800));
        }
        if (active) {
          setReturning(false);
          if (!confirmed) setMessage("Die Zahlung wird noch bestätigt. Pro ist bis dahin nicht freigeschaltet. Bitte prüfe den Status später erneut.");
        }
      }
      if (active && checkout) window.history.replaceState(null, "", "/owner/billing" + (preferred ? `?spot=${encodeURIComponent(preferred)}` : ""));
    }).catch(() => { if (active) setError("Die Abrechnung konnte nicht geladen werden. Bitte versuche es erneut."); });
    return () => { active = false; };
  }, [load]);

  const selected = overview?.spots.find((spot) => spot.spotId === selectedId) ?? null;

  useEffect(() => {
    let active = true;
    setInvoices([]);
    if (!selected?.billing.active && !selected?.billing.paidUntil) return;
    setInvoicesLoading(true);
    void billingFetch(`/api/owner/billing/invoices?spotId=${encodeURIComponent(selected.spotId)}`)
      .then((body) => { if (active) setInvoices((body as { invoices?: Invoice[] }).invoices ?? []); })
      .catch(() => { if (active) setError("Rechnungen sind gerade nicht verfügbar. Dein Abo-Status bleibt unverändert."); })
      .finally(() => { if (active) setInvoicesLoading(false); });
    return () => { active = false; };
  }, [selected?.spotId, selected?.billing.active, selected?.billing.paidUntil]);

  async function action(path: string) {
    if (!selected || busy) return;
    setBusy(true);
    setError("");
    try {
      const body = await billingFetch(path, { method: "POST", body: JSON.stringify({ spotId: selected.spotId }) }) as { url?: string };
      if (!body.url || !body.url.startsWith("https://")) throw new Error("Kein Zahlungslink verfügbar.");
      window.location.assign(body.url);
    } catch {
      setError("Der sichere Zahlungsbereich konnte nicht geöffnet werden. Es wurde nichts freigeschaltet oder geändert.");
      setBusy(false);
      void load(selected.spotId);
    }
  }

  const state = selected ? statusCopy(selected) : null;

  return <OwnerShell eyebrow="OWNER PRO · ABRECHNUNG" title="Mehr Möglichkeiten für deinen Spot."
    subtitle="Ein klares Abo pro Ort. Du behältst jederzeit den Überblick über Preis, Zahlungsstatus und Laufzeit.">
    <div className="owner-billing-page">
      {message && <div className="owner-billing-notice" role="status">{message}<button type="button" onClick={() => setMessage("")} aria-label="Hinweis schließen">×</button></div>}
      {error && <div className="owner-billing-error" role="alert">{error}<button type="button" onClick={() => { setError(""); void load(selectedId).catch(() => setError("Die Abrechnung ist noch nicht erreichbar.")); }}>Erneut versuchen</button></div>}
      {returning && <div className="owner-billing-notice" role="status">Wir prüfen deine Zahlung. Pro wird erst nach der Bestätigung aktiviert.</div>}

      <section className="owner-billing-offer" aria-labelledby="owner-billing-offer-title">
        <div><span className="owner-billing-kicker">DEIN SPOT, MEHR TIEFE</span><h2 id="owner-billing-offer-title">Owner Pro</h2>
          <p>Ergänze objektive Nutzungsmöglichkeiten, Ausstattung und die drei Pro-Angaben zu Besuch und Atmosphäre. Alle Angaben bleiben prüfbar – eine bessere Platzierung ist nicht käuflich.</p></div>
        <div className="owner-billing-price"><strong>CHF 39.–</strong><span>pro Monat · pro Spot</span><small>inklusive MWST</small></div>
      </section>

      {!overview ? <div className="owner-billing-panel" role="status">Deine Spots und dein Abo-Status werden geladen …</div>
        : overview.spots.length === 0 ? <div className="owner-billing-panel"><h2>Noch kein Spot verbunden.</h2><p>Owner Pro kann erst für einen verifizierten Spot abgeschlossen werden.</p><Link href="/owner/spots">Meine Spots ansehen</Link></div>
          : <>
            <section className="owner-billing-panel"><div className="owner-billing-section-heading"><span className="owner-billing-kicker">01 · DEIN ORT</span><h2>Wähle deinen Spot</h2></div>
              <div className="owner-billing-spot-list">{overview.spots.map((spot) => <button type="button" key={spot.spotId}
                aria-pressed={selectedId === spot.spotId} className={selectedId === spot.spotId ? "selected" : ""}
                onClick={() => { setSelectedId(spot.spotId); setError(""); }}><span><strong>{spot.name}</strong><small>{spot.city ?? "Ort nicht angegeben"}</small></span><em>{statusCopy(spot).label}</em></button>)}</div>
            </section>
            {selected && state && <section className="owner-billing-panel owner-billing-current" aria-live="polite">
              <div className="owner-billing-section-heading"><span className="owner-billing-kicker">02 · ABO & ZUGANG</span><h2>{selected.name}</h2></div>
              <span className={`owner-billing-status owner-billing-status-${state.tone}`}>{state.label}</span>
              <p>{state.text}</p>
              {selected.billing.active && !selected.billing.cancelAtPeriodEnd && selected.billing.paidUntil && <p className="owner-billing-muted">Nächste reguläre Verlängerung: {dateLabel(selected.billing.paidUntil)}.</p>}
              {selected.billing.status === "CHECKOUT_PENDING" ? <button type="button" className="owner-billing-secondary" disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await billingFetch("/api/owner/billing/cancel-checkout", { method: "POST", body: JSON.stringify({ spotId: selected.spotId }) });
                    await load(selected.spotId);
                    setMessage("Der offene Checkout wurde beendet. Du kannst neu starten.");
                  } catch { setError("Der offene Checkout konnte nicht beendet werden. Bitte versuche es später erneut."); }
                  finally { setBusy(false); }
                }}>Offenen Checkout beenden</button>
                : selected.billing.status !== "NONE" && selected.billing.status !== "CANCELED"
                  ? <button type="button" className="owner-billing-primary" disabled={busy} onClick={() => void action("/api/owner/billing/portal")}>{busy ? "Wird geöffnet …" : "Abo & Zahlungsmittel verwalten"}</button>
                  : !selected.checkoutEligible
                    ? <div className="owner-billing-unavailable"><strong>Spot noch nicht freigegeben</strong><p>Ein neues Pro-Abo kann erst nach Freigabe dieses Spots gestartet werden. Bestehende Abos kannst du weiterhin verwalten.</p></div>
                  : overview.checkoutAvailable
                    ? <button type="button" className="owner-billing-primary" disabled={busy} onClick={() => void action("/api/owner/billing/checkout")}>{busy ? "Sicherer Checkout öffnet …" : "Owner Pro für diesen Spot starten"}</button>
                    : <div className="owner-billing-unavailable"><strong>Checkout wird vorbereitet</strong><p>Bezahlen ist noch nicht freigeschaltet. Wir starten erst, wenn Stripe und TWINT für backyrd geprüft sind.</p></div>}
              <small className="owner-billing-footnote">Monatlich kündbar. Bei Kündigung bleibt der bereits bezahlte Zeitraum aktiv. Keine gekaufte Empfehlung oder Platzierung.</small>
            </section>}
            {selected && <section className="owner-billing-panel"><div className="owner-billing-section-heading"><span className="owner-billing-kicker">03 · ABRECHNUNG</span><h2>Deine Rechnungen</h2></div>
              {invoicesLoading ? <p>Rechnungen werden geladen …</p> : invoices.length ? <div className="owner-billing-invoices">{invoices.map((invoice) => <div key={invoice.id}><span><strong>{dateLabel(invoice.createdAt)}</strong><small>{invoice.status === "paid" ? "Bezahlt" : "Status: " + invoice.status}</small></span><span>CHF {(invoice.amountRappen / 100).toFixed(2)}</span>{invoice.url && <a href={invoice.url} target="_blank" rel="noopener noreferrer">Rechnung öffnen</a>}</div>)}</div>
                : <p className="owner-billing-muted">Für diesen Spot liegen noch keine Rechnungen vor. Nach der ersten Zahlung erscheinen sie hier.</p>}
            </section>}
          </>}
    </div>
  </OwnerShell>;
}
