"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./analytics.module.css";

const sections = [
  ["/growth", "Überblick"],
  ["/growth/pages", "Seiten & Screens"],
  ["/growth/seo", "SEO"],
] as const;

export default function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return <>
    <nav className={styles.nav} aria-label="Analytics">
      {sections.map(([href, label]) => <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined}>{label}</Link>)}
    </nav>
    {children}
  </>;
}
