import type { ReactNode } from "react";
import { AuthGate } from "@/components/consumer/auth-gate";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return <AuthGate>{children}</AuthGate>;
}
