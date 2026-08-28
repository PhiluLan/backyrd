import type { ReactNode } from "react";
import { AuthGate } from "@/components/consumer/auth-gate";

export default function FavoritesLayout({ children }: { children: ReactNode }) {
  return <AuthGate>{children}</AuthGate>;
}
