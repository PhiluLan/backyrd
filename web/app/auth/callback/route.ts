import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next =
    url.searchParams.get("next")?.startsWith("/") &&
    !url.searchParams.get("next")?.startsWith("//")
      ? url.searchParams.get("next")!
      : "/";
  if (code) {
    const client = await createSupabaseServerClient();
    await client.auth.exchangeCodeForSession(code);
  }
  return NextResponse.redirect(new URL(next, url.origin));
}
