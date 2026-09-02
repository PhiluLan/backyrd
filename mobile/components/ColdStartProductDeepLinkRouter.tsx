import { useEffect, useRef } from "react";
import {
  usePathname,
  useRootNavigationState,
  useRouter,
} from "expo-router";

import {
  markProductDeepLinkRouterNotReady,
  markProductDeepLinkRouterReady,
} from "../lib/native-intent-route";

/**
 * Replays only a validated Product URL that reached +native-intent before the
 * root navigator became usable. Once ready, Expo Router exclusively owns every
 * subsequent runtime URL.
 */
export default function ColdStartProductDeepLinkRouter() {
  const router = useRouter();
  const pathname = usePathname();
  const rootNavigationState = useRootNavigationState();
  const pathnameRef = useRef(pathname);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    if (!rootNavigationState?.key) return;

    const initialRoute = markProductDeepLinkRouterReady();
    if (initialRoute && pathnameRef.current !== initialRoute) {
      router.replace(initialRoute as never);
    }

    return markProductDeepLinkRouterNotReady;
  }, [rootNavigationState?.key, router]);

  return null;
}
