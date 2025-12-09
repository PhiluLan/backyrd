import "./globals.css";
import Link from "next/link";
import Script from "next/script";

export const metadata = {
  title: "Admin Dashboard",
  description: "Backyrd Admin",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <head>
        <Script
          src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_API_KEY}&libraries=places`}
          strategy="beforeInteractive"
        />
      </head>
      <body className="bg-black text-white flex min-h-screen">
        {/* Sidebar */}
        <aside className="w-60 bg-gray-900 border-r border-gray-800 p-4 flex flex-col gap-4">
          <h1 className="text-xl font-bold mb-4">🧭 Dashboard</h1>
          <nav className="flex flex-col gap-2">
            <Link href="/dashboard" className="hover:bg-gray-800 px-3 py-2 rounded">🏠 Dashboard</Link>
            <Link href="/spots" className="hover:bg-gray-800 px-3 py-2 rounded">📍 Spots</Link>
            <Link href="/reviews" className="hover:bg-gray-800 px-3 py-2 rounded">📝 Reviews</Link>
            <Link href="/users" className="hover:bg-gray-800 px-3 py-2 rounded">👤 Benutzer</Link>
          </nav>
        </aside>

        {/* Content */}
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
