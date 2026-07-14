"use client";

import { useEffect, useMemo, useState } from "react";
import { SearchBar } from "@/components/search-bar";
import { SiteHeader } from "@/components/site-header";
import { SpotCard } from "@/components/spot-card";
import { getHomeSections } from "@/lib/backyrd-api";
import type { HomeSectionDTO, HomeSectionsDTO } from "@backyrd/shared";

function Section({ section }: { section: HomeSectionDTO }) {
  if (!section.items.length) return null;

  return (
    <section className="mt-14">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-white">{section.title}</h2>
          <p className="mt-2 text-sm text-white/50">{section.subtitle}</p>
        </div>

        <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-white/55">
          {section.items.length} Spots
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {section.items.map((spot) => (
          <SpotCard key={spot.id} spot={spot} />
        ))}
      </div>
    </section>
  );
}

function EmptyState() {
  return (
    <div className="mt-14 rounded-3xl border border-white/10 bg-white/5 p-10 text-white/60">
      Noch keine Discovery-Daten verfügbar. Prüfe, ob deine lokale Supabase läuft,
      ob die RPCs deployed sind und ob Seed-/Import-Daten vorhanden sind.
    </div>
  );
}

function LoadingState() {
  return (
    <div className="mt-14 rounded-3xl border border-white/10 bg-white/5 p-10 text-white/60">
      Discovery wird geladen…
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="mt-14 rounded-3xl border border-red-500/20 bg-red-500/10 p-10 text-red-100/85">
      <div className="text-lg font-medium text-white">Home konnte nicht geladen werden</div>
      <p className="mt-3 text-sm leading-7 text-red-100/75">{message}</p>
    </div>
  );
}

export default function HomePage() {
  const [sections, setSections] = useState<HomeSectionsDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        setLoading(true);
        setErrorMessage(null);

        const data = await getHomeSections(12);

        if (!active) return;
        setSections(data);
      } catch (error) {
        if (!active) return;

        const message =
          error instanceof Error
            ? error.message
            : "Unbekannter Fehler beim Laden der Discovery.";

        setErrorMessage(message);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      active = false;
    };
  }, []);

  const visibleSections = useMemo(
    () => sections?.sections.filter((section) => section.items.length > 0) ?? [],
    [sections]
  );

  return (
    <main className="min-h-screen bg-[#050506]">
      <SiteHeader />

      <section className="mx-auto max-w-7xl px-6 pb-20 pt-10">
        <div className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
          <div className="space-y-5">
            <div className="inline-flex rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70">
              Backyrd Web
            </div>

            <h1 className="max-w-4xl text-5xl font-semibold tracking-tight text-white md:text-6xl">
              Finde Orte nach Stimmung, nicht nach Sternen.
            </h1>

            <p className="max-w-2xl text-base leading-7 text-white/60 md:text-lg">
              Backyrd verbindet Mood, echte Empfehlungen und Discovery zu einer
              personalisierten Startseite — mit öffentlichem Fallback, wenn noch
              keine Session vorhanden ist.
            </p>
          </div>

          <div className="lg:pb-2">
            <SearchBar />
          </div>
        </div>

        <div className="mt-12 flex flex-wrap gap-3">
          {["Cozy", "Afterwork", "Date Night", "Urban", "Hidden Gems"].map((chip) => (
            <div
              key={chip}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/75"
            >
              {chip}
            </div>
          ))}
        </div>

        {sections && (
          <div className="mt-10 inline-flex rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-white/55">
            Quelle:{" "}
            {sections.source === "personalized"
              ? "personalisierte Home"
              : "öffentliche Discovery-Übersicht"}
          </div>
        )}

        {loading ? (
          <LoadingState />
        ) : errorMessage ? (
          <ErrorState message={errorMessage} />
        ) : visibleSections.length === 0 ? (
          <EmptyState />
        ) : (
          visibleSections.map((section) => (
            <Section key={section.key} section={section} />
          ))
        )}
      </section>
    </main>
  );
}