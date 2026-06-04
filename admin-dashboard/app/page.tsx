"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase.auth.getSession();
      if (cancelled) return;

      if (error) {
        console.error("getSession error", error);
        router.replace("/login");
        return;
      }

      router.replace(data.session ? "/dashboard" : "/login");
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="p-6">
      <p className="text-sm text-gray-500">Loading…</p>
    </div>
  );
}
