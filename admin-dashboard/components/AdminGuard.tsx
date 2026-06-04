"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type GuardState = "checking" | "ok" | "blocked";

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<GuardState>("checking");
  const [reason, setReason] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // öffentliche Routes
      if (pathname === "/login") {
        if (!cancelled) setState("ok");
        return;
      }

      // 1) Session check
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (cancelled) return;

      if (sessionErr) {
        console.warn("getSession error:", sessionErr);
        setReason("session_error");
        setState("blocked");
        router.replace("/login");
        return;
      }

      const user = sessionData.session?.user;
      if (!user) {
        setReason("no_session");
        setState("blocked");
        router.replace("/login");
        return;
      }

      // 2) Admin flag check
      const { data: profile, error: profErr } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", user.id)
        .single();

      if (cancelled) return;

      if (profErr) {
        // IMPORTANT:
        // Wenn profiles read durch RLS/Policies failt, NICHT in einen Redirect-Loop fallen.
        console.warn("profiles is_admin check failed (allowing temporarily):", profErr);
        setReason("profile_check_failed_allow");
        setState("ok");
        return;
      }

      if (!profile?.is_admin) {
        setReason("not_admin");
        setState("blocked");
        router.replace("/login");
        return;
      }

      setReason("ok");
      setState("ok");
    })();

    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  if (state === "checking") {
    return (
      <div className="p-6 text-sm text-gray-500">
        Checking session…
      </div>
    );
  }

  if (state === "blocked") {
    return (
      <div className="p-6 text-sm text-gray-500">
        Access denied. ({reason})
      </div>
    );
  }

  return <>{children}</>;
}
