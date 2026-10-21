"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { guestRequest, GuestRequestError } from "@/lib/booking-guest-client";
import { parseGuestRequest, type GuestAvailability, type GuestPolicySnapshot, type GuestReceipt } from "@/lib/booking-guest-contract";
import { clearCheckoutStored, newGuestCheckoutKey, readCheckoutStored, saveCheckoutStored, type CheckoutStored } from "@/lib/booking-checkout-state";
import { guestDate, guestSlotTime, guestWhen } from "@/lib/booking-guest-time";
import { GuestChallenge } from "./guest-challenge";
import styles from "./guest.module.css";

const policyOf = (a: GuestAvailability): GuestPolicySnapshot => ({ policy_revision: a.policy_revision, cancellation_minutes: a.cancellation_minutes, confirmation_status: a.confirmation_status, privacy_contact: a.privacy_contact, guest_notice: a.guest_notice });
const shiftedDate = (date: string, days: number) => new Date(Date.parse(date + "T12:00:00Z") + days * 86400000).toISOString().slice(0,10);
export function GuestCheckout({ spotId, siteKey }: { spotId: string; siteKey: string }) {
  const [date, setDate] = useState(guestDate), [party, setParty] = useState("2");
  const [availability, setAvailability] = useState<GuestAvailability | null>(null), [selected, setSelected] = useState("");
  const [name, setName] = useState(""), [email, setEmail] = useState("");
  const [details, setDetails] = useState(false), [accepted, setAccepted] = useState(false), [token, setToken] = useState("");
  const [proofVersion, setProofVersion] = useState(0), [more, setMore] = useState(false), [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(false), [busy, setBusy] = useState(false), [ready, setReady] = useState(false), [blocked, setBlocked] = useState(false);
  const [message, setMessage] = useState(""), [receipt, setReceipt] = useState<GuestReceipt | null>(null);
  const [stored, setStored] = useState<CheckoutStored | null>(null), [another, setAnother] = useState(false);
  const current = useRef<CheckoutStored | null>(null), mounted = useRef(false), generation = useRef(0), writing = useRef(false);
  const invalidate = useCallback(() => { generation.current++; }, []);
  const count = Number(party), validParty = party.trim() !== "" && Number.isInteger(count) && count >= 1 && count <= 30;
  const pending = stored?.kind === "pending" ? stored : null;
  const complete = stored?.kind === "complete" ? stored : null;
  const resetProof = useCallback(() => { setToken(""); setProofVersion(n => n + 1); }, []);
  function remember(value: CheckoutStored) { current.current = value; setStored(value); return saveCheckoutStored(spotId, value); }
  async function readComplete(value: Extract<CheckoutStored, { kind: "complete" }>) {
    const result = await guestRequest({ operation: "read", reservationId: value.reservationId, key: value.key });
    if (!("id" in result) || result.spot_id !== spotId) throw new Error("wrong_receipt");
    if (mounted.current && current.current === value) { setReceipt(result); setMessage(""); }
  }
  async function finish(result: GuestReceipt, key: string) {
    const value: CheckoutStored = { kind: "complete", reservationId: result.id, key };
    remember(value); setReceipt(null); setMessage("Deine Buchung wurde erfasst. Der aktuelle Stand wird geprüft …");
    // Create replay may be historical. Read current state before showing a status.
    try { await readComplete(value); } catch { if (mounted.current) setMessage("Deine Buchung wurde erfasst, der aktuelle Stand konnte aber nicht geladen werden. Bitte lege sie nicht nochmals an. Prüfe den Stand oder öffne den Buchungslink aus deiner E-Mail."); }
  }
  async function recover(value: Extract<CheckoutStored, { kind: "pending" }>): Promise<boolean> {
    try {
      const r = value.intent;
      const result = await guestRequest({ operation: "checkout_recover", spotId, requestId: r.requestId, key: r.key, policyRevision: r.policyRevision, startsAt: r.startsAt });
      if (!mounted.current || current.current !== value) return true;
      if ("not_committed" in result) {
        if (!clearCheckoutStored(spotId)) { setBlocked(true); setMessage("Dieser Auftrag wurde nicht ausgeführt, der gespeicherte Tab-Auftrag konnte aber nicht entfernt werden. Bitte verwende einen Browser mit verfügbarem Tab-Speicher."); return true; }
        current.current = null; setStored(null); setDetails(false); setSelected(""); setAccepted(false); resetProof(); setAvailability(null); setRefresh(n => n + 1);
        setMessage("Der frühere Auftrag wurde nicht ausgeführt. Wähle bitte einen neuen Termin und prüfe die aktuellen Hinweise."); return true;
      }
      if (!("id" in result)) throw new Error("wrong_recovery");
      await finish(result, r.key); return true;
    } catch (error) {
      if (!mounted.current || current.current !== value) return true;
      if (error instanceof GuestRequestError && error.code === "link_unavailable") return false;
      throw error;
    }
  }
  useEffect(() => {
    mounted.current = true;
    try {
      const value = readCheckoutStored(spotId);
      current.current = value; setStored(value); setReady(true);
      if (value) {
        setBusy(true);
        void (value.kind === "pending" ? recover(value).then(found => { if (!found && mounted.current && current.current === value) setMessage("Für deinen früheren Auftrag liegt noch kein sicheres Ergebnis vor. Eine laufende Anfrage kann weiterhin ankommen. Prüfe den Stand oder wiederhole nur denselben Auftrag."); }) : readComplete(value)).catch(() => { if (mounted.current) setMessage("Der frühere Buchungsstand konnte nicht geprüft werden. Bitte lege dieselbe Buchung nicht nochmals an."); }).finally(() => { if (mounted.current) setBusy(false); });
      }
    } catch { setReady(true); setBlocked(true); setMessage("Ein gespeicherter Buchungsauftrag konnte nicht gelesen werden. Bitte kläre eine möglicherweise bereits erfasste Buchung mit dem Restaurant, bevor du nochmals buchst."); }
    return () => { mounted.current = false; invalidate(); };
    // Recovery only reads the frozen tab intent; callbacks must not restart it on renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spotId]);
  useEffect(() => {
    if (!ready || blocked || current.current || !validParty || !/^20\d\d-\d\d-\d\d$/.test(date)) return;
    const seq = ++generation.current; setLoading(true);
    const timer = setTimeout(() => {
      void guestRequest({ operation: "availability", spotId, date, partySize: count }).then(result => {
        if (seq !== generation.current || current.current || !mounted.current) return;
        if (!("slots" in result)) throw new Error("wrong_availability");
        setAvailability(result); setMessage("");
      }).catch(error => {
        if (seq !== generation.current || !mounted.current) return;
        setAvailability(null); setMessage(error instanceof GuestRequestError && error.code === "rate_limited" ? "Zu viele Abfragen. Bitte warte kurz und versuche es erneut." : "Für dieses Restaurant ist die Online-Buchung gerade nicht verfügbar. Bitte kontaktiere das Restaurant oder versuche es später erneut.");
      }).finally(() => { if (seq === generation.current && mounted.current) setLoading(false); });
    }, 250);
    return () => { clearTimeout(timer); invalidate(); };
  }, [ready, blocked, date, count, validParty, spotId, refresh, invalidate]);
  useEffect(() => {
    const protect = (e: BeforeUnloadEvent) => { if (current.current?.kind === "pending") e.preventDefault(); };
    window.addEventListener("beforeunload", protect); return () => window.removeEventListener("beforeunload", protect);
  }, []);
  function changeSearch(nextDate: string, nextParty: string) {
    generation.current++; setLoading(false); setDate(nextDate); setParty(nextParty); setAvailability(null); setSelected(""); setDetails(false); setAccepted(false); setMore(false); resetProof(); setMessage("");
  }
  async function checkStatus() {
    if (writing.current || !current.current) return;
    writing.current = true; setBusy(true); setMessage("");
    try {
      const value = current.current;
      if (value.kind === "complete") await readComplete(value);
      else if (!await recover(value)) setMessage("Noch kein Ergebnis gefunden. Das beweist nicht, dass die Buchung fehlgeschlagen ist. Bitte starte keinen neuen Auftrag.");
    } catch { if (mounted.current) setMessage("Der Stand konnte nicht geladen werden. Der bisherige Auftrag bleibt gespeichert."); }
    finally { writing.current = false; if (mounted.current) setBusy(false); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (writing.current || !ready || blocked || complete) return;
    writing.current = true; setBusy(true); setMessage("");
    const wasPending = current.current?.kind === "pending";
    try {
      let value = current.current?.kind === "pending" ? current.current : null;
      if (value && await recover(value)) return;
      if (!token) { setMessage("Bitte schliesse zuerst die Sicherheitsprüfung ab."); return; }
      if (!value) {
        if (!availability || availability.spot_id !== spotId || !accepted || !availability.slots.some(s => s.starts_at === selected)) return;
        const parsed = parseGuestRequest({ operation: "create", spotId, requestId: crypto.randomUUID(), policyRevision: availability.policy_revision, startsAt: selected, partySize: count, name, email, key: newGuestCheckoutKey(), note: "", challenge: token, acceptedPolicy: true });
        if (parsed.operation !== "create") throw new Error("invalid_checkout");
        const { challenge: transientProof, ...intent } = parsed; void transientProof;
        value = { kind: "pending", intent, policy: policyOf(availability), restaurantName: availability.name };
        if (!saveCheckoutStored(spotId, value)) { setMessage("Der Browser kann deinen Auftrag nicht sicher speichern. Es wurde keine Buchung angefordert. Bitte nutze einen Browser mit verfügbarem Tab-Speicher oder kontaktiere das Restaurant."); return; }
        current.current = value; setStored(value); generation.current++;
      }
      const result = await guestRequest({ ...value.intent, challenge: token });
      if (!mounted.current || current.current !== value) return;
      if (!("id" in result)) throw new Error("wrong_create");
      await finish(result, value.intent.key);
    } catch (error) {
      if (!mounted.current) return;
      if (!wasPending && error instanceof GuestRequestError && !error.uncertain) {
        if (clearCheckoutStored(spotId)) { current.current = null; setStored(null); }
        else setBlocked(true);
        setMessage(error.code === "slot_unavailable" ? "Diese Zeit wurde inzwischen vergeben. Wähle bitte eine andere Zeit." : error.code === "changed" ? "Die Buchungshinweise wurden inzwischen geändert. Bitte prüfe die aktuellen Angaben und entscheide erneut." : error.code === "challenge_required" ? "Bitte wiederhole die Sicherheitsprüfung." : error.code === "rate_limited" ? "Zu viele Versuche. Bitte warte kurz, bevor du es erneut versuchst." : "Die Buchung wurde nicht ausgeführt. Prüfe deine Angaben oder kontaktiere das Restaurant.");
        if (error.code === "changed" || error.code === "slot_unavailable") { setAvailability(null); setDetails(false); setSelected(""); setAccepted(false); setRefresh(n => n + 1); }
      } else if (current.current?.kind === "pending") setMessage("Der Ausgang deiner Buchung ist noch unklar. Dein Auftrag bleibt unverändert gespeichert. Bitte lege keine zusätzliche Buchung an.");
      else setMessage("Dein Auftrag konnte nicht vorbereitet werden. Es wurde keine Buchung angefordert. Bitte prüfe deine Angaben.");
    } finally { writing.current = false; if (mounted.current) { setBusy(false); resetProof(); } }
  }
  function startAnother() {
    if (!complete || !clearCheckoutStored(spotId)) return;
    current.current = null; setStored(null); setReceipt(null); setName(""); setEmail(""); setDetails(false); setAccepted(false); setSelected(""); setAvailability(null); setAnother(false); setMessage(""); setRefresh(n => n + 1);
  }
  const policy = pending?.policy ?? (availability ? policyOf(availability) : null);
  const title = receipt?.name ?? pending?.restaurantName ?? availability?.name ?? "Tisch reservieren";
  const slots = availability?.slots ?? [];
  const management = complete ? `/booking/manage#id=${complete.reservationId}&key=${complete.key}` : null;
  return <main className={styles.page}>
    <header className={styles.header}><Link href="/booking" prefetch={false} className={styles.brand}>backyrd <span>booking</span></Link><span>Direkt beim Restaurant reservieren</span></header>
    <section className={styles.card} aria-busy={loading || busy}>
      <p className={styles.eyebrow}>DEIN NÄCHSTER GUTER MOMENT</p><h1>{title}</h1>
      <ol className={styles.steps} aria-label="Buchungsschritte"><li aria-current={!details && !stored ? "step" : undefined}>1 · Zeit wählen</li><li aria-current={details && !stored ? "step" : undefined}>2 · Deine Angaben</li><li aria-current={stored ? "step" : undefined}>3 · Buchungsstand</li></ol>
      {message && <p role="status" className={styles.notice}>{message}</p>}
      {!ready && <p role="status">Dein Tab wird geprüft …</p>}
      {complete ? <>
        {receipt && <><p className={styles.status}>{receipt.status === "pending" ? "Anfrage eingegangen" : receipt.status === "confirmed" ? "Reservierung bestätigt" : receipt.status === "cancelled" ? "Reservierung storniert" : receipt.status === "declined" ? "Anfrage abgelehnt" : "Buchungsstand aktualisiert"}</p>{receipt.status === "pending" && <p>Das Restaurant prüft deine Anfrage. Dein Platz ist noch nicht bestätigt.</p>}<dl className={styles.facts}><div><dt>Für</dt><dd>{receipt.guest_name} · {receipt.party_size} Personen</dd></div><div><dt>Termin · Schweizer Zeit</dt><dd>{guestWhen(receipt.starts_at)}</dd></div></dl></>}
        <div className={styles.actions}><button type="button" disabled={busy} onClick={() => void checkStatus()}>Aktuellen Stand prüfen</button>{management && <Link href={management} prefetch={false} className={styles.buttonLink}>Buchung verwalten</Link>}</div>
        <p className={styles.help}>Eine E-Mail wird vorbereitet. Diese Anzeige bestätigt noch keinen Versand. Du kannst den persönlichen Buchungslink auch über «Buchung verwalten» öffnen und kopieren.</p>
        {another ? <div className={styles.confirm}><p>Eine weitere Buchung anlegen? Deine bisherige Buchung bleibt bestehen.</p><div className={styles.actions}><button type="button" disabled={busy} onClick={startAnother}>Ja, weitere Buchung starten</button><button type="button" className={styles.secondary} onClick={() => setAnother(false)}>Zurück</button></div></div> : <button type="button" className={styles.link} disabled={busy} onClick={() => setAnother(true)}>Eine weitere Buchung starten</button>}
      </> : pending ? <>
        <h2>Deinen bisherigen Auftrag prüfen</h2><dl className={styles.facts}><div><dt>Termin</dt><dd>{guestWhen(pending.intent.startsAt)} · {pending.intent.partySize} Personen</dd></div><div><dt>Deine Angaben</dt><dd>{pending.intent.name}<small>{pending.intent.email}</small></dd></div></dl>
        <p>Die Angaben bleiben gesperrt, bis der frühere Auftrag geklärt ist. Ein erneuter Versuch verwendet dieselbe Anfrage.</p>
        <button type="button" disabled={busy} onClick={() => void checkStatus()}>Buchungsstand prüfen</button>
        {siteKey && <form onSubmit={submit}><GuestChallenge key={proofVersion} siteKey={siteKey} onToken={setToken} /><button className={styles.secondary} disabled={busy || blocked || !token}>Denselben Auftrag wiederholen</button></form>}
      </> : !blocked && ready && <>
        {!details ? <><div className={styles.searchFields}><label>Datum<input type="date" min={guestDate()} max={shiftedDate(guestDate(), availability?.horizon_days ?? 365)} required value={date} onChange={e => changeSearch(e.target.value,party)} /></label><label>Personen<input type="number" inputMode="numeric" min={1} max={availability?.max_party_size ?? 30} required value={party} onChange={e => changeSearch(date,e.target.value)} /></label></div>
          {!validParty && <p role="status">Wähle eine ganze Personenzahl zwischen 1 und 30.</p>}
          {loading && <p role="status">Verfügbare Zeiten werden geprüft …</p>}
          {availability && availability.max_party_size && count>availability.max_party_size && <p role="status">Online sind bis zu {availability.max_party_size} Personen möglich. Für grössere Gruppen kontaktiere bitte das Restaurant.</p>}
          {availability && (slots.length ? <><h2>Wann passt es dir?</h2><div className={styles.slotGrid}>{(more ? slots : slots.slice(0,12)).map(slot => <button type="button" className={selected === slot.starts_at ? "" : styles.secondary} aria-pressed={selected === slot.starts_at} key={slot.starts_at} onClick={() => { setSelected(slot.starts_at); setAccepted(false); resetProof(); }}>{guestSlotTime(slot.starts_at,slots)}{guestDate(new Date(slot.starts_at)) !== date && <small>{new Intl.DateTimeFormat("de-CH",{timeZone:"Europe/Zurich",weekday:"short",day:"numeric",month:"short"}).format(new Date(slot.starts_at))}</small>}</button>)}</div>{!more && slots.length > 12 && <button type="button" className={styles.link} onClick={() => setMore(true)}>Weitere Zeiten anzeigen</button>}<p className={styles.help}>Schweizer Zeit · Die Verfügbarkeit wird beim Absenden nochmals verbindlich geprüft.</p><button type="button" disabled={!selected || loading} onClick={() => setDetails(true)}>Weiter zu deinen Angaben</button></> : <div className={styles.confirm}><h2>Keine passende Zeit frei.</h2><p>Versuche ein anderes Datum oder kontaktiere das Restaurant für deine Gruppe.</p></div>)}
          {!availability && !loading && validParty && <button type="button" className={styles.secondary} onClick={() => setRefresh(n => n + 1)}>Erneut nach Zeiten suchen</button>}
        </> : <form onSubmit={submit}>
          <p className={styles.status}>{guestWhen(selected)} · {count} Personen</p><div className={styles.searchFields}><label>Dein Name<input required maxLength={120} autoComplete="name" value={name} onChange={e => setName(e.target.value)} /></label><label>Deine E-Mail<input type="email" inputMode="email" required maxLength={254} autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></label></div>
          {policy && <section className={styles.confirm} aria-label="Buchungshinweise"><h2>{policy.confirmation_status === "pending" ? "Deine Anfrage wird geprüft" : "Dein Tisch wird direkt bestätigt"}</h2>{policy.confirmation_status === "pending" && <p>Der Platz ist erst nach Bestätigung durch das Restaurant reserviert.</p>}<p>Online stornierbar bis {guestWhen(new Date(Date.parse(selected)-policy.cancellation_minutes*60000).toISOString())}. Für spätere Absagen oder Änderungen kontaktiere das Restaurant.</p>{policy.guest_notice && <p className={styles.policyText}>{policy.guest_notice}</p>}<p className={styles.help}>Datenschutzkontakt des Restaurants: {policy.privacy_contact}</p></section>}
          <label className={styles.consent}><input type="checkbox" required checked={accepted} onChange={e => setAccepted(e.target.checked)} /><span>Ich habe die Buchungshinweise und die <Link href="/privacy" prefetch={false} target="_blank" rel="noopener noreferrer">Datenschutzinformationen</Link> gelesen.</span></label>
          <p className={styles.help}>Für sichere Wiederholungen speichern wir deinen Auftrag mit deinen Angaben und einem persönlichen Buchungsschlüssel vorübergehend in diesem Tab. Nach der Klärung werden die Eingaben aus diesem Auftrag entfernt. Du brauchst kein Backyrd-Konto.</p>
          {siteKey ? <GuestChallenge key={proofVersion} siteKey={siteKey} onToken={setToken} /> : <p role="status" className={styles.notice}>Die Online-Buchung ist noch nicht freigeschaltet. Es wird keine Buchung ausgelöst.</p>}
          <div className={styles.actions}><button disabled={busy || !accepted || !token || !siteKey}>{busy ? "Wird geprüft …" : policy?.confirmation_status === "pending" ? "Anfrage senden" : "Tisch reservieren"}</button><button type="button" className={styles.secondary} disabled={busy} onClick={() => { setDetails(false); resetProof(); }}>Zurück zur Zeitwahl</button></div>
        </form>}
      </>}
      <footer className={styles.footer}><Link href={`/spots/${spotId}`} prefetch={false} className={styles.contact}>Restaurantinformationen ↗</Link><p>Backyrd Booking · Direkt reservieren, ohne zusätzliches Konto.</p></footer>
    </section>
  </main>;
}
