"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { OwnerShell } from "@/components/owner/owner-shell";
import { getOwnerSpotDetail, requireOwnerSession, type OwnerSpotDetail } from "@/lib/owner-api";

function TagList({ tags }: { tags: string[] }) {
  if (!tags.length) return <span className="text-white/35">Noch offen</span>;

  return (
    <div className="flex flex-wrap gap-2">
      {tags.slice(0, 12).map((tag) => (
        <span
          key={tag}
          className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-white/75"
        >
          {tag}
        </span>
      ))}
    </div>
  );
}

function hasText(value: string | null | undefined) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasTags(value: string[] | null | undefined) {
  return Array.isArray(value) && value.length > 0;
}

function buildQuality(detail: OwnerSpotDetail) {
  const checks = [
    {
      key: "address",
      label: "Adresse gepflegt",
      done: hasText(detail.spot.address) && hasText(detail.spot.city),
      todo: "Adresse und Stadt ergänzen.",
    },
    {
      key: "contact",
      label: "Kontakt gepflegt",
      done: hasText(detail.spot.phone) || hasText(detail.spot.website) || hasText(detail.spot.email),
      todo: "Telefon, Website oder E-Mail ergänzen.",
    },
    {
      key: "description",
      label: "Owner Beschreibung",
      done: hasText(detail.description.owner_description),
      todo: "Kurz beschreiben, wann dein Spot wirklich passt.",
    },
    {
      key: "keywords",
      label: "Keywords",
      done: hasTags(detail.description.owner_keywords),
      todo: "Keywords wie craft beer, brunch, garten, date, gruppen ergänzen.",
    },
    {
      key: "best_for",
      label: "Gut-für Signale",
      done: hasTags(detail.intelligence.best_for),
      todo: "Gut für: afterwork, date, familien, gruppen usw. ergänzen.",
    },
    {
      key: "atmosphere",
      label: "Atmosphäre",
      done: hasTags(detail.intelligence.atmosphere_tags),
      todo: "Atmosphäre wie urban, ruhig, lebendig, gemütlich ergänzen.",
    },
    {
      key: "signature",
      label: "Signature Items",
      done: hasTags(detail.intelligence.signature_items),
      todo: "Signature Items wie burger, craft beer, brunch, cocktails ergänzen.",
    },
    {
      key: "avoid",
      label: "Nicht-ideal-Kontexte",
      done: hasTags(detail.intelligence.avoid_if_tags),
      todo: "Definieren, wann dein Spot eher nicht passt. Das verbessert Vertrauen.",
    },
  ];

  const doneCount = checks.filter((check) => check.done).length;
  const score = Math.round((doneCount / checks.length) * 100);
  const todos = checks.filter((check) => !check.done).map((check) => check.todo);

  return { score, doneCount, total: checks.length, checks, todos };
}

function scoreLabel(score: number) {
  if (score >= 85) return "Sehr vollständig";
  if (score >= 65) return "Solide gepflegt";
  if (score >= 40) return "Ausbaufähig";
  return "Noch unvollständig";
}

export default function OwnerSpotDetailPage() {
  const params = useParams<{ id: string }>();
  const spotId = params.id;

  const [detail, setDetail] = useState<OwnerSpotDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [showSavedMessage, setShowSavedMessage] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const saved = new URLSearchParams(window.location.search).get("saved") === "1";
    setShowSavedMessage(saved);

    if (saved) {
      const url = new URL(window.location.href);
      url.searchParams.delete("saved");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  useEffect(() => {
    if (!showSavedMessage) return;

    const timeout = window.setTimeout(() => {
      setShowSavedMessage(false);
    }, 4500);

    return () => window.clearTimeout(timeout);
  }, [showSavedMessage]);

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

  const title = useMemo(() => detail?.spot.name ?? "Spot", [detail]);
  const quality = useMemo(() => (detail ? buildQuality(detail) : null), [detail]);

  return (
    <OwnerShell title={title} subtitle="So sieht Backyrd deinen Spot aktuell aus Owner-Sicht.">
      {showSavedMessage && (
        <div className="mb-6 rounded-[1.5rem] border border-emerald-400/25 bg-emerald-500/10 p-5 text-emerald-100 shadow-2xl shadow-emerald-950/20">
          <div className="text-base font-semibold">Gespeichert</div>
          <p className="mt-1 text-sm leading-6 text-emerald-100/75">
            Deine Änderungen wurden übernommen. Backyrd kann diesen Spot jetzt besser verstehen.
          </p>
        </div>
      )}

      {loading ? (
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-8 text-white/55">
          Lädt…
        </div>
      ) : message ? (
        <div className="rounded-[2rem] border border-red-500/20 bg-red-500/10 p-8 text-red-100/80">
          {message}
        </div>
      ) : detail && quality ? (
        <div className="space-y-6">
          <div className="flex flex-col justify-between gap-4 rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 sm:flex-row sm:items-center">
            <div>
              <div className="text-sm text-white/40">{detail.spot.category_name ?? "Spot"}</div>
              <div className="mt-2 text-2xl font-semibold">{detail.spot.name}</div>
              <div className="mt-2 text-white/50">
                {[detail.spot.address, detail.spot.city].filter(Boolean).join(" · ") ||
                  "Adresse offen"}
              </div>
            </div>

            <Link
              href={`/owner/spots/${detail.spot.id}/edit`}
              className="rounded-full bg-white px-5 py-3 text-center text-sm font-semibold text-black transition hover:bg-white/90"
            >
              Spot bearbeiten
            </Link>
          </div>

          <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm text-white/40">Profil-Vollständigkeit</div>
                  <div className="mt-2 text-5xl font-semibold">{quality.score}%</div>
                  <div className="mt-2 text-white/50">{scoreLabel(quality.score)}</div>
                </div>

                <div className="rounded-full border border-white/10 bg-black/25 px-4 py-2 text-sm text-white/55">
                  {quality.doneCount}/{quality.total}
                </div>
              </div>

              <div className="mt-6 h-3 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-white"
                  style={{ width: `${quality.score}%` }}
                />
              </div>

              <p className="mt-5 text-sm leading-6 text-white/50">
                Je strukturierter dein Spot gepflegt ist, desto besser kann Backyrd ihn bei
                passenden Decisions, Suchen und Social-Kontexten einordnen.
              </p>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
              <h2 className="text-2xl font-semibold">Nächste Profil-Schritte</h2>
              <p className="mt-2 text-sm leading-6 text-white/50">
                Backyrd verkauft keine Fake-Relevanz. Gute Platzierung entsteht, wenn dein Spot
                für echte Situationen klar verstanden wird.
              </p>

              {quality.todos.length === 0 ? (
                <div className="mt-5 rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5 text-emerald-100/80">
                  Stark. Die wichtigsten Owner-Daten sind gepflegt.
                </div>
              ) : (
                <div className="mt-5 grid gap-3">
                  {quality.todos.slice(0, 4).map((todo) => (
                    <div
                      key={todo}
                      className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white/70"
                    >
                      {todo}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
              <div className="text-sm text-white/40">Reviews</div>
              <div className="mt-3 text-4xl font-semibold">{detail.metrics.review_count}</div>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
              <div className="text-sm text-white/40">Moments</div>
              <div className="mt-3 text-4xl font-semibold">{detail.metrics.social_post_count}</div>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
              <div className="text-sm text-white/40">Gefunden mit Backyrd</div>
              <div className="mt-3 text-4xl font-semibold">
                {detail.metrics.decision_review_count}
              </div>
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
              <h2 className="text-2xl font-semibold">Owner Beschreibung</h2>
              <p className="mt-4 leading-7 text-white/60">
                {detail.description.owner_description ||
                  "Noch keine Owner Beschreibung gepflegt."}
              </p>

              <div className="mt-5">
                <div className="mb-3 text-sm font-semibold text-white/50">Keywords</div>
                <TagList tags={detail.description.owner_keywords} />
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
              <h2 className="text-2xl font-semibold">Backyrd Intelligence</h2>

              <div className="mt-5 space-y-5">
                <div>
                  <div className="mb-3 text-sm font-semibold text-white/50">Gut für</div>
                  <TagList tags={detail.intelligence.best_for} />
                </div>

                <div>
                  <div className="mb-3 text-sm font-semibold text-white/50">Atmosphäre</div>
                  <TagList tags={detail.intelligence.atmosphere_tags} />
                </div>

                <div>
                  <div className="mb-3 text-sm font-semibold text-white/50">Signature Items</div>
                  <TagList tags={detail.intelligence.signature_items} />
                </div>

                <div>
                  <div className="mb-3 text-sm font-semibold text-white/50">Nicht ideal wenn</div>
                  <TagList tags={detail.intelligence.avoid_if_tags} />
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </OwnerShell>
  );
}
