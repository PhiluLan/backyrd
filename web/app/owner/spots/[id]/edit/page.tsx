import { redirect } from "next/navigation";

export default async function OwnerSpotLegacyEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/owner/spots/${encodeURIComponent(id)}`);
}
