import { setPendingAuthRedirect } from "../lib/pendingAuthRedirect";
import {
  rememberProductDeepLinkBeforeRouterReady,
  resolveProductDeepLink,
} from "../lib/native-intent-route";

type RedirectSystemPathOptions = {
  path: string;
  initial: boolean;
};

export function redirectSystemPath(options: RedirectSystemPathOptions): string {
  const rawPath = options?.path ?? "";

  try {
    /**
     * Supabase/AuthSession kann je nach Provider oder Flow solche URLs zurückgeben:
     *
     * backyrd:///
     * backyrd://
     * backyrd://?access_token=...
     * backyrd://login-callback
     * backyrd://auth/callback
     *
     * Expo Router versucht daraus eine echte Route zu machen.
     * Wenn es keine passende Datei gibt, landet man auf "Unmatched Route".
     *
     * Unsere App soll nach jedem Auth-Callback immer zentral durch /gate.
     */
    if (rawPath.startsWith("backyrd://")) {
      const url = new URL(rawPath);
      const route = `${url.hostname}${url.pathname}`.replace(/\/+$/, "");
      if (route === "auth/callback" || route === "auth/recovery") {
        setPendingAuthRedirect(rawPath);
        return "/auth/callback";
      }
    }

    const productDeepLink = resolveProductDeepLink(rawPath);
    if (productDeepLink) {
      if (!options.initial) {
        rememberProductDeepLinkBeforeRouterReady(productDeepLink);
      }
      return productDeepLink;
    }

    if (
      rawPath === "" ||
      rawPath === "/" ||
      rawPath === "///" ||
      rawPath.startsWith("backyrd://")
    ) {
      return "/gate";
    }

    return "/gate";
  } catch {
    console.log("[native-intent] invalid redirect discarded");
    return "/gate";
  }
}
