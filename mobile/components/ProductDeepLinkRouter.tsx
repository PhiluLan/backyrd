import { useEffect } from "react";
import { useRouter } from "expo-router";

import { consumeInitialProductDeepLink } from "../lib/native-intent-route";

export default function ProductDeepLinkRouter() {
  const router = useRouter();

  useEffect(() => {
    const initialRoute = consumeInitialProductDeepLink();
    if (initialRoute) router.replace(initialRoute as never);
  }, [router]);

  return null;
}
