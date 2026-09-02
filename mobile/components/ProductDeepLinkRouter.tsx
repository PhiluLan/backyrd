import { useEffect } from "react";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";

import {
  consumeInitialProductDeepLink,
  resolveProductDeepLink,
} from "../lib/native-intent-route";

export default function ProductDeepLinkRouter() {
  const router = useRouter();
  const linkingUrl = Linking.useLinkingURL();

  useEffect(() => {
    const initialRoute =
      consumeInitialProductDeepLink() ??
      resolveProductDeepLink(linkingUrl ?? "");
    if (initialRoute) router.replace(initialRoute as never);
  }, [linkingUrl, router]);

  return null;
}
