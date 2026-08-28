import type { ReactNode } from "react";
import { AuthGate } from "@/components/consumer/auth-gate";

export default function NotificationsLayout({ children }: { children: ReactNode }) {
  return <AuthGate>{children}</AuthGate>;
}
