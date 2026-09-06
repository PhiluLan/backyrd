"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { formatAdminError, logAdminError } from "@/lib/adminErrors";
import { buildVenuePayload, filterEventSpots, validateEventInput, venueFieldsAfterTyping, type EventSpot } from "@/lib/eventAdmin";

const CATEGORIES = ["MUSIC", "NIGHTLIFE", "ART", "THEATRE", "FILM", "FOOD_DRINK", "FAMILY", "SPORT", "ACTIVITY", "LEISURE", "MARKET", "WORKSHOP", "COMMUNITY", "OTHER"];
type Occurrence = { id: string; start_at: string; end_at: string | null; status: string; is_recurrence_exception: boolean };
type FormState = {
  title: string; description: string; startDate: string; startTime: string; endTime: string; venueName: string;
  address: string; categories: string[]; minimumAge: string; family: string; price: string; free: boolean;
  organizer: string; externalUrl: string; status: string; frequency: string; interval: string; until: string;
  count: string; recurring: boolean; recurrenceSummary: string; spotId: string; imagePath: string;
};

const blank: FormState = {
  title: "", description: "", startDate: "2026-09-14", startTime: "16:00", endTime: "23:00", venueName: "",
  address: "", categories: ["OTHER"], minimumAge: "", family: "unknown", price: "", free: false, organizer: "",
  externalUrl: "", status: "DRAFT", frequency: "ONCE", interval: "1", until: "", count: "", recurring: false,
  recurrenceSummary: "", spotId: "", imagePath: "",
};

export default function EventEditor({ eventId }: { eventId?: string }) {
  const router = useRouter();
  const listboxId = useId();
  const comboboxRef = useRef<HTMLDivElement>(null);
  const [form, setForm] = useState<FormState>(blank);
  const [spots, setSpots] = useState<EventSpot[]>([]);
  const [spotsLoading, setSpotsLoading] = useState(true);
  const [spotsError, setSpotsError] = useState("");
  const [venueQuery, setVenueQuery] = useState("");
  const [debouncedVenueQuery, setDebouncedVenueQuery] = useState("");
  const [comboboxOpen, setComboboxOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [occurrences, setOccurrences] = useState<Occurrence[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));
  const matches = useMemo(() => filterEventSpots(spots, debouncedVenueQuery, 8), [spots, debouncedVenueQuery]);
  const selectedSpot = spots.find((spot) => spot.id === form.spotId) ?? null;

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedVenueQuery(venueQuery), 140);
    return () => window.clearTimeout(timer);
  }, [venueQuery]);

  useEffect(() => {
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!comboboxRef.current?.contains(event.target as Node)) setComboboxOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, []);

  useEffect(() => {
    void (async () => {
      setSpotsLoading(true);
      const { data: spotRows, error: spotError } = await supabase.from("spots").select("id,name,address,city").eq("status", "approved").order("name").limit(2000);
      if (spotError) {
        logAdminError("Spots laden", spotError);
        setSpotsError("Backyrd Spots konnten nicht geladen werden. Ein freier Veranstaltungsort ist weiterhin möglich.");
      }
      setSpots((spotRows ?? []) as EventSpot[]);
      setSpotsLoading(false);
      if (!eventId) return;

      const { data: event, error: eventError } = await supabase.from("events_v1").select("*").eq("id", eventId).single();
      if (eventError) {
        logAdminError("Event laden", eventError, { eventId });
        setError(formatAdminError(eventError, "Das Event konnte nicht geladen werden."));
        return;
      }
      let venue: { name: string; address_line: string | null; matched_spot_id: string | null } | null = null;
      if (event.primary_venue_id) {
        const { data: venueRow, error: venueError } = await supabase.from("event_venues_v1").select("name,address_line,matched_spot_id").eq("id", event.primary_venue_id).single();
        if (venueError) logAdminError("Veranstaltungsort laden", venueError, { eventId, venueId: event.primary_venue_id });
        venue = venueRow;
      }
      const rule = event.recurrence_rule ?? {};
      const venueName = venue?.name ?? "";
      setVenueQuery(venueName);
      setForm({
        ...blank, title: event.title, description: event.short_description ?? "", venueName,
        address: event.manual_address ?? venue?.address_line ?? "", categories: event.categories ?? [event.category],
        minimumAge: event.minimum_age?.toString() ?? "", family: event.family_friendly === null ? "unknown" : event.family_friendly ? "yes" : "no",
        price: event.price_min?.toString() ?? "", free: event.is_free === true, organizer: event.organizer ?? "",
        externalUrl: event.external_url ?? "", status: event.status, frequency: rule.frequency ?? "ONCE",
        interval: String(rule.interval ?? 1), until: rule.until ?? "", count: rule.count ? String(rule.count) : "",
        recurring: event.is_recurring, recurrenceSummary: event.recurrence_summary ?? "", spotId: venue?.matched_spot_id ?? "",
        imagePath: event.image_storage_path ?? "", startDate: rule.startDate ?? blank.startDate,
        startTime: rule.startTime ?? blank.startTime, endTime: rule.endTime ?? blank.endTime,
      });
      const { data: occurrenceRows, error: occurrenceError } = await supabase.from("event_occurrences_v1").select("id,start_at,end_at,status,is_recurrence_exception").eq("event_id", eventId).order("start_at");
      if (occurrenceError) logAdminError("Occurrences laden", occurrenceError, { eventId });
      setOccurrences((occurrenceRows ?? []) as Occurrence[]);
    })();
  }, [eventId]);

  function changeVenueQuery(value: string) {
    setVenueQuery(value);
    setForm((current) => ({ ...current, ...venueFieldsAfterTyping(value) }));
    setComboboxOpen(true);
    setHighlightedIndex(-1);
  }

  function chooseSpot(spot: EventSpot) {
    setVenueQuery(spot.name);
    setForm((current) => ({ ...current, venueName: spot.name, spotId: spot.id, address: spot.address ?? current.address }));
    setComboboxOpen(false);
    setHighlightedIndex(-1);
  }

  function chooseFreeVenue() {
    const venueName = venueQuery.trim();
    if (!venueName) return;
    setVenueQuery(venueName);
    setForm((current) => ({ ...current, venueName, spotId: "" }));
    setComboboxOpen(false);
    setHighlightedIndex(-1);
  }

  function onComboboxKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") return setComboboxOpen(false);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setComboboxOpen(true);
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setHighlightedIndex((current) => Math.max(-1, Math.min(matches.length - 1, current + direction)));
    }
    if (event.key === "Enter" && comboboxOpen) {
      event.preventDefault();
      if (highlightedIndex >= 0 && matches[highlightedIndex]) chooseSpot(matches[highlightedIndex]);
      else chooseFreeVenue();
    }
  }

  async function save(nextStatus?: string) {
    const validationError = validateEventInput(form);
    if (validationError) return setError(validationError);
    if (form.spotId && !selectedSpot) return setError("Der verknüpfte Backyrd Spot konnte nicht geladen werden. Bitte wähle ihn erneut aus oder verwende einen freien Veranstaltungsort.");
    setBusy(true);
    setError("");
    const id = eventId ?? crypto.randomUUID();
    const status = nextStatus ?? form.status;
    try {
      const now = new Date().toISOString();
      let venueId: string | null = null;
      const venuePayload = buildVenuePayload({ eventId: id, selectedSpot, venueName: form.venueName, address: form.address, now });
      if (venuePayload) {
        const { data: venue, error: venueError } = await supabase.from("event_venues_v1").upsert(venuePayload, { onConflict: "source_id,source_venue_id" }).select("id").single();
        if (venueError) throw venueError;
        venueId = venue.id;
      }
      let imagePath = form.imagePath;
      if (file) {
        imagePath = `${id}/${crypto.randomUUID()}-${file.name.replace(/[^a-z0-9.]/gi, "-")}`;
        const { error: uploadError } = await supabase.storage.from("event-images").upload(imagePath, file, { upsert: false });
        if (uploadError) throw uploadError;
      }
      const rule = {
        frequency: form.recurring ? form.frequency : "ONCE", interval: Number(form.interval) || 1,
        weekdays: [new Date(`${form.startDate}T12:00:00Z`).getUTCDay() || 7], startDate: form.startDate,
        startTime: form.startTime, endTime: form.endTime, until: form.until || null, count: form.count ? Number(form.count) : null,
      };
      const payload = {
        id, primary_source_id: "manual_admin", primary_source_event_id: id, title: form.title.trim(),
        short_description: form.description.trim() || null, category: form.categories[0], categories: form.categories, status,
        is_free: form.free, price_min: form.free ? 0 : form.price ? Number(form.price) : null,
        price_currency: form.free || form.price ? "CHF" : null, source_url: form.externalUrl || "https://backyrd.com/events",
        external_url: form.externalUrl || null, image_storage_path: imagePath || null,
        image_credit: imagePath ? "Vom Founder für dieses Event hochgeladen" : null, image_rights_verified: Boolean(imagePath),
        dedupe_key: `manual:${id}`, provenance: { source: "MANUAL_ADMIN" }, last_seen_at: now,
        published_at: status === "PUBLISHED" || status === "CANCELLED" ? now : null,
        minimum_age: form.minimumAge ? Number(form.minimumAge) : null,
        family_friendly: form.family === "unknown" ? null : form.family === "yes", organizer: form.organizer || null,
        is_recurring: form.recurring, recurrence_rule: rule, recurrence_summary: form.recurrenceSummary || null,
        manual_address: form.address.trim() || selectedSpot?.address || null, primary_venue_id: venueId,
      };
      const { error: eventError } = await supabase.from("events_v1").upsert(payload);
      if (eventError) throw eventError;
      const { error: recurrenceError } = await supabase.rpc("regenerate_manual_event_occurrences_v1", { p_event_id: id });
      if (recurrenceError) throw recurrenceError;
      if (!eventId) router.replace(`/events/${id}/edit`);
      else window.location.reload();
    } catch (saveError) {
      logAdminError("Event speichern", saveError, { eventId: id, requestedStatus: status });
      setError(formatAdminError(saveError));
    } finally {
      setBusy(false);
    }
  }

  async function cancelOccurrence(id: string) {
    const { error: updateError } = await supabase.from("event_occurrences_v1").update({ status: "CANCELLED", is_recurrence_exception: true, published_at: new Date().toISOString() }).eq("id", id);
    if (updateError) {
      logAdminError("Occurrence absagen", updateError, { occurrenceId: id });
      return setError(formatAdminError(updateError, "Der einzelne Termin konnte nicht abgesagt werden."));
    }
    window.location.reload();
  }

  async function editOccurrence(occurrence: Occurrence) {
    const nextStart = window.prompt("Neuer Start (ISO 8601)", occurrence.start_at);
    if (!nextStart) return;
    const nextEnd = window.prompt("Neues Ende (ISO 8601)", occurrence.end_at ?? "");
    if (!nextEnd) return;
    const start = new Date(nextStart), end = new Date(nextEnd);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return setError("Der einzelne Termin braucht einen gültigen Start und ein Ende nach dem Start.");
    const { error: updateError } = await supabase.from("event_occurrences_v1").update({ start_at: start.toISOString(), end_at: end.toISOString(), is_recurrence_exception: true, exception_note: "MANUAL_ADMIN: einzelner Termin geändert" }).eq("id", occurrence.id);
    if (updateError) {
      logAdminError("Occurrence ändern", updateError, { occurrenceId: occurrence.id });
      return setError(formatAdminError(updateError, "Der einzelne Termin konnte nicht geändert werden."));
    }
    window.location.reload();
  }

  return <div className="bi-page">
    <div className="bi-back"><Link href="/events">← Events</Link></div>
    <header className="bi-header">
      <div><div className="bi-eyebrow">MANUAL ADMIN</div><h1>{eventId ? "Event bearbeiten" : "Neues Event"}</h1><p>Event und konkrete Occurrences bleiben getrennt.</p></div>
      <div className="bi-detailActions"><button disabled={busy} className="bi-actionButton" onClick={() => save("DRAFT")}>Entwurf</button><button disabled={busy} className="bi-primaryButton" onClick={() => save("PUBLISHED")}>Veröffentlichen</button>{eventId && <button disabled={busy} className="bi-actionButton" onClick={() => save("CANCELLED")}>Absagen</button>}</div>
    </header>
    {error && <div className="bi-error" role="alert">{error}</div>}
    <div className="bi-gridTwo"><section className="bi-card eventForm">
      <label>Titel<input value={form.title} onChange={(event) => set("title", event.target.value)} /></label>
      <label>Beschreibung<textarea rows={5} maxLength={600} value={form.description} onChange={(event) => set("description", event.target.value)} /></label>
      <div className="eventGrid"><label>Startdatum<input type="date" value={form.startDate} onChange={(event) => set("startDate", event.target.value)} /></label><label>Startzeit<input type="time" value={form.startTime} onChange={(event) => set("startTime", event.target.value)} /></label><label>Endzeit<input type="time" value={form.endTime} onChange={(event) => set("endTime", event.target.value)} /></label></div>
      <label>Veranstaltungsort</label>
      <div className="eventVenueCombobox" ref={comboboxRef}>
        <input aria-activedescendant={highlightedIndex >= 0 ? `${listboxId}-${highlightedIndex}` : undefined} aria-autocomplete="list" aria-controls={listboxId} aria-expanded={comboboxOpen} aria-label="Backyrd Spot oder freier Veranstaltungsort" autoComplete="off" placeholder="Spotname oder Adresse suchen" role="combobox" value={venueQuery} onChange={(event) => changeVenueQuery(event.target.value)} onFocus={() => setComboboxOpen(true)} onKeyDown={onComboboxKeyDown} />
        {selectedSpot && <div className="eventVenueSelection"><span>Backyrd Spot</span><strong>{selectedSpot.name}</strong><button type="button" onClick={() => changeVenueQuery("")} aria-label="Spot-Verknüpfung entfernen">×</button></div>}
        {!selectedSpot && form.venueName.trim() && !comboboxOpen && <div className="eventVenueSelection free"><span>Freier Veranstaltungsort</span><strong>{form.venueName}</strong><button type="button" onClick={() => changeVenueQuery("")} aria-label="Veranstaltungsort entfernen">×</button></div>}
        {comboboxOpen && <div className="eventVenueMenu" id={listboxId} role="listbox">
          {spotsLoading && <div className="eventVenueState">Spots werden geladen …</div>}
          {!spotsLoading && spotsError && <div className="eventVenueState error">{spotsError}</div>}
          {!spotsLoading && matches.length === 0 && !spotsError && <div className="eventVenueState">Keine Backyrd Spots gefunden.</div>}
          {!spotsLoading && matches.map((spot, index) => <button type="button" role="option" aria-selected={spot.id === form.spotId} className={index === highlightedIndex ? "highlighted" : ""} id={`${listboxId}-${index}`} key={spot.id} onPointerDown={(event) => event.preventDefault()} onClick={() => chooseSpot(spot)}><strong>{spot.name}</strong><span>{[spot.address, spot.city].filter(Boolean).join(" · ") || "Keine Adresse hinterlegt"}</span></button>)}
          {venueQuery.trim() && <button type="button" className="eventVenueFree" onPointerDown={(event) => event.preventDefault()} onClick={chooseFreeVenue}><strong>„{venueQuery.trim()}“ als freien Veranstaltungsort verwenden</strong><span>Es wird kein neuer Backyrd Spot angelegt.</span></button>}
        </div>}
      </div>
      <label>Adresse<input value={form.address} onChange={(event) => set("address", event.target.value)} placeholder="Adresse bleibt frei editierbar" /></label>
      <fieldset><legend>Kategorien</legend><div className="eventChecks">{CATEGORIES.map((category) => <label key={category}><input type="checkbox" checked={form.categories.includes(category)} onChange={(event) => set("categories", event.target.checked ? [...form.categories.filter((entry) => entry !== "OTHER"), category] : form.categories.filter((entry) => entry !== category))} />{category}</label>)}</div></fieldset>
      <div className="eventGrid"><label>Mindestalter<input type="number" min="0" max="99" value={form.minimumAge} onChange={(event) => set("minimumAge", event.target.value)} /></label><label>Familiengeeignet<select value={form.family} onChange={(event) => set("family", event.target.value)}><option value="unknown">Unbekannt</option><option value="yes">Ja</option><option value="no">Nein</option></select></label><label><input type="checkbox" checked={form.free} onChange={(event) => set("free", event.target.checked)} /> Gratis</label><label>Preis CHF<input type="number" min="0" disabled={form.free} value={form.price} onChange={(event) => set("price", event.target.value)} /></label></div>
      <label>Veranstalter<input value={form.organizer} onChange={(event) => set("organizer", event.target.value)} /></label><label>Externer Link<input type="url" value={form.externalUrl} onChange={(event) => set("externalUrl", event.target.value)} /></label><label>Eventbild<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
      <label><input type="checkbox" checked={form.recurring} onChange={(event) => set("recurring", event.target.checked)} /> Wiederkehrend</label>
      {form.recurring && <><div className="eventGrid"><label>Rhythmus<select value={form.frequency} onChange={(event) => set("frequency", event.target.value)}><option value="DAILY">Täglich</option><option value="WEEKLY">Wöchentlich</option><option value="MONTHLY">Monatlich</option></select></label><label>Alle X Wochen/Monate<input type="number" min="1" value={form.interval} onChange={(event) => set("interval", event.target.value)} /></label><label>Enddatum<input type="date" value={form.until} onChange={(event) => set("until", event.target.value)} /></label><label>Anzahl<input type="number" min="1" value={form.count} onChange={(event) => set("count", event.target.value)} /></label></div><label>Wiederholungsinfo<input value={form.recurrenceSummary} onChange={(event) => set("recurrenceSummary", event.target.value)} /></label></>}
      <button disabled={busy} className="bi-primaryButton" onClick={() => save()}>{busy ? "Speichert …" : "Speichern & Termine erzeugen"}</button>
    </section><aside><section className="bi-card"><div className="bi-kicker">VORSCHAU</div><h2>{form.title || "Unbenanntes Event"}</h2><p>{form.description || "Noch keine Beschreibung."}</p><strong>{form.startDate} · {form.startTime}–{form.endTime}</strong><p>{form.free ? "Gratis" : form.price ? `CHF ${form.price}` : "Preis unbekannt"} · {form.categories.join(" · ")}</p></section>{eventId && <section className="bi-card eventOccurrences"><h3>Occurrences</h3>{occurrences.map((occurrence) => <div className="bi-rowItem" key={occurrence.id}><div><strong>{new Date(occurrence.start_at).toLocaleString("de-CH")}</strong><small>{occurrence.status}{occurrence.is_recurrence_exception ? " · Exception" : ""}</small></div><div className="bi-detailActions"><button onClick={() => editOccurrence(occurrence)}>Zeit ändern</button><button onClick={() => cancelOccurrence(occurrence.id)}>Termin absagen</button></div></div>)}</section>}</aside></div>
  </div>;
}
