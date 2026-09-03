// mobile/components/PushNotificationRouter.tsx

import { useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";
import {
  usePathname,
  useRootNavigationState,
  useRouter,
} from "expo-router";

import { resolveNotificationRoute } from "../lib/notification-route";

function notificationTargetKind(
  route: string | null,
): "direct_message" | "test_push" | "none" {
  if (route?.startsWith("/messages/")) return "direct_message";
  if (route === "/privacy-consent") return "test_push";
  return "none";
}

export default function PushNotificationRouter() {
  const router = useRouter();
  const pathname = usePathname();
  const rootNavigationState = useRootNavigationState();
  const handledResponseIdsRef = useRef(new Set<string>());

  useEffect(() => {
    console.log(
      `[cold-start-push] navigation target=${notificationTargetKind(pathname)}`,
    );
  }, [pathname]);

  useEffect(() => {
    if (!rootNavigationState?.key) return;

    console.log("[cold-start-push] root navigation ready=true");

    const openResponse = (response: Notifications.NotificationResponse) => {
      const responseId = response.notification.request.identifier;
      if (!responseId) {
        console.log("[cold-start-push] response identifier present=false");
        return;
      }
      if (handledResponseIdsRef.current.has(responseId)) {
        console.log("[cold-start-push] duplicate blocked=true");
        return;
      }

      handledResponseIdsRef.current.add(responseId);

      const data = response.notification.request.content.data as
        | Record<string, unknown>
        | undefined;
      const route = resolveNotificationRoute(data);
      const targetKind = notificationTargetKind(route);
      console.log(
        `[cold-start-push] response authorized=${route !== null} target=${targetKind}`,
      );
      if (!route) return;

      console.log(`[cold-start-push] dispatch target=${targetKind}`);
      router.push(route as any);
      void Notifications.clearLastNotificationResponseAsync().catch(() => {
        // Routing already succeeded. A future duplicate remains guarded for
        // this mounted session and will be retried fail-closed on next launch.
      });
    };

    const responseSubscription =
      Notifications.addNotificationResponseReceivedListener((response) => {
        openResponse(response);
      });

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      console.log(
        `[cold-start-push] retained response present=${response !== null}`,
      );
      if (response) openResponse(response);
    });

    return () => {
      responseSubscription.remove();
    };
  }, [rootNavigationState?.key, router]);

  return null;
}
