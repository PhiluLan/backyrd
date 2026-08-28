"use client";

import { usePathname } from "next/navigation";
import { IntelligenceSidebar } from "@/components/intelligence/Sidebar";

export function AdminShell({children}:{children:React.ReactNode}){
  const pathname=usePathname();
  if(pathname==="/login")return <main className="bi-loginMain">{children}</main>;
  return <div className="bi-shell"><IntelligenceSidebar/><main className="bi-main">{children}</main></div>;
}
