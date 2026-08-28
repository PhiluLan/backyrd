import { redirect } from "next/navigation";

export default async function LegacySpotMoodsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/spots/${encodeURIComponent(id)}/edit#spot-understanding`);
}
