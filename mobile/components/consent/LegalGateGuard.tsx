// mobile/components/consent/LegalGateGuard.tsx

import React, { PropsWithChildren, useEffect, useRef } from "react";
import { usePathname, useRouter } from "expo-router";

import { supabase } from "@/lib/supabase";
import { getMyLegalGateStatus } from "@/lib/consent";

const ALLOWED_WHEN_GATED = new Set([
  "/legal-consent",
  "/auth/login",
  "/auth/register",
  "/auth/verify",
]);

type Props = PropsWithChildren<{ enabled?: boolean }>;

export default function LegalGateGuard({ children, enabled = true }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const checkingRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    async function checkGate() {
      if (checkingRef.current) return;
      checkingRef.current = true;

      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session) return;

        const status = await getMyLegalGateStatus();
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
  }, [enabled, pathname, router]);

  return <>{children}</>;
}
