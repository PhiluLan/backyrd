import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicSpotDetailServer } from "@/lib/public-spot-detail-server";
import { spotEvents } from "@/lib/events-public";
import { upcomingSpotEvents } from "../../../../packages/shared/src/presentation/event";
import { SpotProfile } from "@/components/consumer/spot-profile";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const data = await getPublicSpotDetailServer(id);
  if (!data) return { title: "Ort nicht gefunden" };
  const { spot } = data;
  return {
    title: spot.name,
    description: `${spot.name}${spot.city ? ` in ${spot.city}` : ""} auf Backyrd entdecken.`,
    alternates: { canonical: `/spots/${encodeURIComponent(spot.id)}` },
    openGraph: {
      title: spot.name,
      images: spot.header_photo_path ? [spot.header_photo_path] : [],
    },
  };
}
export default async function SpotDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getPublicSpotDetailServer(id);
  if (!data?.spot?.id) notFound();
  const events = await spotEvents(id)
    .then((rows) => ({ rows: upcomingSpotEvents(rows), failed: false }))
    .catch(() => ({ rows: [], failed: true }));
  return <SpotProfile data={data} events={events} />;
}
