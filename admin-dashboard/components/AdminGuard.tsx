"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type GuardState = "checking" | "ok" | "blocked";

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<GuardState>("checking");

  useEffect(() => {
    let cancelled = false;

    async function checkAccess() {
      if (pathname === "/login") {
        if (!cancelled) setState("ok");
        return;
      }

      const { data: userData, error: sessionError } = await supabase.auth.getUser();
      if (cancelled) return;

      if (sessionError || !userData.user) {
        setState("blocked");
        router.replace("/login");
        return;
      }

      const { data, error } = await supabase.rpc("admin_is_admin_v1");
      if (cancelled) return;

      if (error || data !== true) {
        console.error("Admin check failed:", error);
        setState("blocked");
        await supabase.auth.signOut();
        router.replace("/login");
        return;
      }

      setState("ok");
    }

    void checkAccess();
    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  if (state === "checking") {
    return <div className="bi-guard">Backyrd Intelligence wird geladen …</div>;
  }

  if (state === "blocked") {
    return <div className="bi-guard">Dieser Bereich ist nur für autorisierte Backyrd-Admins verfügbar.</div>;
  }

  return <>{children}</>;
}
