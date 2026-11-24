"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { bookingError, bookingReadDenied, bookingWriteUncertain, changeBookingMember, inviteBookingMember, newBookingInvite, readBookingTeam, revokeBookingInvite, type BookingInviteRequest, type BookingTeam, type BookingTeamMember, type BookingTeamRole } from "@/lib/booking-api";
import { ConsolePanel } from "./console-panel";
import styles from "./console.module.css";

export const teamRoleLabels = { viewer: "Nur lesen", host: "Service", manager: "Management", owner: "Betreiber" };
export const teamRoleHelp = { viewer: "Reservierungen und Gästedaten lesen. Keine Änderungen.", host: "Reservierungen erfassen, ändern und den Service führen. Keine Konfiguration oder Teamverwaltung.", manager: "Service und Konfiguration verwalten, einschliesslich Tischen und Sperren. Teamzugänge bleiben beim Betreiber." };
type Operation = { kind: "invite"; value: BookingInviteRequest } | { kind: "member"; member: Pick<BookingTeamMember, "user_id" | "revision">; role: BookingTeamRole | null } | { kind: "revoke"; id: string };
export function TeamConsole({ spotId, onClose, onBusy, onDenied }: { spotId: string; onClose: (uncertain: boolean) => void; onBusy: (busy: boolean) => void; onDenied: () => void }) {
  const [team, setTeam] = useState<BookingTeam | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState<Operation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<BookingTeamRole>("host");
  const [drafts, setDrafts] = useState<Record<string, { role: BookingTeamRole; revision: number }>>({});
  const [confirm, setConfirm] = useState<Operation | null>(null);
  const [link, setLink] = useState<{ url: string; email: string; role: BookingTeamRole; expires: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const inviteDraft = useRef<BookingInviteRequest | null>(null);
  const inFlight = useRef(false);
  const generation = useRef(0);
  const edited = !!email.trim() || Object.keys(drafts).length > 0 || !!confirm;
  const load = useCallback(async () => {
    const request = ++generation.current; setLoading(true);
    try { const next = await readBookingTeam(spotId); if (request === generation.current) setTeam(next); }
    catch (error) { if (request !== generation.current) return; if (bookingReadDenied(error)) onDenied(); else setError(bookingError(error)); }
    finally { if (request === generation.current) setLoading(false); }
  }, [spotId, onDenied]);
  useEffect(() => { void load(); return () => { generation.current += 1; }; }, [load]);
  useEffect(() => { const warn = (event: BeforeUnloadEvent) => { if (edited || busy || uncertain) event.preventDefault(); }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [edited, busy, uncertain]);
  async function run(operation: Operation) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); onBusy(true); setError(null); setNotice(null);
    const request = generation.current;
    try {
      if (operation.kind === "invite") {
        const result = await inviteBookingMember(spotId, operation.value);
        if (request !== generation.current) return;
        setLink({ url: location.origin + "/booking/console#invite=" + operation.value.token, email: operation.value.email, role: operation.value.role, expires: result.expires_at }); setCopied(false); setEmail(""); setRole("host"); inviteDraft.current = null;
        setNotice("Einladungslink erstellt. Es wurde keine E-Mail versendet.");
      } else if (operation.kind === "member") {
        await changeBookingMember(spotId, operation.member, operation.role);
        if (request !== generation.current) return;
        setDrafts((current) => { const next = { ...current }; delete next[operation.member.user_id]; return next; });
        setNotice(operation.role ? "Die Rolle wurde geändert." : "Der Zugang wurde entzogen.");
      } else { await revokeBookingInvite(spotId, operation.id); if (request !== generation.current) return; setNotice("Der Einladungslink wurde widerrufen."); }
      setUncertain(null); setConfirm(null); await load();
    } catch (error) { if (request !== generation.current) return; if (bookingReadDenied(error)) onDenied(); else { setError(bookingError(error)); if (uncertain || bookingWriteUncertain(error)) setUncertain(operation); } }
    finally { inFlight.current = false; setBusy(false); onBusy(false); }
  }
  function invite() {
    const address = email.trim().toLowerCase();
    if (!inviteDraft.current || inviteDraft.current.email !== address || inviteDraft.current.role !== role) inviteDraft.current = newBookingInvite(address, role);
    void run({ kind: "invite", value: inviteDraft.current });
  }
  return <ConsolePanel title="Teamzugänge" busy={busy} dirty={edited} uncertain={!!uncertain} uncertainHelp="Die Teamänderung kann bereits gespeichert sein. Prüfe nach dem Schliessen die aktuellen Teamzugänge. Ein nicht kopierter Einladungslink muss gegebenenfalls widerrufen und neu erstellt werden." onClose={() => onClose(!!uncertain)}>
    <div className={styles.drawerBody}>
      <p className={styles.help}>Jede Person nutzt ihr eigenes Backyrd-Konto. Nur der Betreiber kann Einladungen, Rollen und den Entzug von Zugängen verwalten.</p>
      {error && <p className={styles.error} role="alert">{error}{uncertain ? " Der Ausgang ist unklar. Wiederholen sendet ausschliesslich denselben Vorgang." : ""}</p>}
      {notice && <p role="status" className={styles.success}>{notice}</p>}
      {uncertain && <button className={styles.primary} disabled={busy} onClick={() => void run(uncertain)}>Unverändert erneut versuchen</button>}
      {loading && <p role="status">Team wird geladen …</p>}
      <form onSubmit={(event) => { event.preventDefault(); invite(); }}>
        <fieldset className={styles.fieldset} disabled={busy || !!uncertain || loading || !team}>
          <h3>Person einladen</h3><label>E-Mail der eingeladenen Person<input data-initial-focus type="email" required maxLength={320} autoComplete="off" value={email} onChange={(event) => { setEmail(event.target.value); setLink(null); }} /></label>
          <label>Rolle der Einladung<select value={role} onChange={(event) => { setRole(event.target.value as BookingTeamRole); setLink(null); }}><option value="host">Service</option><option value="viewer">Nur lesen</option><option value="manager">Management</option></select></label>
          <p className={styles.help}>{teamRoleHelp[role]} Der Link ist sieben Tage gültig und kann nur mit der bestätigten eingeladenen E-Mail-Adresse angenommen werden.</p>
          <button type="submit" className={styles.primary} disabled={!email.trim()}>Einladungslink erstellen</button>
        </fieldset>
      </form>
      {link && <section className={styles.note} aria-label="Neuer Einladungslink"><h3>Link für {link.email}</h3><p>{teamRoleLabels[link.role]} · gültig bis {new Date(link.expires).toLocaleDateString("de-CH")}</p><label htmlFor="booking-team-link">Einladungslink</label><textarea id="booking-team-link" readOnly rows={3} value={link.url} onFocus={(event) => event.target.select()} /><button className={styles.secondary} onClick={async () => { try { await navigator.clipboard.writeText(link.url); setCopied(true); } catch { setCopied(false); setNotice("Markiere den Link und kopiere ihn über das Browser-Menü."); } }}>{copied ? "Link kopiert" : "Link kopieren"}</button><p className={styles.help}>Der vollständige Link wird nur in diesem Fenster angezeigt. Kopiere ihn, bevor du weiterarbeitest. Verlorene Links kannst du widerrufen und neu erstellen.</p></section>}
      {team && <fieldset className={styles.fieldset} disabled={busy || !!uncertain || loading}>
        <h3>Teammitglieder</h3>{!team.members.length && <p className={styles.help}>Noch keine Teammitglieder.</p>}
        {team.members.map((member) => { const draft = drafts[member.user_id]; return <article className={styles.note} key={member.user_id} aria-label={member.email ?? member.user_id}><h4>{member.email ?? "Teammitglied " + member.user_id.slice(0, 8)}</h4>{member.revoked_at ? <p>Zugang entzogen</p> : <><p className={styles.help}>Gespeichert: {teamRoleLabels[member.role]}</p><label>Rolle für {member.email}<select value={draft?.role ?? member.role} onChange={(event) => setDrafts((current) => { const next = { ...current }; if (event.target.value === member.role) delete next[member.user_id]; else next[member.user_id] = { role: event.target.value as BookingTeamRole, revision: current[member.user_id]?.revision ?? member.revision }; return next; })}><option value="viewer">Nur lesen</option><option value="host">Service</option><option value="manager">Management</option></select></label>{draft && <div className={styles.actions}><button type="button" className={styles.primary} onClick={() => void run({ kind: "member", member: { user_id: member.user_id, revision: draft.revision }, role: draft.role })}>Rolle speichern</button><button type="button" className={styles.secondary} onClick={() => setDrafts((current) => { const next = { ...current }; delete next[member.user_id]; return next; })}>Rollenentwurf verwerfen</button></div>}<button type="button" className={styles.secondary} onClick={() => setConfirm({ kind: "member", member: { user_id: member.user_id, revision: member.revision }, role: null })}>Zugang für {member.email} entziehen</button></>}</article>; })}
        <h3>Einladungen</h3>{!team.invitations.length && <p className={styles.help}>Noch keine Einladungen.</p>}
        {team.invitations.map((invitation) => <article className={styles.note} key={invitation.id}><h4>{invitation.email}</h4><p>{teamRoleLabels[invitation.role]} · {invitation.revoked_at ? "Widerrufen" : invitation.accepted_at ? "Angenommen" : Date.parse(invitation.expires_at) <= Date.now() ? "Abgelaufen" : "Ausstehend"}</p>{!invitation.revoked_at && !invitation.accepted_at && <button type="button" className={styles.secondary} onClick={() => setConfirm({ kind: "revoke", id: invitation.id })}>Link für {invitation.email} widerrufen</button>}</article>)}
      </fieldset>}
      {confirm && !uncertain && <section className={styles.confirmation}><h3>{confirm.kind === "member" ? "Zugang entziehen?" : "Einladungslink widerrufen?"}</h3><p>Diese Änderung wird protokolliert. Für einen späteren Beitritt ist eine neue Einladung erforderlich.</p><div className={styles.actions}><button type="button" className={styles.primary} disabled={busy} onClick={() => void run(confirm)}>Entzug bestätigen</button><button type="button" className={styles.secondary} disabled={busy} onClick={() => setConfirm(null)}>Abbrechen</button></div></section>}
      <button className={styles.secondary} disabled={busy || !!uncertain || edited} onClick={() => { setError(null); void load(); }}>Team aktualisieren</button>
    </div>
  </ConsolePanel>;
}
