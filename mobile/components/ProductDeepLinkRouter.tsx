import { useEffect } from "react";
import * as Linking from "expo-linking";
import { useRootNavigationState, useRouter } from "expo-router";

import {
  consumeInitialProductDeepLink,
  resolveProductDeepLink,
} from "../lib/native-intent-route";

export default function ProductDeepLinkRouter() {
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const linkingUrl = Linking.useLinkingURL();

  useEffect(() => {
    if (!rootNavigationState?.key) return;

    const initialRoute =
      consumeInitialProductDeepLink() ??
      resolveProductDeepLink(linkingUrl ?? "");
    if (initialRoute) router.replace(initialRoute as never);
  }, [linkingUrl, rootNavigationState?.key, router]);

  return null;
}
