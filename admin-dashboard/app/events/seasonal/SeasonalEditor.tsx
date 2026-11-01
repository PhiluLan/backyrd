"use client";
import Link from "next/link";
import styles from "./seasonal.module.css";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { formatAdminError } from "@/lib/adminErrors";
import preset from "../../../data/events/basler-herbstmesse-2026.json";
import type {
  SeasonalEditionInput,
  SeasonalPlace,
} from "../../../../packages/shared/src/seasonal-events";

const weekdays = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
export default function SeasonalEditor({ id }: { id?: string }) {
  const [form, setForm] = useState<SeasonalEditionInput>(
    () => ({ ...preset, id: id ?? preset.id }) as SeasonalEditionInput,
  );
  const [expected, setExpected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    let active = true;
    void supabase
      .from("events_v1")
      .select("seasonal_config,updated_at")
      .eq("id", id ?? preset.id)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (!active) return;
        if (err) {
          setError(
            formatAdminError(err, "Die Ausgabe konnte nicht geladen werden."),
          );
          setLoadFailed(true);
        } else if (data?.seasonal_config) {
          setForm(data.seasonal_config as SeasonalEditionInput);
          setExpected(data.updated_at);
        } else if (id) {
          setError("Diese Ausgabe wurde nicht gefunden.");
          setLoadFailed(true);
        }
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);
  const set = <K extends keyof SeasonalEditionInput>(
    key: K,
    value: SeasonalEditionInput[K],
  ) => {
    setForm((current) => ({ ...current, [key]: value }));
    setConfirmed(false);
    setMessage("");
  };
  const changePlace = (index: number, change: Partial<SeasonalPlace>) =>
    set(
      "places",
      form.places.map((place, i) =>
        i === index ? { ...place, ...change } : place,
      ),
    );
  async function save(publish: boolean) {
    if (loadFailed) {
      setError("Bitte lade die Ausgabe zuerst erfolgreich neu.");
      return;
    }
    if (publish && !confirmed) {
      setError(
        "Bitte bestätige zuerst, dass du die Quellen und die Angaben geprüft hast.",
      );
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const { data, error: err } = await supabase.rpc(
        "admin_save_seasonal_edition_v1",
        {
          p_input: {
            ...form,
            activities: form.activities
              .map((value) => value.trim())
              .filter(Boolean),
            checkedAt: confirmed ? new Date().toISOString() : form.checkedAt,
          },
          p_publish: publish,
          p_expected_updated_at: expected,
        },
      );
      if (err) throw err;
      if (!data || data.id !== form.id || typeof data.updatedAt !== "string")
        throw Error(
          "Die Speicherung wurde nicht bestätigt. Bitte lade die Seite neu und prüfe die Ausgabe.",
        );
      setExpected(data.updatedAt);
      setMessage(
        publish
          ? `Veröffentlicht: ${data.places} Schauplätze mit ${data.occurrences} bestätigten Tageszeiten. Die App zeigt sie nur zu diesen Zeiten als verfügbar.`
          : "Entwurf gespeichert. Er ist noch nicht öffentlich sichtbar.",
      );
      window.history.replaceState(null, "", `/events/seasonal/${form.id}`);
    } catch (err) {
      setError(
        formatAdminError(
          err,
          "Die Ausgabe konnte nicht gespeichert werden. Deine Eingaben bleiben erhalten.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <p role="status">Ausgabe wird geladen …</p>;
  return (
    <div className={`bi-page ${styles.page}`}>
      <Link href="/events">← Veranstaltungen</Link>
      <header className="bi-header">
        <div>
          <div className="bi-eyebrow">SAISONALE VERANSTALTUNG</div>
          <h1>{form.title}</h1>
          <p>
            Eine Ausgabe, mehrere Schauplätze. Prüfe die Angaben und
            veröffentliche danach die bestätigten Tageszeiten.
          </p>
        </div>
      </header>
      {error && (
        <div role="alert" className="bi-error">
          {error}
        </div>
      )}
      {message && (
        <div role="status" className="bi-card">
          {message}
        </div>
      )}
      <section className="bi-card">
        <h2>Die Ausgabe</h2>
        <label>
          Veranstaltung
          <input
            className="bi-input"
            value={form.seriesName}
            onChange={(e) => set("seriesName", e.target.value)}
          />
        </label>
        <label>
          Titel
          <input
            className="bi-input"
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
          />
        </label>
        <label>
          Jahr
          <input
            type="number"
            className="bi-input"
            value={form.year}
            onChange={(e) => set("year", Number(e.target.value))}
          />
        </label>
        <label>
          Beschreibung
          <textarea
            className="bi-input"
            maxLength={600}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </label>
        <label>
          Passend für Familien
          <select
            className="bi-select"
            value={
              form.familyFriendly === true
                ? "yes"
                : form.familyFriendly === false
                  ? "no"
                  : "unknown"
            }
            onChange={(e) =>
              set(
                "familyFriendly",
                e.target.value === "unknown" ? null : e.target.value === "yes",
              )
            }
          >
            <option value="yes">Ja, offiziell belegt</option>
            <option value="no">Nein</option>
            <option value="unknown">Noch nicht bestätigt</option>
          </select>
        </label>
        <label>
          Belegte Angebote
          <textarea
            className="bi-input"
            value={form.activities.join("\n")}
            onChange={(e) => set("activities", e.target.value.split("\n"))}
          />
        </label>
        <label>
          Offizielle Quelle
          <input
            type="url"
            className="bi-input"
            value={form.sourceUrl}
            onChange={(e) => set("sourceUrl", e.target.value)}
          />
        </label>
        <a href={form.sourceUrl} target="_blank" rel="noreferrer">
          Offizielle Angaben prüfen ↗
        </a>
        <label>
          Hinweis zu Preisen und Teilnahme
          <textarea
            className="bi-input"
            maxLength={500}
            value={form.admissionNote}
            onChange={(e) => set("admissionNote", e.target.value)}
          />
        </label>
        <p>
          Die nächste Jahresausgabe wird nicht automatisch veröffentlicht.
          Termine, Öffnungszeiten und Angebote müssen neu bestätigt werden.
        </p>
      </section>
      <h2>{form.places.length} Schauplätze prüfen</h2>
      <p>
        Öffnungszeiten gelten nur innerhalb des jeweiligen Zeitraums. Einzelne
        Abweichungen stehen darunter.
      </p>
      {form.places.map((place, index) => (
        <details key={place.key} className="bi-card">
          <summary
            style={{
              cursor: "pointer",
              minHeight: 44,
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              alignItems: "center",
            }}
          >
            <strong>{place.name}</strong>
            <span>
              {place.startDate && place.endDate
                ? `${new Intl.DateTimeFormat("de-CH").format(new Date(place.startDate + "T12:00:00Z"))} – ${new Intl.DateTimeFormat("de-CH").format(new Date(place.endDate + "T12:00:00Z"))}`
                : "Zeitraum noch bestätigen"}{" "}
              ·{" "}
              {place.environment === "INDOOR"
                ? "Drinnen"
                : place.environment === "OUTDOOR"
                  ? "Draussen"
                  : "Bereich noch offen"}
            </span>
            <span>Angaben prüfen und bearbeiten</span>
          </summary>
          <p>{place.description}</p>
          <label>
            Adresse
            <input
              className="bi-input"
              value={place.address}
              onChange={(e) =>
                changePlace(index, {
                  address: e.target.value,
                  latitude: null,
                  longitude: null,
                })
              }
            />
          </label>
          <label>
            Erster Tag
            <input
              type="date"
              className="bi-input"
              value={place.startDate}
              onChange={(e) =>
                changePlace(index, { startDate: e.target.value })
              }
            />
          </label>
          <label>
            Letzter Tag
            <input
              type="date"
              className="bi-input"
              value={place.endDate}
              onChange={(e) => changePlace(index, { endDate: e.target.value })}
            />
          </label>
          <label>
            Bereich
            <select
              className="bi-select"
              value={place.environment}
              onChange={(e) =>
                changePlace(index, {
                  environment: e.target.value as SeasonalPlace["environment"],
                })
              }
            >
              <option value="INDOOR">Drinnen</option>
              <option value="OUTDOOR">Draussen</option>
              <option value="UNKNOWN">Noch nicht bestätigt</option>
            </select>
          </label>
          {place.hours.map((hours, h) => (
            <div
              key={h}
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 12,
                alignItems: "center",
                marginBlock: 14,
              }}
            >
              <strong>
                {hours.weekdays.map((d) => weekdays[d - 1]).join(" · ")}
              </strong>
              <label>
                Von
                <input
                  aria-label={`${place.name}, ${hours.weekdays.map((d) => weekdays[d - 1]).join(", ")}, von`}
                  type="time"
                  value={hours.start}
                  onChange={(e) =>
                    changePlace(index, {
                      hours: place.hours.map((row, r) =>
                        r === h ? { ...row, start: e.target.value } : row,
                      ),
                    })
                  }
                />
              </label>
              <label>
                Bis
                <input
                  aria-label={`${place.name}, ${hours.weekdays.map((d) => weekdays[d - 1]).join(", ")}, bis`}
                  type="time"
                  value={hours.end}
                  onChange={(e) =>
                    changePlace(index, {
                      hours: place.hours.map((row, r) =>
                        r === h ? { ...row, end: e.target.value } : row,
                      ),
                    })
                  }
                />
              </label>
            </div>
          ))}
          {place.exceptions.map((exception, x) => (
            <div key={x}>
              <strong>
                Abweichung am{" "}
                <input
                  type="date"
                  aria-label={`${place.name}, abweichender Tag`}
                  value={exception.date}
                  onChange={(e) =>
                    changePlace(index, {
                      exceptions: place.exceptions.map((row, r) =>
                        r === x ? { ...row, date: e.target.value } : row,
                      ),
                    })
                  }
                />
              </strong>
              <label>
                <input
                  type="checkbox"
                  checked={exception.closed}
                  onChange={(e) =>
                    changePlace(index, {
                      exceptions: place.exceptions.map((row, r) =>
                        r === x ? { ...row, closed: e.target.checked } : row,
                      ),
                    })
                  }
                />{" "}
                Geschlossen
              </label>
              {!exception.closed && (
                <>
                  <label>
                    Von
                    <input
                      type="time"
                      value={exception.start}
                      onChange={(e) =>
                        changePlace(index, {
                          exceptions: place.exceptions.map((row, r) =>
                            r === x ? { ...row, start: e.target.value } : row,
                          ),
                        })
                      }
                    />
                  </label>
                  <label>
                    Bis
                    <input
                      type="time"
                      value={exception.end}
                      onChange={(e) =>
                        changePlace(index, {
                          exceptions: place.exceptions.map((row, r) =>
                            r === x ? { ...row, end: e.target.value } : row,
                          ),
                        })
                      }
                    />
                  </label>
                </>
              )}
            </div>
          ))}
          <a href={place.sourceUrl} target="_blank" rel="noreferrer">
            Quelle für {place.name} prüfen ↗
          </a>
          <button
            className="bi-secondaryButton"
            onClick={() =>
              changePlace(index, {
                exceptions: [
                  ...place.exceptions,
                  { date: "", closed: false, start: "", end: "" },
                ],
              })
            }
          >
            Abweichenden Tag hinzufügen
          </button>
        </details>
      ))}
      <section className="bi-card">
        <h2>Speichern oder veröffentlichen</h2>
        <button
          className="bi-secondaryButton"
          disabled={busy || loadFailed}
          onClick={() => {
            setForm((current) => ({
              ...current,
              id: crypto.randomUUID(),
              year: current.year + 1,
              title: `${current.seriesName} ${current.year + 1}`,
              checkedAt: "",
              places: current.places.map((place) => ({
                ...place,
                startDate: "",
                endDate: "",
                hours: place.hours.map((hours) => ({
                  ...hours,
                  start: "",
                  end: "",
                })),
                exceptions: [],
              })),
            }));
            setExpected(null);
            setConfirmed(false);
            setMessage(
              "Neue Ausgabe als unbestätigter Entwurf vorbereitet. Bitte aktuelle Termine und Tageszeiten eintragen.",
            );
            window.history.replaceState(null, "", "/events/seasonal");
          }}
        >
          Nächste Ausgabe vorbereiten
        </button>
        <label style={{ display: "flex", gap: 12, alignItems: "start" }}>
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          Ich habe die offiziellen Quellen, die Zeiträume und die Öffnungszeiten
          dieser Ausgabe geprüft. Unbekannte Preise und Altersregeln bleiben
          offen.
        </label>
        <div
          style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 20 }}
        >
          <button
            className="bi-secondaryButton"
            disabled={busy || loadFailed}
            onClick={() => void save(false)}
          >
            Entwurf speichern
          </button>
          <button
            className="bi-primaryButton"
            disabled={busy || !confirmed || loadFailed}
            onClick={() => void save(true)}
          >
            {busy ? "Wird gespeichert …" : "Ausgabe veröffentlichen"}
          </button>
        </div>
      </section>
    </div>
  );
}
