"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { supabase } from "@/lib/supabase/client";

export default function ProfilePage() {
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function load() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!active) return;

      setEmail(session?.user.email ?? null);
      setLoading(false);
    }

    load();

    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="min-h-screen bg-[#050506] text-white">
      <SiteHeader />

      <section className="mx-auto max-w-4xl px-6 py-16">
        <div className="rounded-[2.5rem] border border-white/10 bg-white/[0.04] p-8">
          <div className="inline-flex rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/55">
            Backyrd Konto
          </div>

          <h1 className="mt-8 text-4xl font-semibold tracking-tight md:text-5xl">
            Dein Web-Konto
          </h1>

          <p className="mt-4 max-w-2xl leading-7 text-white/55">
            Die vollständige soziale Profilseite bauen wir später neu. Für den Owner-Sprint
            führt dich diese Seite direkt zu den wichtigen Bereichen.
          </p>

          <div className="mt-8 rounded-[2rem] border border-white/10 bg-black/25 p-6">
            <div className="text-sm font-semibold text-white/45">Status</div>
            <div className="mt-2 text-lg font-semibold">
              {loading ? "Lädt…" : email ? `Eingeloggt als ${email}` : "Nicht eingeloggt"}
            </div>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/owner"
              className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-white/90"
            >
              Zum Owner Dashboard
            </Link>

            <Link
              href="/login?next=/owner"
              className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white/75 transition hover:bg-white/10 hover:text-white"
            >
              Login öffnen
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
