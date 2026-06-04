import "./globals.css";
import Link from "next/link";
import Script from "next/script";

export const metadata = {
  title: "Backyrd Admin",
  description: "Backyrd Admin Dashboard",
};

function NavLink({
  href,
  icon,
  label,
}: {
  href: string;
  icon: string;
  label: string;
}) {
  return (
    <Link href={href} className="by-navlink">
      <span className="by-navicon">{icon}</span>
      <span>{label}</span>
    </Link>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const googleKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY;

  return (
    <html lang="de">
      <head>
        {googleKey ? (
          <Script
            id="google-maps"
            src={`https://maps.googleapis.com/maps/api/js?key=${googleKey}&libraries=places`}
            strategy="beforeInteractive"
          />
        ) : null}
      </head>

      <body>
        <div className="by-app">
          <aside className="by-sidebar">
            <div className="by-card by-sidebarCard">
              <div className="by-sidebarHeader">
                <div className="by-avatarStub" />
                <div className="by-sidebarTitle">
                  <div className="by-h2">Dashboard</div>
                  <div className="by-muted by-small">Backyrd Admin</div>
                </div>
              </div>

              <div className="by-sidebarLinks">
                <NavLink href="/dashboard" icon="🏠" label="Dashboard" />
                <NavLink href="/spots" icon="📍" label="Spots" />
                <NavLink href="/claims" icon="✅" label="Claims" />
                <NavLink href="/moods" icon="🧠" label="Moods" />
                <NavLink href="/reviews" icon="📝" label="Reviews" />
                <NavLink href="/users" icon="👤" label="Benutzer" />
              </div>

              <div className="by-sidebarHint">
                <div className="by-muted by-xs">Tipp</div>
                <div className="by-muted by-small by-hintText">
                  Betreiber-Claims erst nach bestätigter Business-Mail prüfen.
                  Nach Approval erscheint automatisch das verifizierte Betreiber-Badge.
                </div>
              </div>
            </div>
          </aside>

          <main className="by-content">
            <div className="by-container">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}