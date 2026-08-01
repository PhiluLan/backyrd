"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type NavigationItem = {
  href: string;
  label: string;
  icon: string;
};

const navigationItems: NavigationItem[] = [
  { href: "/dashboard", label: "Overview", icon: "◫" },
  { href: "/growth", label: "Growth", icon: "↗" },
  { href: "/users", label: "Users", icon: "◎" },
  { href: "/decision", label: "Decision", icon: "✦" },
  { href: "/moments", label: "Moments", icon: "◉" },
  { href: "/partners", label: "Partners", icon: "◇" },
  { href: "/spots", label: "Spots", icon: "⌖" },
  { href: "/spot-quality", label: "Spot Quality", icon: "◈" },
  { href: "/taxonomy", label: "Taxonomy", icon: "◆" },
  { href: "/safety-integrity", label: "Safety & Integrity", icon: "◉" },
  { href: "/privacy", label: "Privacy & Legal", icon: "▣" },
  { href: "/errors", label: "Errors", icon: "!" },
  { href: "/system", label: "System", icon: "⚙" },
];

function isActivePath(pathname: string, href: string): boolean {
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
      {navigationItems.map(({ href, label, icon }) => {
        const active = isActivePath(pathname, href);

        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={`bi-navItem ${active ? "active" : ""}`}
          >
            <span aria-hidden="true">{icon}</span>
            {label}
          </Link>
        );
      })}
    </>
  );
}

export function IntelligenceSidebar() {
  const pathname = usePathname() ?? "";
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
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

        <nav className="bi-nav" aria-label="Founder Navigation">
          <NavigationLinks pathname={pathname} />
        </nav>

        <div className="bi-sidebarFooter">
          <span className="bi-liveDot" />
          Live data
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

        <nav className="bi-nav bi-mobileNav" aria-label="Mobile Founder Navigation">
          <NavigationLinks
            pathname={pathname}
            onNavigate={() => setMobileOpen(false)}
          />
        </nav>

        <div className="bi-mobileDrawerFooter">
          <span className="bi-liveDot" />
          Intelligence online
        </div>
      </aside>
    </>
  );
}
