// mobile/components/consent/LegalGateGuard.tsx

import React, { PropsWithChildren, useEffect, useRef } from "react";
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
  const checkingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function checkGate() {
      if (checkingRef.current) return;
      checkingRef.current = true;

      try {
        const { data } = await supabase.auth.getSession();
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
        console.warn("[legal-gate] status check failed", error);
      } finally {
        checkingRef.current = false;
      }
    }

    void checkGate();

    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  return <>{children}</>;
}
