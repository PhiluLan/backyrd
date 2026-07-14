"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
const links = [
  ["/dashboard", "Overview", "◫"], ["/growth", "Growth", "↗"], ["/users", "Users", "◎"],
  ["/decision", "Decision", "✦"], ["/moments", "Moments", "◉"], ["/partners", "Partners", "◇"],
  ["/spots", "Spots", "⌖"], ["/errors", "Errors", "!"], ["/system", "System", "⚙"],
];
export function IntelligenceSidebar() {
  const pathname = usePathname() ?? "";
  return <aside className="bi-sidebar">
    <div className="bi-brand"><div className="bi-brandMark">B</div><div><strong>Backyrd</strong><span>Intelligence</span></div></div>
    <nav className="bi-nav">{links.map(([href,label,icon]) => {
      const active = href === "/dashboard" ? pathname === "/dashboard" || pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
      return <Link key={href} href={href} className={`bi-navItem ${active ? "active" : ""}`}><span>{icon}</span>{label}</Link>;
    })}</nav>
    <div className="bi-sidebarFooter"><span className="bi-liveDot" /> Live data</div>
  </aside>;
}
