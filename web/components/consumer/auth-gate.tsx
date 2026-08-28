"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { StateView } from "./ui";

export function AuthGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = useState<"checking" | "signed-in" | "signed-out">(
    "checking",
  );

  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      if (data.user) {
        setState("signed-in");
        return;
      }
      setState("signed-out");
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    });
    return () => {
      active = false;
    };
  }, [pathname, router]);

  if (state === "signed-in") return children;

  return (
    <div className="b-narrow b-main">
      <StateView
        title={state === "checking" ? "Dein Backyrd wird geöffnet" : "Anmeldung erforderlich"}
        message={
          state === "checking"
            ? "Einen kurzen Moment."
            : "Melde dich an, um diesen persönlichen Bereich zu öffnen."
        }
        actionLabel={state === "signed-out" ? "Zur Anmeldung" : undefined}
        onAction={
          state === "signed-out"
            ? () => router.replace(`/login?next=${encodeURIComponent(pathname)}`)
            : undefined
        }
      />
    </div>
  );
}
