"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isMissingAuthSession } from "@backyrd/shared";
import { supabase } from "@/lib/supabase/client";
import { StateView } from "./ui";

export function AuthGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = useState<"checking" | "signed-in" | "signed-out" | "error">(
    "checking",
  );

  const verifiedUser = useRef<string | null>(null);
  const [verifiedUserId, setVerifiedUserId] = useState<string | null>(null);
  const [checkedPath, setCheckedPath] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setState("checking");
    void supabase.auth.getUser().then(async ({ data, error }) => {
      if (error && !isMissingAuthSession(error)) throw error;
      if (!active) return;
      if (data.user) {
        verifiedUser.current = data.user.id;
        if (pathname !== "/legal-consent") {
          const { data: gate, error: gateError } = await supabase.rpc("get_my_legal_gate_status_v1", { p_locale: "de-CH" });
          if (!active) return;
          const status = Array.isArray(gate) ? gate[0] : gate;
          if (gateError || typeof status?.gate_required !== "boolean") throw gateError ?? new Error("legal_status_unavailable");
          if (status.gate_required) { router.replace(`/legal-consent?next=${encodeURIComponent(pathname)}`); return; }
        }
        setVerifiedUserId(data.user.id);
        setCheckedPath(pathname);
        setState("signed-in");
        return;
      }
      setState("signed-out");
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }).catch(() => { if (active) setState("error"); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (active && event === "SIGNED_OUT") {
        verifiedUser.current = null; setVerifiedUserId(null);
        setState("signed-out");
        router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      } else if (active && event === "SIGNED_IN" && session?.user.id !== verifiedUser.current) {
        setState("checking"); setVerifiedUserId(null); setCheckedPath(null);
        setAttempt((value) => value + 1);
      }
    });
    return () => {
      subscription.unsubscribe();
      active = false;
    };
  }, [pathname, router, attempt]);

  if (state === "signed-in" && checkedPath === pathname && verifiedUserId) return <Fragment key={verifiedUserId}>{children}</Fragment>;

  return (
    <div className="b-narrow b-main">
      <StateView
        title={state === "error" ? "Verbindung unterbrochen" : state === "checking" ? "Dein Backyrd wird geöffnet" : "Anmeldung erforderlich"}
        message={
          state === "error" ? "Deine Anmeldung konnte gerade nicht geprüft werden. Bitte versuche es erneut." : state === "checking"
            ? "Einen kurzen Moment."
            : "Melde dich an, um diesen persönlichen Bereich zu öffnen."
        }
        actionLabel={state === "error" ? "Erneut versuchen" : state === "signed-out" ? "Zur Anmeldung" : undefined}
        onAction={
          state === "error" ? () => { setState("checking"); setAttempt((value) => value + 1); } : state === "signed-out"
            ? () => router.replace(`/login?next=${encodeURIComponent(pathname)}`)
            : undefined
        }
      />
    </div>
  );
}
