import { useEffect, useRef } from "react";
import * as Linking from "expo-linking";
import {
  usePathname,
  useRootNavigationState,
  useRouter,
} from "expo-router";

import { resolveProductDeepLink } from "../lib/native-intent-route";

/**
 * iOS can expose a custom-scheme launch URL through Linking.getLinkingURL()
 * without delivering it as Expo Router's initial navigation state. Capture only
 * that immutable launch value and replay it once the root navigator is ready.
 * Runtime URL events remain exclusively owned by Expo Router.
 */
export default function ColdStartProductDeepLinkRouter() {
  const router = useRouter();
  const pathname = usePathname();
  const rootNavigationState = useRootNavigationState();
  const initialRouteRef = useRef(
    resolveProductDeepLink(Linking.getLinkingURL() ?? ""),
  );
  const handledRef = useRef(false);

  useEffect(() => {
    const initialRoute = initialRouteRef.current;
    if (handledRef.current || !rootNavigationState?.key || !initialRoute) return;

    handledRef.current = true;
    if (pathname !== initialRoute) router.replace(initialRoute as never);
  }, [pathname, rootNavigationState?.key, router]);

  return null;
}
