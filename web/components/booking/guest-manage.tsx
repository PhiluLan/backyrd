"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { guestKey, guestUuid, record, type GuestReceipt } from "@/lib/booking-guest-contract";
import { guestRequest, GuestRequestError } from "@/lib/booking-guest-client";
import styles from "./guest.module.css";

const storageKey = "backyrd.booking.guest-link.v1";
type PendingCancellation = { requestId: string; revision: number };
type Credential = { reservationId: string; key: string; cancellation: PendingCancellation | null };
const labels: Record<GuestReceipt["status"], string> = { pending: "Anfrage eingegangen", confirmed: "Reservierung bestätigt", arrived: "Du bist angekommen", seated: "Dein Besuch läuft", completed: "Besuch abgeschlossen", cancelled: "Reservierung storniert", declined: "Anfrage abgelehnt", no_show: "Als nicht erschienen erfasst" };
const when = (value: string) => new Intl.DateTimeFormat("de-CH", { timeZone: "Europe/Zurich", weekday: "short", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));

function store(value: Credential | null) {
  try { if (value) sessionStorage.setItem(storageKey, JSON.stringify(value)); else sessionStorage.removeItem(storageKey); } catch { /* In-memory use still works when browser storage is disabled. */ }
}
function storedCredential(): Credential | null {
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw || raw.length > 1000) return null;
    const value = record(JSON.parse(raw));
    let cancellation: PendingCancellation | null = null;
    if (value.cancellation !== null) {
      const c = record(value.cancellation);
      if (typeof c.revision !== "number" || !Number.isSafeInteger(c.revision) || c.revision < 1) throw new Error("invalid_link");
      cancellation = { requestId: guestUuid(c.requestId), revision: c.revision };
    }
    return { reservationId: guestUuid(value.reservationId), key: guestKey(value.key), cancellation };
  } catch { store(null); return null; }
}
function restore(inMemory: Credential | null): Credential | null {
  const hash = window.location.hash;
  // Remove the capability before any requests, navigation or copy actions.
  window.history.replaceState(window.history.state, "", window.location.pathname);
  const previous = inMemory ?? storedCredential();
  if (!hash) return previous;
  try {
    const params = new URLSearchParams(hash.slice(1));
    if (Array.from(params).length !== 2 || params.getAll("id").length !== 1 || params.getAll("key").length !== 1) throw new Error("invalid_link");
    const id = guestUuid(params.get("id")), key = guestKey(params.get("key"));
    const value = { reservationId: id, key, cancellation: previous?.reservationId === id && previous.key === key ? previous.cancellation : null };
    store(value); return value;
  } catch { store(null); return null; }
}
export function GuestManage() {
  const credential = useRef<Credential | null>(null);
  const initialized = useRef(false);
  const sequence = useRef(0);
  const [receipt, setReceipt] = useState<GuestReceipt | null>(null);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [hasLink, setHasLink] = useState(false);
  const [copied, setCopied] = useState(false);

  async function load() {
    const c = credential.current;
    if (!c) return;
    const current = ++sequence.current;
    setBusy(true); setMessage(""); setReceipt(null);
    try {
      const result = await guestRequest({ operation: "read", reservationId: c.reservationId, key: c.key });
      if (!("id" in result) || credential.current !== c || sequence.current !== current) return;
      if (result.status === "cancelled") { c.cancellation = null; store(c); setUncertain(false); }
      setReceipt(result);
    } catch (error) {
      if (credential.current !== c || sequence.current !== current) return;
      if (error instanceof GuestRequestError && error.code === "link_unavailable") {
        credential.current = null; store(null); setHasLink(false); setUncertain(false);
        setMessage("Dieser Buchungslink ist ungültig, abgelaufen oder wurde ersetzt. Bitte kontaktiere das Restaurant.");
      } else setMessage("Die Reservierung konnte gerade nicht geladen werden. Bitte versuche es nochmals.");
    } finally { if (sequence.current === current) setBusy(false); }
  }
  useEffect(() => {
    function openLink() {
      if (!initialized.current || window.location.hash) { credential.current = restore(credential.current); initialized.current = true; }
      sequence.current++;
      setReceipt(null); setConfirm(false); setCopied(false);
      const c = credential.current;
      if (!c) { setHasLink(false); setUncertain(false); setBusy(false); setMessage("Öffne den persönlichen Buchungslink aus deiner Bestätigung. Für diesen Zugang brauchst du kein Backyrd-Konto."); return; }
      setHasLink(true); setUncertain(Boolean(c.cancellation));
      void load();
    }
    openLink();
    window.addEventListener("hashchange", openLink);
    return () => window.removeEventListener("hashchange", openLink);
    // The capability is consumed once on mount; reads are safe to repeat in Strict Mode.
  }, []);

  async function cancel() {
    const c = credential.current;
    if (!c || !receipt) return;
    const current = ++sequence.current;
    if (!c.cancellation) c.cancellation = { requestId: crypto.randomUUID(), revision: receipt.revision };
    // Persist before dispatch so reload/retry cannot silently choose a new mutation ID.
    store(c); setBusy(true); setMessage(""); setConfirm(false);
    try {
      const result = await guestRequest({ operation: "cancel", reservationId: c.reservationId, key: c.key, requestId: c.cancellation.requestId, revision: c.cancellation.revision });
      if (!("id" in result) || credential.current !== c || sequence.current !== current) return;
      c.cancellation = null; store(c); setUncertain(false); setReceipt(result);
    } catch (error) {
      if (credential.current !== c || sequence.current !== current) return;
      if (error instanceof GuestRequestError && !error.uncertain) {
        c.cancellation = null; store(c); setUncertain(false);
        setMessage(error.code === "changed" ? "Die Reservierung wurde inzwischen geändert. Lade den aktuellen Stand, bevor du erneut entscheidest." : error.code === "cancellation_unavailable" ? "Eine Stornierung über diesen Link ist nicht mehr möglich. Bitte kontaktiere das Restaurant." : error.code === "rate_limited" ? "Zu viele Versuche. Warte bitte eine Minute und lade den aktuellen Stand." : "Die Stornierung wurde nicht ausgeführt. Lade bitte den aktuellen Stand.");
        setReceipt(null);
      } else {
        setUncertain(true);
        setMessage("Der Ausgang der Stornierung ist noch unklar. Prüfe den aktuellen Stand oder wiederhole denselben Auftrag. Bitte lege keine neue Buchung an.");
      }
    } finally { if (sequence.current === current) setBusy(false); }
  }
  async function copyLink() {
    const c = credential.current;
    if (!c) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/booking/manage#id=${c.reservationId}&key=${c.key}`);
      setCopied(true);
    } catch { setMessage("Der Link konnte nicht kopiert werden. Dein ursprünglicher Buchungslink bleibt gültig."); }
  }
  function forget() {
    sequence.current++;
    credential.current = null; store(null); setHasLink(false); setReceipt(null); setConfirm(false); setUncertain(false); setMessage("Der Buchungslink wurde aus diesem Tab entfernt. Deine Reservierung bleibt bestehen.");
  }
  const cancellable = receipt && (receipt.status === "pending" || receipt.status === "confirmed") && Date.parse(receipt.cancellation_deadline) >= Date.now();
  return <main className={styles.page}>
    <header className={styles.header}><Link href="/booking" className={styles.brand}>backyrd <span>booking</span></Link><span>Deine Reservierung</span></header>
    <section className={styles.card} aria-busy={busy}>
      <p className={styles.eyebrow}>DEIN PERSÖNLICHER BUCHUNGSLINK</p>
      <h1>{receipt?.name ?? "Deine Reservierung"}</h1>
      {busy && <p role="status">Aktueller Stand wird geladen …</p>}
      {message && <p role="status" className={styles.notice}>{message}</p>}
      {uncertain && !message && <p role="status" className={styles.notice}>Ein früherer Stornierungsauftrag hat noch kein sicheres Ergebnis. Prüfe den Stand oder wiederhole denselben Auftrag.</p>}
      {receipt && <>
        <p className={styles.status}>{labels[receipt.status]}</p>
        {!uncertain && <button className={styles.link} disabled={busy} onClick={() => void load()}>Stand aktualisieren</button>}
        {receipt.status === "pending" && <p>Das Restaurant prüft deine Anfrage. Der Platz ist noch nicht bestätigt.</p>}
        <dl className={styles.facts}><div><dt>Für</dt><dd>{receipt.guest_name} · {receipt.party_size} {receipt.party_size === 1 ? "Person" : "Personen"}</dd></div><div><dt>Wann</dt><dd>{when(receipt.starts_at)} <small>Schweizer Zeit</small></dd></div></dl>
        {(receipt.status === "pending" || receipt.status === "confirmed") && <p className={styles.help}>Über diesen Link stornierbar bis {when(receipt.cancellation_deadline)}. Für Änderungen oder spätere Absagen kontaktiere bitte das Restaurant.</p>}
        {uncertain ? <div className={styles.actions}><button disabled={busy} onClick={() => void load()}>Aktuellen Stand prüfen</button><button className={styles.secondary} disabled={busy} onClick={() => void cancel()}>Denselben Auftrag wiederholen</button></div> : confirm ? <div className={styles.confirm}><h2>Reservierung wirklich stornieren?</h2><p>Damit gibst du deinen Platz wieder frei.</p><div className={styles.actions}><button disabled={busy} onClick={() => void cancel()}>Ja, stornieren</button><button disabled={busy} className={styles.secondary} onClick={() => setConfirm(false)}>Reservierung behalten</button></div></div> : cancellable && <button className={styles.secondary} disabled={busy} onClick={() => setConfirm(true)}>Reservierung stornieren</button>}
      </>}
      {!receipt && hasLink && !busy && <button onClick={() => void load()}>Aktuellen Stand laden</button>}
      {hasLink && <footer className={styles.footer}><button disabled={busy} className={styles.link} onClick={() => void copyLink()}>{copied ? "Buchungslink kopiert" : "Buchungslink kopieren"}</button><p>Wer diesen Link hat, kann diese Reservierung einsehen und fristgerecht stornieren. Teile ihn nur mit Personen, denen du vertraust. Der Zugang wird für diesen Tab gespeichert, soweit dein Browser dies zulässt.</p><button disabled={busy} className={styles.link} onClick={forget}>Buchungslink aus diesem Tab entfernen</button></footer>}
    </section>
    <p className={styles.help}>Backyrd Booking · Ohne zusätzliches Konto.</p>
  </main>;
}
