// mobile/components/PushNotificationRouter.tsx

import { useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";

import { resolveNotificationRoute } from "../lib/notification-route";

export default function PushNotificationRouter() {
  const router = useRouter();
  const handledResponseIdsRef = useRef(new Set<string>());

  useEffect(() => {
    const openResponse = (response: Notifications.NotificationResponse) => {
      const responseId = response.notification.request.identifier;
      if (!responseId || handledResponseIdsRef.current.has(responseId)) return;

      handledResponseIdsRef.current.add(responseId);

      const data = response.notification.request.content.data as
        | Record<string, unknown>
        | undefined;
      const route = resolveNotificationRoute(data);
      if (!route) return;

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
      if (response) openResponse(response);
    });

    return () => {
      responseSubscription.remove();
    };
  }, [router]);

  return null;
}
