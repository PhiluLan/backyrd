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
  { href: "/owner/analytics", label: "Einblicke", icon: "◈", exact: true },
  { href: "/owner/analytics/decision", label: "Empfehlungs-Aufrufe", icon: "✦" },
  { href: "/owner/analytics/moments", label: "Momente", icon: "◉" },
  { href: "/owner/spots", label: "Meine Spots", icon: "⌖" },
  { href: "/owner/world-knowledge", label: "Spot-Angaben", icon: "◎" },
];

export function OwnerShell({ children, title, subtitle, eyebrow = "DEIN OWNER-BEREICH", actions }: Props) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) {
        setLoadError(true);
        return;
      }
      if (!data.session) {
        router.replace("/login?next=/owner");
        return;
      }
      setEmail(data.session.user.email ?? null);
      setReady(true);
    }).catch(() => {
      if (active) setLoadError(true);
    });
    return () => {
      active = false;
    };
  }, [router]);

  const initials = useMemo(() => (email?.[0] ?? "B").toUpperCase(), [email]);
  const activeNavItem = nav.find((item) => item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`));

  const renderNavItems = (mobile: boolean) => nav.map((item) => {
    const active = item.exact
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(`${item.href}/`);
    return (
      <Link key={item.href} href={item.href} className={`owner-nav-item ${active ? "is-active" : ""}`}
        onClick={mobile ? () => setMobileMenuOpen(false) : undefined} aria-current={active ? "page" : undefined}>
        <span className="owner-nav-icon" aria-hidden="true">{item.icon}</span>
        <span>{item.label}</span>
      </Link>
    );
  });

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login?next=/owner");
  }

  if (loadError) {
    return <main className="owner-entry-error"><p>Dein Owner-Bereich konnte gerade nicht geladen werden.</p><button type="button" onClick={() => window.location.reload()}>Erneut versuchen</button></main>;
  }

  if (!ready) {
    return (
      <main className="owner-entry-loading">
        <div className="owner-loader" aria-label="Lädt" />
      </main>
    );
  }

  return (
    <main className="owner-private">
      <div className="owner-app-shell">
        <aside className="owner-sidebar">
          <div className="owner-brand-row">
            <div className="owner-brand-mark">b</div>
            <div>
              <div className="owner-brand-title">backyrd</div>
              <div className="owner-brand-subtitle">für Betreiber:innen</div>
            </div>
          </div>

          <nav className="owner-nav owner-nav-desktop" aria-label="Owner Navigation">{renderNavItems(false)}</nav>
          <details className="owner-mobile-menu" open={mobileMenuOpen}
            onToggle={(event) => setMobileMenuOpen(event.currentTarget.open)}>
            <summary aria-label={`Menü öffnen, aktuelle Seite: ${activeNavItem?.label ?? "Übersicht"}`}>
              <span aria-hidden="true" className="owner-mobile-menu-icon">☰</span>
              <span>{activeNavItem?.label ?? "Menü"}</span>
            </summary>
            <div className="owner-mobile-menu-panel">
              <nav aria-label="Owner Navigation mobil">{renderNavItems(true)}</nav>
              <div className="owner-mobile-menu-actions">
                <Link href="/" onClick={() => setMobileMenuOpen(false)}>Website</Link>
                <button type="button" onClick={logout}>Abmelden</button>
              </div>
            </div>
          </details>

          <div className="owner-sidebar-spacer" />

          <div className="owner-account-card">
            <div className="owner-avatar">{initials}</div>
            <div className="owner-account-copy">
              <strong>Dein Konto</strong>
              <span title={email ?? undefined}>{email ?? "Owner-Bereich"}</span>
            </div>
          </div>

          <div className="owner-sidebar-actions">
            <Link href="/" className="owner-sidebar-button">Website</Link>
            <button type="button" onClick={logout} className="owner-sidebar-button owner-sidebar-button-muted">Abmelden</button>
          </div>
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
