"use client";

import { useParams, useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  getOwnerSpotDetail,
  parseCsvTags,
  requireOwnerSession,
  tagsToCsv,
  updateOwnerSpotIntelligence,
  updateOwnerSpotProfile,
  type OwnerSpotDetail,
} from "@/lib/owner-api";
import { OwnerShell } from "@/components/owner/owner-shell";

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-white/55">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none transition placeholder:text-white/25 focus:border-white/30"
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-white/55">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={5}
        className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none transition placeholder:text-white/25 focus:border-white/30"
      />
    </label>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | null;
  onChange: (value: boolean | null) => void;
}) {
  return (
    <div>
      <div className="text-sm font-semibold text-white/55">{label}</div>
      <div className="mt-2 flex gap-2">
        {[
          ["Ja", true],
          ["Nein", false],
          ["Offen", null],
        ].map(([text, option]) => (
          <button
            key={String(text)}
            type="button"
            onClick={() => onChange(option as boolean | null)}
            className={[
              "rounded-full border px-4 py-2 text-sm font-semibold transition",
              value === option
                ? "border-white bg-white text-black"
                : "border-white/10 bg-black/30 text-white/65 hover:bg-white/10 hover:text-white",
            ].join(" ")}
          >
            {String(text)}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function OwnerSpotEditPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const spotId = params.id;

  const [detail, setDetail] = useState<OwnerSpotDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("Schweiz");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [email, setEmail] = useState("");
  const [priceLevel, setPriceLevel] = useState("");
  const [ownerDescription, setOwnerDescription] = useState("");
  const [ownerKeywords, setOwnerKeywords] = useState("");

  const [bestFor, setBestFor] = useState("");
  const [occasionTags, setOccasionTags] = useState("");
  const [atmosphereTags, setAtmosphereTags] = useState("");
  const [avoidIfTags, setAvoidIfTags] = useState("");
  const [goodForTime, setGoodForTime] = useState("");
  const [noiseLevel, setNoiseLevel] = useState("");
  const [crowdType, setCrowdType] = useState("");
  const [dressCode, setDressCode] = useState("");
  const [reservationRecommended, setReservationRecommended] = useState<boolean | null>(null);
  const [averageDurationMinutes, setAverageDurationMinutes] = useState("");
  const [signatureItems, setSignatureItems] = useState("");
  const [specialNotes, setSpecialNotes] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        setLoading(true);
        setMessage(null);

        const session = await requireOwnerSession();
        if (!session) return;

        const data = await getOwnerSpotDetail(spotId);
        if (!active) return;

        setDetail(data);

        setName(data.spot.name ?? "");
        setAddress(data.spot.address ?? "");
        setCity(data.spot.city ?? "");
        setCountry(data.spot.country ?? "Schweiz");
        setPhone(data.spot.phone ?? "");
        setWebsite(data.spot.website ?? "");
        setEmail(data.spot.email ?? "");
        setPriceLevel(data.spot.price_level ? String(data.spot.price_level) : "");

        setOwnerDescription(data.description.owner_description ?? "");
        setOwnerKeywords(tagsToCsv(data.description.owner_keywords));

        setBestFor(tagsToCsv(data.intelligence.best_for));
        setOccasionTags(tagsToCsv(data.intelligence.occasion_tags));
        setAtmosphereTags(tagsToCsv(data.intelligence.atmosphere_tags));
        setAvoidIfTags(tagsToCsv(data.intelligence.avoid_if_tags));
        setGoodForTime(tagsToCsv(data.intelligence.good_for_time));
        setNoiseLevel(data.intelligence.noise_level ?? "");
        setCrowdType(tagsToCsv(data.intelligence.crowd_type));
        setDressCode(data.intelligence.dress_code ?? "");
        setReservationRecommended(data.intelligence.reservation_recommended);
        setAverageDurationMinutes(
          data.intelligence.average_duration_minutes
            ? String(data.intelligence.average_duration_minutes)
            : ""
        );
        setSignatureItems(tagsToCsv(data.intelligence.signature_items));
        setSpecialNotes(data.intelligence.special_notes ?? "");
      } catch (error) {
        if (!active) return;
        setMessage(error instanceof Error ? error.message : "Spot konnte nicht geladen werden.");
      } finally {
        if (active) setLoading(false);
      }
    }

    load();

    return () => {
      active = false;
    };
  }, [spotId]);

  const title = useMemo(() => detail?.spot.name ?? "Spot bearbeiten", [detail]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setSaving(true);
      setMessage(null);
      setSuccess(null);

      await updateOwnerSpotProfile({
        spotId,
        name: name.trim(),
        address: address.trim() || null,
        city: city.trim() || null,
        country: country.trim() || null,
        phone: phone.trim() || null,
        website: website.trim() || null,
        email: email.trim() || null,
        priceLevel: priceLevel.trim() ? Number(priceLevel) : null,
        ownerDescription: ownerDescription.trim() || null,
        ownerKeywords: parseCsvTags(ownerKeywords),
      });

      await updateOwnerSpotIntelligence({
        spotId,
        bestFor: parseCsvTags(bestFor),
        occasionTags: parseCsvTags(occasionTags),
        atmosphereTags: parseCsvTags(atmosphereTags),
        avoidIfTags: parseCsvTags(avoidIfTags),
        goodForTime: parseCsvTags(goodForTime),
        noiseLevel: noiseLevel.trim() || null,
        crowdType: parseCsvTags(crowdType),
        dressCode: dressCode.trim() || null,
        reservationRecommended,
        averageDurationMinutes: averageDurationMinutes.trim()
          ? Number(averageDurationMinutes)
          : null,
        signatureItems: parseCsvTags(signatureItems),
        specialNotes: specialNotes.trim() || null,
      });

      router.push(`/owner/spots/${spotId}?saved=1`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Speichern fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <OwnerShell title={title} subtitle="Pflege die Informationen, die Ranking, Decision und Spot Detail wirklich verbessern.">
      {loading ? (
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-8 text-white/55">
          Lädt…
        </div>
      ) : message && !detail ? (
        <div className="rounded-[2rem] border border-red-500/20 bg-red-500/10 p-8 text-red-100/80">
          {message}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          {message && (
            <div className="rounded-3xl border border-red-500/20 bg-red-500/10 p-5 text-red-100/80">
              {message}
            </div>
          )}

          {success && (
            <div className="rounded-3xl border border-emerald-500/20 bg-emerald-500/10 p-5 text-emerald-100/85">
              {success}
            </div>
          )}

          <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
            <h2 className="text-2xl font-semibold">Basisdaten</h2>
            <p className="mt-2 text-sm leading-6 text-white/45">
              Diese Daten erscheinen im Spot Detail und helfen der Decision Engine bei Relevanz, Distanz und Kontext.
            </p>

            <div className="mt-6 grid gap-5 md:grid-cols-2">
              <Field label="Name" value={name} onChange={setName} />
              <Field label="Stadt" value={city} onChange={setCity} />
              <Field label="Adresse" value={address} onChange={setAddress} />
              <Field label="Land" value={country} onChange={setCountry} />
              <Field label="Telefon" value={phone} onChange={setPhone} />
              <Field label="Website" value={website} onChange={setWebsite} />
              <Field label="E-Mail" value={email} onChange={setEmail} />
              <Field label="Preislevel 1-4" value={priceLevel} onChange={setPriceLevel} type="number" />
            </div>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
            <h2 className="text-2xl font-semibold">Owner Beschreibung</h2>
            <p className="mt-2 text-sm leading-6 text-white/45">
              Nicht werblich aufblasen. Sag Backyrd ehrlich, wann dein Spot wirklich glänzt.
            </p>

            <div className="mt-6 space-y-5">
              <TextArea
                label="Kurzbeschreibung"
                value={ownerDescription}
                onChange={setOwnerDescription}
                placeholder="Was ist euer Spot? Wann passt ihr am besten? Was macht euch besonders?"
              />

              <Field
                label="Keywords, kommagetrennt"
                value={ownerKeywords}
                onChange={setOwnerKeywords}
                placeholder="craft beer, garten, burger, gruppen, afterwork"
              />
            </div>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
            <h2 className="text-2xl font-semibold">Backyrd Intelligence</h2>
            <p className="mt-2 text-sm leading-6 text-white/45">
              Das ist das wichtigste Ranking-Futter. Hier definierst du nicht, dass dein Spot gut ist,
              sondern für welche Situationen er wirklich passt.
            </p>

            <div className="mt-6 grid gap-5 md:grid-cols-2">
              <Field label="Gut für" value={bestFor} onChange={setBestFor} placeholder="date, afterwork, gruppen" />
              <Field label="Anlässe" value={occasionTags} onChange={setOccasionTags} placeholder="sonntag, geburtstag, lunch" />
              <Field label="Atmosphäre" value={atmosphereTags} onChange={setAtmosphereTags} placeholder="urban, gemütlich, lebendig" />
              <Field label="Nicht ideal wenn..." value={avoidIfTags} onChange={setAvoidIfTags} placeholder="ruhiges gespräch, kleinkinder" />
              <Field label="Gute Zeiten" value={goodForTime} onChange={setGoodForTime} placeholder="abend, mittag, wochenende" />
              <Field label="Noise Level" value={noiseLevel} onChange={setNoiseLevel} placeholder="ruhig, mittel, laut" />
              <Field label="Crowd Type" value={crowdType} onChange={setCrowdType} placeholder="locals, gruppen, creatives" />
              <Field label="Dress Code" value={dressCode} onChange={setDressCode} placeholder="casual, smart casual" />
              <Field label="Ø Aufenthaltsdauer Minuten" value={averageDurationMinutes} onChange={setAverageDurationMinutes} type="number" />
              <Field label="Signature Items" value={signatureItems} onChange={setSignatureItems} placeholder="burger, craft beer, brunch" />
            </div>

            <div className="mt-5">
              <Toggle
                label="Reservation empfohlen?"
                value={reservationRecommended}
                onChange={setReservationRecommended}
              />
            </div>

            <div className="mt-5">
              <TextArea
                label="Besondere Hinweise"
                value={specialNotes}
                onChange={setSpecialNotes}
                placeholder="Zum Beispiel: Garten nur bei gutem Wetter, am Freitag sehr voll, ideal für Gruppen ab 6 Personen..."
              />
            </div>
          </section>

          <div className="sticky bottom-6 z-10 flex justify-end">
            <div className="rounded-full border border-white/10 bg-black/80 p-2 backdrop-blur-xl">
              <button
                type="submit"
                disabled={saving}
                className="rounded-full bg-white px-7 py-3 text-sm font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Speichern..." : "Speichern"}
              </button>
            </div>
          </div>
        </form>
      )}
    </OwnerShell>
  );
}
