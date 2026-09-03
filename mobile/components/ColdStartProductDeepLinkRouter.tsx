import { useEffect, useRef } from "react";
import * as Linking from "expo-linking";
import * as Notifications from "expo-notifications";
import {
  usePathname,
  useRootNavigationState,
  useRouter,
} from "expo-router";
import { Platform } from "react-native";

import { resolveProductDeepLink } from "../lib/native-intent-route";
import {
  acknowledgeNativeInitialTarget,
  pullNativeInitialTarget,
  resolveNativeInitialTargetRoute,
  type NativeInitialTarget,
} from "../lib/native-initial-target";

const acceptedNativeReceipts = new Set<string>();

function productTargetKind(route: string | null): "spot" | "user" | "none" {
  if (route?.startsWith("/spot/")) return "spot";
  if (route?.startsWith("/user/")) return "user";
  return "none";
}

function nativeTargetKind(target: NativeInitialTarget): string {
  return `${target.provenance}:${target.targetType}`;
}

export default function ColdStartProductDeepLinkRouter({
  ready,
}: {
  ready: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const rootNavigationState = useRootNavigationState();
  const pathnameRef = useRef(pathname);

  useEffect(() => {
    pathnameRef.current = pathname;
    console.log(
      `[cold-start-link] navigation target=${productTargetKind(pathname)}`,
    );
  }, [pathname]);

  useEffect(() => {
    if (!ready || !rootNavigationState?.key) return;

    console.log("[cold-start-link] root navigation ready=true");
    let cancelled = false;

    if (Platform.OS === "ios") {
      void pullNativeInitialTarget()
        .then(async (target) => {
          if (cancelled || !target) {
            console.log(
              `[native-initial-target] pulled present=${target !== null}`,
            );
            return;
          }

          const route = resolveNativeInitialTargetRoute(target);
          console.log(
            `[native-initial-target] pulled present=true target=${nativeTargetKind(target)} authorized=${route !== null}`,
          );
          if (!route) return;

          if (!acceptedNativeReceipts.has(target.receipt)) {
            acceptedNativeReceipts.add(target.receipt);
            try {
              console.log(
                `[native-initial-target] dispatch target=${nativeTargetKind(target)}`,
              );
              if (target.provenance === "deep_link") {
                if (pathnameRef.current !== route) {
                  router.replace(route as never);
                }
              } else {
                router.push(route as never);
              }
            } catch {
              acceptedNativeReceipts.delete(target.receipt);
              console.log("[native-initial-target] dispatch accepted=false");
              return;
            }
          } else {
            console.log("[native-initial-target] duplicate dispatch blocked=true");
          }

          const acknowledged = await acknowledgeNativeInitialTarget(
            target.receipt,
          );
          console.log(
            `[native-initial-target] acknowledged=${acknowledged}`,
          );
          if (acknowledged && target.provenance === "notification") {
            void Notifications.clearLastNotificationResponseAsync().catch(() => {
              // The native receipt remains acknowledged. This best-effort clear
              // only prevents Expo from retaining a second representation.
            });
          }
        })
        .catch(() => {
          console.log("[native-initial-target] pull unavailable");
        });
      return () => {
        cancelled = true;
      };
    }

    // Non-iOS clients retain the established initial-URL contract. iOS never
    // falls back to timing-dependent Linking.getInitialURL().
    void Linking.getInitialURL()
      .then((rawUrl) => {
        if (cancelled) return;
        const initialRoute = resolveProductDeepLink(rawUrl ?? "");
        const targetKind = productTargetKind(initialRoute);
        console.log(
          `[cold-start-link] initial-url present=${Boolean(rawUrl)} authorized=${initialRoute !== null} target=${targetKind}`,
        );
        if (initialRoute && pathnameRef.current !== initialRoute) {
          console.log(`[cold-start-link] dispatch target=${targetKind}`);
          router.replace(initialRoute as never);
        }
      })
      .catch(() => {
        console.log("[cold-start-link] native initial URL unavailable");
      });

    return () => {
      cancelled = true;
    };
  }, [ready, rootNavigationState?.key, router]);

  return null;
}
