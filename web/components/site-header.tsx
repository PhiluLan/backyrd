"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

type HeaderUser = {
  email: string | null;
};

function InitialsBadge({ email }: { email: string | null }) {
  const initials = useMemo(() => {
    if (!email) return "B";
    const local = email.split("@")[0] || "B";
    return local.slice(0, 2).toUpperCase();
  }, [email]);

  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/10 text-xs font-semibold text-white">
      {initials}
    </div>
  );
}

export function SiteHeader() {
  const router = useRouter();
  const pathname = usePathname();

  const [user, setUser] = useState<HeaderUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!active) return;
      setUser(user ? { email: user.email ?? null } : null);
      setLoading(false);
    }

    load();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!active) return;
      setUser(session?.user ? { email: session.user.email ?? null } : null);
      setMenuOpen(false);
      router.refresh();
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    setMenuOpen(false);
    router.push("/");
    router.refresh();
  }

  const navLinkClass = (href: string) =>
    `text-sm transition ${
      pathname === href || (href !== "/" && pathname.startsWith(href))
        ? "text-white"
        : "text-white/75 hover:text-white"
    }`;

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-black/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-6">
        <Link href="/" className="text-xl font-semibold tracking-tight text-white">
          Backyrd
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          <Link href="/" className={navLinkClass("/")}>
            Discover
          </Link>

          {user && (
            <Link href="/owner" className={navLinkClass("/owner")}>
              Owner
            </Link>
          )}

          {loading ? (
            <div className="text-sm text-white/40">Lädt...</div>
          ) : user ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-2 py-2 transition hover:bg-white/10"
              >
                <InitialsBadge email={user.email} />
                <div className="pr-2 text-left">
                  <div className="text-sm font-medium text-white">Profil</div>
                  <div className="max-w-[180px] truncate text-xs text-white/50">
                    {user.email}
                  </div>
                </div>
              </button>

              {menuOpen && (
                <div className="absolute right-0 mt-3 w-64 overflow-hidden rounded-2xl border border-white/10 bg-[#111214] p-2 shadow-2xl">
                  <Link
                    href="/profile"
                    onClick={() => setMenuOpen(false)}
                    className="block rounded-xl px-4 py-3 text-sm text-white/85 transition hover:bg-white/5"
                  >
                    Profil ansehen
                  </Link>

                  <Link
                    href="/owner"
                    onClick={() => setMenuOpen(false)}
                    className="block rounded-xl px-4 py-3 text-sm text-white/85 transition hover:bg-white/5"
                  >
                    Owner Dashboard
                  </Link>

                  <Link
                    href="/login"
                    onClick={() => setMenuOpen(false)}
                    className="block rounded-xl px-4 py-3 text-sm text-white/85 transition hover:bg-white/5"
                  >
                    Auth & Konto
                  </Link>

                  <button
                    type="button"
                    onClick={handleLogout}
                    className="mt-1 block w-full rounded-xl px-4 py-3 text-left text-sm text-red-200/90 transition hover:bg-red-500/10"
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link href="/login" className={navLinkClass("/login")}>
              Login
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
