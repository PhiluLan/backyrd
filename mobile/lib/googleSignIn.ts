import * as WebBrowser from "expo-web-browser";

import { createSessionFromAuthDeepLink } from "./authDeepLink";
import { supabase } from "./supabase";

const redirectTo = "backyrd://auth/callback";

export async function signInWithGoogle(): Promise<boolean> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data.url) throw new Error("google_authorization_url_missing");

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== "success" || !result.url) return false;

  await createSessionFromAuthDeepLink(result.url);
  return true;
}
