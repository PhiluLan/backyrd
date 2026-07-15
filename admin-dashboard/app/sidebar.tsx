"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard" || pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export function Sidebar() {
  const pathname = usePathname() ?? "";

  const links = [
    { href: "/dashboard", label: "Dashboard", icon: "🏠" },
    { href: "/spots", label: "Spots", icon: "📍" },
    { href: "/claims", label: "Claims", icon: "✅" },
    { href: "/moods", label: "Moods", icon: "🧠" },
    { href: "/reviews", label: "Reviews", icon: "📝" },
    { href: "/users", label: "Benutzer", icon: "👤" },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 px-2 py-2">
        <div className="h-9 w-9 rounded-full bg-[rgba(255,255,255,0.08)] border border-[rgba(255,255,255,0.10)] flex items-center justify-center">
          🧭
        </div>
        <div>
          <div className="text-[15px] font-black leading-tight">Dashboard</div>
          <div className="text-[12px] muted leading-tight">Backyrd Admin</div>
        </div>
      </div>

      <nav className="flex flex-col gap-2">
        {links.map((l) => {
          const active = isActive(pathname, l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`navlink ${active ? "navlink-active" : ""}`}
            >
              <span className="text-lg">{l.icon}</span>
              <span>{l.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto pt-3">
        <div className="card p-3">
          <div className="text-sm font-black">Tipp</div>
          <div className="text-xs muted mt-1 leading-relaxed">
            Prüfe Betreiber-Claims erst nach bestätigter Business-Mail. Nach Approval
            erscheint der Betreiber-Badge automatisch am Spot.
          </div>
        </div>
      </div>
    </div>
  );
}
