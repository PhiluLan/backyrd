"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { recoverWorldKnowledgeSession } from "@/lib/worldKnowledgeSession";

export function useAnalyticsReport<T>(url: string) {
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ key: string; data: T | null } | null>(null);
  const key = `${url}@${revision}`;
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const session = await recoverWorldKnowledgeSession(supabase.auth);
        if (controller.signal.aborted) return;
        const response = await fetch(url, { headers: { authorization: `Bearer ${session.access_token}` }, signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw Error("analytics_unavailable");
        const data = await response.json() as T;
        if (!controller.signal.aborted) setResult({ key, data });
      } catch {
        if (!controller.signal.aborted) setResult({ key, data: null });
      }
    }
    void load();
    return () => controller.abort();
  }, [key, url]);
  return {
    busy: result?.key !== key,
    data: result?.key === key ? result.data : null,
    refresh: () => setRevision(value => value + 1),
  };
}
