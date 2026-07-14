import "./globals.css";
import AdminGuard from "@/components/AdminGuard";
import { IntelligenceSidebar } from "@/components/intelligence/Sidebar";
export const metadata = { title: "Backyrd Intelligence", description: "Founder Intelligence Dashboard for Backyrd" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="de"><body><AdminGuard><div className="bi-shell"><IntelligenceSidebar /><main className="bi-main">{children}</main></div></AdminGuard></body></html>;
}
