import { NextResponse, type NextRequest } from "next/server";
import { refreshSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  // These surfaces authenticate through their own capability/worker/provider
  // proofs. A stale consumer cookie must not block them on Auth refresh.
  if (["/booking/manage", "/api/booking/guest", "/api/booking/mail/dispatch", "/api/booking/mail/events"].includes(request.nextUrl.pathname)) {
    const response = NextResponse.next({ request });
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  }
  const response = await refreshSession(request);
  const privatePrefixes = [
    "/auth",
    "/login",
    "/signup",
    "/verify",
    "/onboarding",
    "/profile",
    "/users",
    "/messages",
    "/settings",
    "/favorites",
    "/achievements",
    "/notifications",
    "/reviews/new",
    "/search",
    "/owner",
    "/booking/console",
    "/booking/manage",
  ];
  if (privatePrefixes.some((prefix) => request.nextUrl.pathname.startsWith(prefix))) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|\\.well-known/apple-app-site-association|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
