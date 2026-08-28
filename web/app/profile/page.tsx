import type { Metadata } from "next";
import { ProfileExperience } from "@/components/consumer/profile-experience";
export const metadata: Metadata = { title: "Profil" };
export default function ProfilePage() {
  return <ProfileExperience />;
}
