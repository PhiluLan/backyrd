import { useEffect, useRef } from "react";
import * as Linking from "expo-linking";
import {
  usePathname,
  useRootNavigationState,
  useRouter,
} from "expo-router";

import { resolveProductDeepLink } from "../lib/native-intent-route";

/**
 * Expo Router uses ExpoLinking's synchronous iOS URL value for initial state.
 * Safari-confirmed custom-scheme launches can reach React Native's retained
 * initial URL instead. Read that native launch value once, after the root
 * navigator is ready; runtime URL events remain exclusively owned by Expo
 * Router.
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

    let cancelled = false;
    void Linking.getInitialURL()
      .then((rawUrl) => {
        if (cancelled) return;
        const initialRoute = resolveProductDeepLink(rawUrl ?? "");
        if (initialRoute && pathnameRef.current !== initialRoute) {
          router.replace(initialRoute as never);
        }
      })
      .catch(() => {
        console.log("[cold-start-link] native initial URL unavailable");
      });

    return () => {
      cancelled = true;
    };
  }, [rootNavigationState?.key, router]);

  return null;
}
