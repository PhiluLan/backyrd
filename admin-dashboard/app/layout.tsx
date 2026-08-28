import "./globals.css";
import AdminGuard from "@/components/AdminGuard";
import { AdminShell } from "@/components/AdminShell";
export const metadata = { title: "Backyrd Intelligence", description: "Founder Intelligence Dashboard for Backyrd" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="de" data-scroll-behavior="smooth"><body><AdminGuard><AdminShell>{children}</AdminShell></AdminGuard></body></html>;
}
