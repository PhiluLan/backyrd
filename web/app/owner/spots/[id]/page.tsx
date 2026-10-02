import { OwnerWorldEditor } from "@/components/owner/owner-world-editor";

export default async function OwnerSpotPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OwnerWorldEditor spotId={id} />;
}
