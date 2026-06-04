import { SearchBar } from "@/components/search-bar";
import { SiteHeader } from "@/components/site-header";
import { SpotCard } from "@/components/spot-card";
import { getHomeSections } from "@/lib/backyrd-api";
import type { HomeSectionsDTO } from "@backyrd/shared";

function Section({
  title,
  items,
}: {
  title: string;
  items: HomeSectionsDTO["popular"];
}) {
  if (!items.length) return null;

  return (
    <section className="mt-14">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-white">{title}</h2>
          <p className="mt-2 text-sm text-white/50">{items.length} Spots geladen</p>
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((spot) => (
          <SpotCard key={spot.id} spot={spot} />
        ))}
      </div>
    </section>
  );
}

export default async function HomePage() {
  const sections = await getHomeSections(null, 12);

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
              Backyrd bringt Discovery, Mood und echte Orte zusammen — jetzt als
              eigener Browser-Client mit zentraler Domain-API.
            </p>
          </div>

          <div className="lg:pb-2">
            <SearchBar />
          </div>
        </div>

        <div className="mt-12 flex flex-wrap gap-3">
          {["Gemütlich", "Chillig", "Date Night", "Modern", "Versteckt"].map((chip) => (
            <div
              key={chip}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/75"
            >
              {chip}
            </div>
          ))}
        </div>

        {!sections.popular.length &&
        !sections.newest.length &&
        !sections.favorites.length ? (
          <div className="mt-14 rounded-3xl border border-white/10 bg-white/5 p-10 text-white/60">
            Noch keine lokalen Seed-Daten vorhanden. Die Domain-API läuft, aber die lokale DB ist aktuell leer.
          </div>
        ) : (
          <>
            <Section title="Beliebt auf Backyrd" items={sections.popular} />
            <Section title="Neu auf Backyrd" items={sections.newest} />
            <Section title="Deine Favoriten" items={sections.favorites} />
          </>
        )}
      </section>
    </main>
  );
}