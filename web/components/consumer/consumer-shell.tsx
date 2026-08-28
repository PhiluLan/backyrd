"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase/client";
import { Avatar, ButtonLink } from "./ui";
import {
  CompassIcon,
  MomentsIcon,
  PlacesIcon,
  SearchIcon,
  SparkIcon,
  UserIcon,
} from "./icons";

const items = [
  { href: "/", label: "Entdecken", Icon: CompassIcon },
  { href: "/decision", label: "Für jetzt", Icon: SparkIcon },
  { href: "/places", label: "Orte", Icon: PlacesIcon },
  { href: "/moments", label: "Momente", Icon: MomentsIcon },
];
function current(pathname: string, href: string) {
  return href === "/"
    ? pathname === "/"
    : pathname === href || pathname.startsWith(`${href}/`);
}
export function ConsumerShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<{
    email?: string | null;
    avatar?: string | null;
    name?: string | null;
  } | null>(null);
  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(async ({ data }) => {
      if (!active || !data.user) return active && setUser(null);
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name,first_name,avatar_url")
        .eq("id", data.user.id)
        .maybeSingle();
      if (active)
        setUser({
          email: data.user.email,
          avatar: profile?.avatar_url,
          name: profile?.display_name || profile?.first_name,
        });
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      if (!session) setUser(null);
      router.refresh();
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [router]);
  const displayName = useMemo(
    () => user?.name || user?.email || "Profil",
    [user],
  );
  if (pathname.startsWith("/owner")) return children;
  return (
    <div className="b-app">
      <header className="b-header">
        <div className="b-container b-header-inner">
          <Link href="/" className="b-logo" aria-label="Backyrd Startseite">
            BACKYRD
          </Link>
          <nav className="b-nav" aria-label="Hauptnavigation">
            {items.map(({ href, label, Icon }) => (
              <Link
                key={href}
                href={href}
                className="b-nav-link"
                aria-current={current(pathname, href) ? "page" : undefined}
              >
                <Icon />
                {label}
              </Link>
            ))}
          </nav>
          <div className="b-header-actions">
            <Link
              href="/search"
              className="b-button b-button-tertiary b-icon-button"
              aria-label="Suchen"
            >
              <SearchIcon />
            </Link>
            {user ? (
              <Link href="/profile" aria-label="Profil öffnen">
                <Avatar src={user.avatar} name={displayName} size="sm" />
              </Link>
            ) : (
              <ButtonLink
                href={`/login?next=${encodeURIComponent(pathname)}`}
                variant="secondary"
              >
                <span className="b-nav-label">Anmelden</span>
                <UserIcon />
              </ButtonLink>
            )}
          </div>
        </div>
      </header>
      <main>{children}</main>
      <nav className="b-mobile-nav" aria-label="Mobile Hauptnavigation">
        {items.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            className="b-nav-link"
            aria-current={current(pathname, href) ? "page" : undefined}
          >
            <Icon />
            {label}
          </Link>
        ))}
        <Link
          href={user ? "/profile" : "/login"}
          className="b-nav-link"
          aria-current={pathname.startsWith("/profile") ? "page" : undefined}
        >
          <UserIcon />
          Profil
        </Link>
      </nav>
    </div>
  );
}
