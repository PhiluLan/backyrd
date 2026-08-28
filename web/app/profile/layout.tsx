import type { ReactNode } from "react";
import { AuthGate } from "@/components/consumer/auth-gate";

export default function ProfileLayout({ children }: { children: ReactNode }) {
  return <AuthGate>{children}</AuthGate>;
}
