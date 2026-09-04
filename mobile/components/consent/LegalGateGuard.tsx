// mobile/components/consent/LegalGateGuard.tsx

import React, { PropsWithChildren, useEffect } from "react";
import { usePathname, useRouter } from "expo-router";

import { supabase } from "@/lib/supabase";
import { getMyLegalGateStatus } from "@/lib/consent";
import { rootStartupNavigationAuthority } from "@/lib/root-startup-navigation";

const ALLOWED_WHEN_GATED = new Set([
  "/legal-consent",
  "/auth/login",
  "/auth/register",
  "/auth/verify",
]);

export default function LegalGateGuard({ children }: PropsWithChildren) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;

    async function checkGate() {
      try {
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;

        if (!data.session) {
          rootStartupNavigationAuthority.setLegalState("clear");
          console.log("[startup-authority] legal=clear");
          return;
        }

        const status = await getMyLegalGateStatus();
        if (!cancelled) {
          const legalState = status?.gate_required === true ? "required" : "clear";
          rootStartupNavigationAuthority.setLegalState(legalState);
          console.log(`[startup-authority] legal=${legalState}`);
        }
        if (
          !cancelled &&
          status?.gate_required === true &&
          !ALLOWED_WHEN_GATED.has(pathname)
        ) {
          router.replace("/legal-consent" as never);
        }
      } catch (error) {
        if (!cancelled) {
          console.warn("[legal-gate] status check failed", error);
        }
      }
    }

    void checkGate();

    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  return <>{children}</>;
}
