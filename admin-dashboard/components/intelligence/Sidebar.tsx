"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useEffect, useState } from "react";

type NavigationItem = {
  href: string;
  label: string;
  icon: string;
  groupLabel?: string;
};

const navigationItems: NavigationItem[] = [
  { href: "/founder", label: "Founder Cockpit", icon: "B", groupLabel: "Founder" },
  { href: "/founder/launch-readiness", label: "Launch-Status", icon: "◎" },
  { href: "/founder/engineering", label: "Entwicklung", icon: "⌘" },
  { href: "/dashboard", label: "Betriebsübersicht", icon: "◫", groupLabel: "Operations" },
  { href: "/growth", label: "Wachstum", icon: "↗" },
  { href: "/spots", label: "Spots", icon: "⌖", groupLabel: "Spots" },
  { href: "/spot-quality", label: "Spot-Qualität", icon: "◈" },
  { href: "/taxonomy", label: "Taxonomie", icon: "◆" },
  { href: "/reviews", label: "Reviews", icon: "✎" },
  { href: "/users", label: "Nutzer", icon: "◎", groupLabel: "Menschen" },
  { href: "/claims", label: "Betreiber-Anfragen", icon: "◇" },
  { href: "/partners", label: "Betreiber & Partner", icon: "◈" },
  { href: "/safety-integrity", label: "Vertrauen & Moderation", icon: "!", groupLabel: "Vertrauen" },
  { href: "/trust-moderation", label: "Betreiber-Änderungen", icon: "↺" },
  { href: "/privacy", label: "Datenschutz", icon: "▣" },
  { href: "/decision", label: "Empfehlungen", icon: "✦", groupLabel: "System" },
  { href: "/moments", label: "Momente", icon: "◉" },
  { href: "/moods", label: "Stimmungs-Signale", icon: "◇" },
  { href: "/errors", label: "Fehler", icon: "!" },
  { href: "/system", label: "Systemstatus", icon: "⚙" },
];

function isActivePath(pathname: string, href: string): boolean {
  if (href === "/founder") {
    return pathname === href;
  }
  if (href === "/dashboard") {
    return pathname === "/" || pathname === "/dashboard";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavigationLinks({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <>
      {navigationItems.map(({ href, label, icon, groupLabel }) => {
        const active = isActivePath(pathname, href);

        return (
          <Fragment key={href}>
            {groupLabel ? <div className="bi-navGroup">{groupLabel}</div> : null}
            <Link
              href={href}
              onClick={onNavigate}
              className={`bi-navItem ${active ? "active" : ""}`}
            >
              <span aria-hidden="true">{icon}</span>
              {label}
            </Link>
          </Fragment>
        );
      })}
    </>
  );
}

export function IntelligenceSidebar() {
  const pathname = usePathname() ?? "";
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const closeAfterNavigation = window.setTimeout(() => setMobileOpen(false), 0);
    return () => window.clearTimeout(closeAfterNavigation);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) {
      document.body.classList.remove("bi-mobileMenuOpen");
      return;
    }

    document.body.classList.add("bi-mobileMenuOpen");

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMobileOpen(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.classList.remove("bi-mobileMenuOpen");
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileOpen]);

  return (
    <>
      <aside className="bi-sidebar">
        <div className="bi-brand">
          <div className="bi-brandMark">B</div>
          <div>
            <strong>Backyrd</strong>
            <span>Intelligence</span>
          </div>
        </div>

        <nav className="bi-nav" aria-label="Founder-Navigation">
          <NavigationLinks pathname={pathname} />
        </nav>

        <div className="bi-sidebarFooter">
          <span className="bi-liveDot" />
          Live-Daten
        </div>
      </aside>

      <header className="bi-mobileHeader">
        <Link href="/dashboard" className="bi-mobileBrand" aria-label="Backyrd Intelligence">
          <div className="bi-brandMark">B</div>
          <div>
            <strong>Backyrd</strong>
            <span>Intelligence</span>
          </div>
        </Link>

        <button
          type="button"
          className="bi-mobileMenuButton"
          aria-label={mobileOpen ? "Menü schließen" : "Menü öffnen"}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((current) => !current)}
        >
          <span />
          <span />
          <span />
        </button>
      </header>

      <nav className="bi-mobileQuickNav" aria-label="Schnellnavigation">
        <Link href="/dashboard" className={isActivePath(pathname, "/dashboard") ? "active" : ""}><span>◫</span>Übersicht</Link>
        <Link href="/spots" className={isActivePath(pathname, "/spots") ? "active" : ""}><span>⌖</span>Spots</Link>
        <Link href="/reviews" className={isActivePath(pathname, "/reviews") ? "active" : ""}><span>✎</span>Reviews</Link>
        <Link href="/safety-integrity" className={isActivePath(pathname, "/safety-integrity") ? "active" : ""}><span>!</span>Safety</Link>
      </nav>

      <button
        type="button"
        className={`bi-mobileBackdrop ${mobileOpen ? "open" : ""}`}
        aria-label="Menü schließen"
        tabIndex={mobileOpen ? 0 : -1}
        onClick={() => setMobileOpen(false)}
      />

      <aside
        className={`bi-mobileDrawer ${mobileOpen ? "open" : ""}`}
        aria-hidden={!mobileOpen}
      >
        <div className="bi-mobileDrawerHead">
          <div>
            <span>Founder Cockpit</span>
            <strong>Navigation</strong>
          </div>

          <button
            type="button"
            className="bi-mobileClose"
            aria-label="Menü schließen"
            onClick={() => setMobileOpen(false)}
          >
            ×
          </button>
        </div>

        <nav className="bi-nav bi-mobileNav" aria-label="Mobile Founder-Navigation">
          <NavigationLinks
            pathname={pathname}
            onNavigate={() => setMobileOpen(false)}
          />
        </nav>

        <div className="bi-mobileDrawerFooter">
          <span className="bi-liveDot" />
          Live-Daten verfügbar
        </div>
      </aside>
    </>
  );
}
