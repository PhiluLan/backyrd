"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { OwnerShell } from "@/components/owner/owner-shell";
import { getOwnerSpotDetail, requireOwnerSession, type OwnerSpotDetail } from "@/lib/owner-api";

function TagList({ tags }: { tags: string[] }) {
  if (!tags.length) return <span className="text-white/35">Noch offen</span>;

  return (
    <div className="flex flex-wrap gap-2">
      {tags.slice(0, 10).map((tag) => (
        <span key={tag} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-white/75">
          {tag}
        </span>
      ))}
    </div>
  );
}

export default function OwnerSpotDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();

  const spotId = params.id;
  const saved = searchParams.get("saved") === "1";

  const [detail, setDetail] = useState<OwnerSpotDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

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

  return (
    <OwnerShell title={title} subtitle="So sieht Backyrd deinen Spot aktuell aus Owner-Sicht.">
      {saved && (
        <div className="mb-6 rounded-[1.5rem] border border-emerald-400/25 bg-emerald-500/10 p-5 text-emerald-100">
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
      ) : detail ? (
        <div className="space-y-6">
          <div className="flex flex-col justify-between gap-4 rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 sm:flex-row sm:items-center">
            <div>
              <div className="text-sm text-white/40">{detail.spot.category_name ?? "Spot"}</div>
              <div className="mt-2 text-2xl font-semibold">{detail.spot.name}</div>
              <div className="mt-2 text-white/50">
                {[detail.spot.address, detail.spot.city].filter(Boolean).join(" · ") || "Adresse offen"}
              </div>
            </div>

            <Link
              href={`/owner/spots/${detail.spot.id}/edit`}
              className="rounded-full bg-white px-5 py-3 text-center text-sm font-semibold text-black transition hover:bg-white/90"
            >
              Spot bearbeiten
            </Link>
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
              <div className="mt-3 text-4xl font-semibold">{detail.metrics.decision_review_count}</div>
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
              <h2 className="text-2xl font-semibold">Owner Beschreibung</h2>
              <p className="mt-4 leading-7 text-white/60">
                {detail.description.owner_description || "Noch keine Owner Beschreibung gepflegt."}
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
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </OwnerShell>
  );
}
