"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { BookingSetup, BookingSnapshot, BookingService } from "@/lib/booking-api";
import styles from "./console.module.css";

const validServiceTime = (s: BookingService) => s.ends_next_day ? s.closes_at <= s.opens_at && s.closes_at !== "24:00" : s.closes_at > s.opens_at;
const weekdays = [[1, "Mo"], [2, "Di"], [3, "Mi"], [4, "Do"], [5, "Fr"], [6, "Sa"], [0, "So"]] as const;

// Keep editable text separate from the numeric RPC contract. An empty field is
// an unfinished draft, not zero; native form validation runs before submit.
type SetupDraft = Omit<BookingSetup, "duration_minutes" | "max_party_size" | "tables"> & {
  duration_minutes: string;
  max_party_size: string;
  tables: (Omit<BookingSetup["tables"][number], "seats"> & { seats: string })[];
};

function editableSetup(snapshot: BookingSnapshot): SetupDraft {
  const setup = setupFromSnapshot(snapshot);
  return { ...setup, duration_minutes: String(setup.duration_minutes), max_party_size: String(setup.max_party_size), tables: setup.tables.map((table) => ({ ...table, seats: String(table.seats) })) };
}

export function setupFromSnapshot(snapshot: BookingSnapshot): BookingSetup {
  return {
    duration_minutes: snapshot.settings?.duration_minutes ?? 120,
    max_party_size: snapshot.settings?.max_party_size ?? 8,
    areas: snapshot.areas,
    tables: snapshot.tables,
    services: snapshot.services.map((s) => snapshot.capabilities?.special_hours && s.closes_at === "24:00" ? { ...s, closes_at: "00:00", ends_next_day: true } : s),
  };
}

export function SetupForm({ snapshot, busy, onSave, onDirty }: {
  snapshot: BookingSnapshot; busy: boolean;
  onSave: (setup: BookingSetup) => Promise<void>; onDirty: (value: boolean) => void;
}) {
  const [initial] = useState(() => editableSetup(snapshot));
  const [setup, setSetup] = useState<SetupDraft>(initial);
  const [section, setSection] = useState("basics");
  const [validation, setValidation] = useState<string | null>(null);
  const dirty = JSON.stringify(initial) !== JSON.stringify(setup);
  useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const invalid = form.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input:invalid,select:invalid,textarea:invalid");
    if (invalid) {
      setSection(invalid.closest<HTMLElement>("[data-section]")?.dataset.section ?? "basics");
      setValidation("Bitte vervollständige die markierte Angabe.");
      window.requestAnimationFrame(() => { invalid.focus(); invalid.reportValidity(); });
      return;
    }
    if (setup.services.some((service) => !service.weekdays.length || !validServiceTime(service))) {
      setSection("services"); setValidation("Wähle die Wochentage und ein gültiges Zeitfenster. Für Nachtservices wähle «Ende am Folgetag»."); return;
    }
    setValidation(null);
    await onSave({ ...setup, duration_minutes: Number(setup.duration_minutes), max_party_size: Number(setup.max_party_size), tables: setup.tables.map((table) => ({ ...table, seats: Number(table.seats) })) });
  }
  const field = (key: "duration_minutes" | "max_party_size", value: string) => setSetup((current) => ({ ...current, [key]: value }));

  return (
    <form onSubmit={submit} noValidate aria-label="Restaurant-Einrichtung">
      <div className={styles.setupHeading}><div><p className={styles.kicker}>DIE BASIS FÜR DEINEN SERVICE</p><h2>Restaurant einrichten</h2><p className={styles.help}>Deine Eingaben bleiben beim Wechsel der Bereiche erhalten.</p></div></div>
      <nav className={styles.setupSteps} aria-label="Einrichtungsschritte">
        {([["basics", "Grundlagen"], ["rooms", "Bereiche & Tische"], ["services", "Servicezeiten"]] as const).map(([key, label], index) => <button key={key} type="button" aria-current={section === key ? "step" : undefined} disabled={busy} onClick={() => setSection(key)}><span>{index + 1}</span>{label}</button>)}
      </nav>
      {validation && <p className={styles.error} role="alert">{validation}</p>}
      <fieldset disabled={busy} className={styles.fieldset}>
        <div className={styles.panel} data-section="basics" hidden={section !== "basics"}>
          <div className={styles.panelHeading}><div><p className={styles.kicker}>01 / GRUNDLAGEN</p><h2>Dein Restaurant</h2></div><span>Europe/Zurich</span></div>
          <p className={styles.help}>Reservierungen belegen einen Tisch für die gewählte Dauer. Pro Buchung wird in dieser ersten Version genau ein Tisch vergeben.</p>
          <div className={styles.fields}>
            <label>Aufenthaltsdauer in Minuten<input type="number" inputMode="numeric" min={30} max={480} step={1} required value={setup.duration_minutes} onChange={(e) => field("duration_minutes", e.target.value)} /></label>
            <label>Maximale Gruppengrösse<input type="number" inputMode="numeric" min={1} max={30} step={1} required value={setup.max_party_size} onChange={(e) => field("max_party_size", e.target.value)} /></label>
          </div>
        </div>

        <div className={styles.panel} data-section="rooms" hidden={section !== "rooms"}>
          <div className={styles.panelHeading}><div><p className={styles.kicker}>02 / RÄUME</p><h2>Bereiche</h2></div><button type="button" className={styles.secondary} disabled={setup.areas.length >= 30} onClick={() => setSetup((s) => ({ ...s, areas: [...s.areas, { id: crypto.randomUUID(), name: "", is_active: true }] }))}>+ Bereich</button></div>
          {!setup.areas.length && <p className={styles.help}>Lege zuerst einen Bereich an, zum Beispiel Gastraum oder Terrasse.</p>}
          {setup.areas.map((area, index) => <div className={styles.resourceRow} key={area.id}>
            <label>Bereich {index + 1}<input required maxLength={80} value={area.name} placeholder="Zum Beispiel Gastraum" onChange={(e) => setSetup((s) => ({ ...s, areas: s.areas.map((a) => a.id === area.id ? { ...a, name: e.target.value } : a) }))} /></label>
            <label className={styles.checkbox}><input type="checkbox" checked={area.is_active} onChange={(e) => setSetup((s) => ({ ...s, areas: s.areas.map((a) => a.id === area.id ? { ...a, is_active: e.target.checked } : a) }))} />Buchbar</label>
          </div>)}
        </div>

        <div className={styles.panel} data-section="rooms" hidden={section !== "rooms"}>
          <div className={styles.panelHeading}><div><p className={styles.kicker}>03 / KAPAZITÄT</p><h2>Tische</h2></div><button type="button" className={styles.secondary} disabled={!setup.areas.length || setup.tables.length >= 200} onClick={() => setSetup((s) => ({ ...s, tables: [...s.tables, { id: crypto.randomUUID(), area_id: s.areas[0].id, label: "", seats: "2", is_active: true }] }))}>+ Tisch</button></div>
          <p className={styles.help}>Deaktivierte Tische und Bereiche erhalten ihre bestehenden Reservierungen, nehmen aber keine neuen Buchungen an.</p>
          {!setup.tables.length && <p className={styles.help}>Noch keine Tische eingerichtet.</p>}
          {setup.tables.map((table, index) => <div className={styles.tableRow} key={table.id}>
            <label>Tisch {index + 1}<input required maxLength={40} value={table.label} placeholder="Tischname" onChange={(e) => setSetup((s) => ({ ...s, tables: s.tables.map((t) => t.id === table.id ? { ...t, label: e.target.value } : t) }))} /></label>
            <label>Bereich für Tisch {index + 1}<select value={table.area_id} onChange={(e) => setSetup((s) => ({ ...s, tables: s.tables.map((t) => t.id === table.id ? { ...t, area_id: e.target.value } : t) }))}>{setup.areas.map((area) => <option key={area.id} value={area.id}>{area.name || "Unbenannter Bereich"}{!area.is_active ? " (inaktiv)" : ""}</option>)}</select></label>
            <label>Plätze für Tisch {index + 1}<input type="number" inputMode="numeric" min={1} max={30} step={1} required value={table.seats} onChange={(e) => setSetup((s) => ({ ...s, tables: s.tables.map((t) => t.id === table.id ? { ...t, seats: e.target.value } : t) }))} /></label>
            <label className={styles.checkbox}><input type="checkbox" checked={table.is_active} onChange={(e) => setSetup((s) => ({ ...s, tables: s.tables.map((t) => t.id === table.id ? { ...t, is_active: e.target.checked } : t) }))} />Buchbar</label>
          </div>)}
        </div>

        <div className={styles.panel} data-section="services" hidden={section !== "services"}>
          <div className={styles.panelHeading}><div><p className={styles.kicker}>04 / VERFÜGBARKEIT</p><h2>Servicezeiten</h2></div><button type="button" className={styles.secondary} disabled={setup.services.length >= 30} onClick={() => setSetup((s) => ({ ...s, services: [...s.services, { id: crypto.randomUUID(), name: "", weekdays: [1, 2, 3, 4, 5, 6], opens_at: "18:00", closes_at: "23:00", interval_minutes: 30, is_active: true }] }))}>+ Service</button></div>
          <p className={styles.help}>Die gesamte Aufenthaltsdauer muss innerhalb des Service liegen. Services über Mitternacht und einzelne Schliessungstage folgen später.</p>
          {!setup.services.length && <p className={styles.help}>Noch keine Servicezeiten eingerichtet.</p>}
          {setup.services.map((service, index) => <div className={styles.service} key={service.id}>
            <div className={styles.fields}>
              <label>Service {index + 1}<input required maxLength={80} value={service.name} placeholder="Zum Beispiel Abendservice" onChange={(e) => setSetup((s) => ({ ...s, services: s.services.map((x) => x.id === service.id ? { ...x, name: e.target.value } : x) }))} /></label>
              <label className={styles.checkbox}><input type="checkbox" checked={service.is_active} onChange={(e) => setSetup((s) => ({ ...s, services: s.services.map((x) => x.id === service.id ? { ...x, is_active: e.target.checked } : x) }))} />Buchbar</label>
            </div>
            <div className={styles.weekdays} role="group" aria-label={`Wochentage für Service ${index + 1}`}>
              {weekdays.map(([day, label]) => <label className={styles.day} key={day}><input type="checkbox" checked={service.weekdays.includes(day)} onChange={(e) => setSetup((s) => ({ ...s, services: s.services.map((x) => x.id === service.id ? { ...x, weekdays: e.target.checked ? [...x.weekdays, day] : x.weekdays.filter((d) => d !== day) } : x) }))} /><span>{label}</span></label>)}
            </div>
            {!service.weekdays.length && <p className={styles.help}>Wähle mindestens einen Wochentag.</p>}
            <div className={styles.fields}>
              <label>Beginn für Service {index + 1}<input type="time" required value={service.opens_at} onChange={(e) => setSetup((s) => ({ ...s, services: s.services.map((x) => x.id === service.id ? { ...x, opens_at: e.target.value } : x) }))} /></label>
              <label>Ende für Service {index + 1}<input type="time" required value={service.closes_at} onChange={(e) => setSetup((s) => ({ ...s, services: s.services.map((x) => x.id === service.id ? { ...x, closes_at: e.target.value } : x) }))} /></label>
              <label>Buchungstakt für Service {index + 1}<select value={service.interval_minutes} onChange={(e) => setSetup((s) => ({ ...s, services: s.services.map((x) => x.id === service.id ? { ...x, interval_minutes: Number(e.target.value) } : x) }))}>{[15, 30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{m} Minuten</option>)}</select></label>
            </div>
            {snapshot.capabilities?.special_hours && <><label className={styles.checkbox}><input type="checkbox" checked={!!service.ends_next_day} onChange={(event) => setSetup((s) => ({ ...s, services: s.services.map((x) => x.id !== service.id ? x : { ...x, ends_next_day: event.target.checked, closes_at: event.target.checked ? (x.closes_at <= x.opens_at && x.closes_at !== "24:00" ? x.closes_at : "00:00") : (x.closes_at > x.opens_at ? x.closes_at : "23:59") }) }))} />Ende am Folgetag für Service {index + 1}</label><p className={styles.help}>Die Wochentage beziehen sich auf den Servicebeginn. Buchungen nach Mitternacht erscheinen im Tagesbuch des Folgetags.</p></>}
            {!validServiceTime(service) && <p className={styles.help}>Prüfe Beginn, Ende und Folgetag. Ein Service umfasst höchstens 24 Ortsstunden.</p>}
          </div>)}
        </div>
        <div className={styles.saveBar}><span>{dirty ? "Ungespeicherte Änderungen" : snapshot.settings ? "Einrichtung gespeichert" : "Einrichtung noch nicht gespeichert"}</span><div className={styles.actions}>
          {dirty && <button type="button" className={styles.secondary} onClick={() => { setSetup(initial); setValidation(null); }}>Änderungen verwerfen</button>}
          <button className={styles.primary} disabled={!dirty && !!snapshot.settings}>{busy ? "Speichert …" : "Einrichtung speichern"}</button>
        </div></div>
      </fieldset>
    </form>
  );
}
