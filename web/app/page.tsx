"use client";

import Link from "next/link";
import { SiteHeader } from "@/components/site-header";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#050506] text-white">
      <SiteHeader />

      <section className="mx-auto max-w-7xl px-6 py-16">
        <div className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
          <div>
            <div className="inline-flex rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/60">
              Backyrd Web
            </div>

            <h1 className="mt-8 max-w-4xl text-5xl font-semibold tracking-tight md:text-7xl">
              Finde Orte nach Stimmung, nicht nach Sternen.
            </h1>

            <p className="mt-8 max-w-2xl text-lg leading-8 text-white/55">
              Die öffentliche Web-Discovery bauen wir später sauber neu auf. Aktuell ist der
              Web-Bereich auf das Owner Dashboard fokussiert.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              {["Mood statt Sterne", "Owner Dashboard", "Spot Qualität", "Backyrd Intelligence"].map(
                (chip) => (
                  <span
                    key={chip}
                    className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/65"
                  >
                    {chip}
                  </span>
                )
              )}
            </div>

            <div className="mt-10 flex flex-wrap gap-3">
              <Link
                href="/owner"
                className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition hover:bg-white/90"
              >
                Zum Owner Dashboard
              </Link>

              <Link
                href="/login?next=/owner"
                className="rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-white/75 transition hover:bg-white/10 hover:text-white"
              >
                Einloggen
              </Link>
            </div>
          </div>

          <div className="rounded-[2.5rem] border border-white/10 bg-white/[0.04] p-6">
            <div className="rounded-[2rem] border border-white/10 bg-black/25 p-6">
              <div className="text-sm font-semibold uppercase tracking-[0.24em] text-white/35">
                Fokus
              </div>
              <h2 className="mt-4 text-3xl font-semibold">Owner Dashboard Sprint</h2>
              <p className="mt-4 leading-7 text-white/55">
                Betriebe können ihre Spots pflegen, bessere Daten liefern und Backyrd helfen,
                echte Relevanz statt bezahlte Fake-Platzierungen zu schaffen.
              </p>

              <div className="mt-6 grid gap-3">
                {[
                  "Basisdaten pflegen",
                  "Owner Beschreibung",
                  "Backyrd Intelligence",
                  "Ranking-Futter verbessern",
                ].map((item) => (
                  <div
                    key={item}
                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white/75"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
