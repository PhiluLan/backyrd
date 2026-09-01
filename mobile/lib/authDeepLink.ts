import { supabase } from "./supabase";

export type AuthDeepLinkResult = { kind: "verified" | "recovery" };

export async function createSessionFromAuthDeepLink(rawUrl: string): Promise<AuthDeepLinkResult> {
  const url = new URL(rawUrl);
  if (url.protocol !== "backyrd:") throw new Error("auth_callback_scheme_invalid");
  const route = `${url.hostname}${url.pathname}`.replace(/\/+$/, "");
  if (route !== "auth/callback" && route !== "auth/recovery") throw new Error("auth_callback_route_invalid");
  const query = new URLSearchParams(url.search);
  const fragment = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash);
  const errorCode = query.get("error_code") ?? fragment.get("error_code") ?? query.get("error") ?? fragment.get("error");
  if (errorCode) throw new Error("auth_callback_rejected");
  const code = query.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
  } else {
    const accessToken = fragment.get("access_token") ?? query.get("access_token");
    const refreshToken = fragment.get("refresh_token") ?? query.get("refresh_token");
    if (!accessToken || !refreshToken) throw new Error("auth_callback_session_missing");
    const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    if (error) throw error;
  }
  return { kind: route === "auth/recovery" || fragment.get("type") === "recovery" ? "recovery" : "verified" };
}
