"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type Props = {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  eyebrow?: string;
  actions?: ReactNode;
};

type NavItem = { href: string; label: string; icon: string; exact?: boolean };

const nav: NavItem[] = [
  { href: "/owner", label: "Übersicht", icon: "◫", exact: true },
  { href: "/owner/analytics", label: "Performance", icon: "↗" },
  { href: "/owner/analytics/decision", label: "Decision", icon: "✦" },
  { href: "/owner/analytics/moments", label: "Moments", icon: "◉" },
  { href: "/owner/spots", label: "Meine Spots", icon: "⌖" },
];

export function OwnerShell({ children, title, subtitle, eyebrow = "OWNER INTELLIGENCE", actions }: Props) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (!data.session) {
        router.replace("/login?next=/owner");
        return;
      }
      setEmail(data.session.user.email ?? null);
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, [router]);

  const initials = useMemo(() => (email?.[0] ?? "B").toUpperCase(), [email]);

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login?next=/owner");
  }

  if (!ready) {
    return (
      <main className="min-h-screen bg-[#070708] text-white grid place-items-center">
        <div className="owner-loader" aria-label="Lädt" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#070708] text-white">
      <div className="owner-app-shell">
        <aside className="owner-sidebar">
          <div className="owner-brand-row">
            <div className="owner-brand-mark">B</div>
            <div>
              <div className="owner-brand-title">Backyrd</div>
              <div className="owner-brand-subtitle">Owner Intelligence</div>
            </div>
          </div>

          <nav className="owner-nav" aria-label="Owner Navigation">
            {nav.map((item) => {
              const active = item.exact
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link key={item.href} href={item.href} className={`owner-nav-item ${active ? "is-active" : ""}`}>
                  <span className="owner-nav-icon">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="owner-sidebar-spacer" />

          <div className="owner-account-card">
            <div className="owner-avatar">{initials}</div>
            <div className="owner-account-copy">
              <strong>Spot Owner</strong>
              <span title={email ?? undefined}>{email ?? "Owner Dashboard"}</span>
            </div>
          </div>

          <div className="owner-sidebar-actions">
            <Link href="/" className="owner-sidebar-button">Web ansehen</Link>
            <button type="button" onClick={logout} className="owner-sidebar-button owner-sidebar-button-muted">Logout</button>
          </div>

          <div className="owner-live"><span className="owner-live-dot" /> Live data</div>
        </aside>

        <section className="owner-main">
          {(title || subtitle || actions) && (
            <header className="owner-page-header">
              <div className="owner-page-copy">
                <div className="owner-page-eyebrow">{eyebrow}</div>
                {title && <h1>{title}</h1>}
                {subtitle && <p>{subtitle}</p>}
              </div>
              {actions && <div className="owner-page-actions">{actions}</div>}
            </header>
          )}
          {children}
        </section>
      </div>
    </main>
  );
}
