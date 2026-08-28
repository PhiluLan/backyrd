import type { NextRequest } from "next/server";
import { refreshSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
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
  ];
  if (privatePrefixes.some((prefix) => request.nextUrl.pathname.startsWith(prefix))) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
