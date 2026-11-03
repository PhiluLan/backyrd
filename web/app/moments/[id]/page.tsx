import { MomentDetail } from "@/components/consumer/moment-detail";
import { AuthGate } from "@/components/consumer/auth-gate";
import { notFound } from "next/navigation";
export const metadata = { title: "Ein Moment auf Backyrd", robots: { index: false, follow: false } };
export default async function MomentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();
  return <AuthGate><MomentDetail postId={id} /></AuthGate>;
}
