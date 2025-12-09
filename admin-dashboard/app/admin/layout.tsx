"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  // Login-Route explizit NICHT schützen
  const isLoginPage = pathname === "/admin/login";

  useEffect(() => {
    // Login-Seite darf ohne Check gerendert werden
    if (isLoginPage) {
      setChecking(false);
      return;
    }

    async function check() {
      const { data } = await supabase.auth.getUser();

      if (!data.user) {
        router.replace("/admin/login");
      } else {
        setChecking(false);
      }
    }

    check();
  }, [isLoginPage, router]);

  if (checking) {
    // simplen Loader anzeigen oder null
    if (isLoginPage) return <>{children}</>;
    return null;
  }

  return <>{children}</>;
}
