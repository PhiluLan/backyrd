import { createClient } from "@supabase/supabase-js";

export type AdminAuthorizationResult =
  | { ok: true; userId: string }
  | { ok: false; status: 401 | 403 | 500; error: string };

export async function authorizeAdminRequest(request: Request): Promise<AdminAuthorizationResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return { ok: false, status: 500, error: "admin_auth_not_configured" };
  }

  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) {
    return { ok: false, status: 401, error: "authentication_required" };
  }

  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userError } = await client.auth.getUser(token);
  if (userError || !userData.user) {
    return { ok: false, status: 401, error: "invalid_session" };
  }

  const { data: isAdmin, error: adminError } = await client.rpc("admin_is_admin_v1");
  if (adminError || isAdmin !== true) {
    return { ok: false, status: 403, error: "admin_required" };
  }

  return { ok: true, userId: userData.user.id };
}
