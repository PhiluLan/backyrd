"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase/client";

const measuredHosts = new Set(["www.backyrd.ch", "backyrd.ch"]);
const publicPaths = new Set(["/", "/places", "/discover", "/search", "/decision", "/moments", "/events", "/booking"]);

function publicPageGroup(path: string) {
  if (publicPaths.has(path)) return path;
  return /^\/(spots|events|moments)\/[a-f0-9-]{36}$/i.test(path)
    ? path.replace(/\/[^/]+$/, "/:id")
    : null;
}

export function WebAnalytics() {
  const pathname = usePathname();
  const lastView = useRef<string | null>(null);

  useEffect(() => {
    if (!measuredHosts.has(window.location.hostname)) return;
    const group = publicPageGroup(pathname);
    if (!group) {
      lastView.current = null;
      return;
    }
    if (lastView.current === pathname) return;
    const controller = new AbortController();
    async function record() {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session || controller.signal.aborted) return;
      const { data, error } = await supabase.rpc("get_my_consent_state_v1", { p_locale: "de-CH" }).abortSignal(controller.signal);
      if (controller.signal.aborted || error || !Array.isArray(data) || !data.some((row: unknown) =>
        row !== null && typeof row === "object" && "purpose_key" in row && row.purpose_key === "optional_product_analytics"
        && "current_status" in row && row.current_status === "granted")) return;

      // Store a route group only. Paths with IDs, referrers and query parameters stay out of the event.
      lastView.current = pathname;
      await supabase.rpc("analytics_track_event_v1", {
        p_event_name: "screen_view",
        p_screen_name: `web:${group}`,
        p_platform: "web",
      });
    }
    void record().catch(() => undefined);
    return () => controller.abort();
  }, [pathname]);

  return null;
}
