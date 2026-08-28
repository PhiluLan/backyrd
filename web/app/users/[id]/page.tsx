import type { Metadata } from "next";
import { ProfileExperience } from "@/components/consumer/profile-experience";
export const metadata: Metadata = { title: "Profil" };
export default async function UserProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProfileExperience userId={id} />;
}
