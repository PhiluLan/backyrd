import { safeAccountReturnPath } from "@backyrd/shared";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
// A relative Location preserves the browser's original host behind proxies and
// during local development. Session cookies must remain on that same host.
function accountRedirect(path: string) {
  return new NextResponse(null, { status: 303, headers: { Location: path, "Cache-Control": "private, no-store" } });
}
export async function GET(request: Request) {
  const url = new URL(request.url);
  const providerError = url.searchParams.get("error") ?? url.searchParams.get("error_code");
  const code = url.searchParams.get("code");
  const next = safeAccountReturnPath(url.searchParams.get("next"));
  if (providerError) {
    return accountRedirect("/auth/error");
  }
  if (!code) {
    return accountRedirect("/auth/error");
  }
  if (code) {
    const client = await createSupabaseServerClient();
    try {
      const { data, error } = await client.auth.exchangeCodeForSession(code);
      if (error || !data.session) return accountRedirect("/auth/error");
    } catch { return accountRedirect("/auth/error"); }
  }
  return accountRedirect(next);
}
