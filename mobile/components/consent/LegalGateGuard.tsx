// mobile/components/consent/LegalGateGuard.tsx

import React, { PropsWithChildren, useEffect, useState } from "react";
import { usePathname, useRouter } from "expo-router";

import { supabase } from "@/lib/supabase";
import { getMyLegalGateStatus } from "@/lib/consent";
import { StateView } from "@/components/foundation/StateView";
import { rootStartupNavigationAuthority } from "@/lib/root-startup-navigation";

const ALLOWED_WHEN_GATED = new Set([
  "/legal-consent",
  "/auth/login",
  "/auth/register",
  "/auth/verify",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/auth/callback",
  "/auth/recovery",
]);

export default function LegalGateGuard({ children }: PropsWithChildren) {
  const router = useRouter();
  const pathname = usePathname();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);

    async function checkGate() {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (cancelled) return;

        if (!data.session) {
          rootStartupNavigationAuthority.setLegalState("clear");
          console.log("[startup-authority] legal=clear");
          return;
        }

        const status = await getMyLegalGateStatus();
        if (typeof status?.gate_required !== "boolean") throw new Error("legal_status_missing");
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
      } catch {
        if (!cancelled) setFailed(true);
      }
    }

    void checkGate();

    return () => {
      cancelled = true;
    };
  }, [pathname, router, attempt]);

  if (failed && !ALLOWED_WHEN_GATED.has(pathname)) return <StateView kind="error" title="Verbindung unterbrochen" message="Deine Bestätigungen konnten gerade nicht geprüft werden. Bitte versuche es erneut." actionLabel="Erneut versuchen" onAction={() => setAttempt((value) => value + 1)} />;
  return <>{children}</>;
}
