// mobile/components/PushNotificationRouter.tsx

import { useEffect } from "react";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";

function chatIdFromNotification(
  notification: Notifications.Notification,
): string | null {
  const data = notification.request.content.data as
    | Record<string, unknown>
    | undefined;

  const chatId = data?.chat_id;
  return typeof chatId === "string" && chatId.length > 0
    ? chatId
    : null;
}

export default function PushNotificationRouter() {
  const router = useRouter();

  useEffect(() => {
    const openChat = (notification: Notifications.Notification) => {
      const chatId = chatIdFromNotification(notification);
      if (!chatId) return;

      router.push(`/messages/${chatId}` as any);
    };

    const responseSubscription =
      Notifications.addNotificationResponseReceivedListener((response) => {
        openChat(response.notification);
      });

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) openChat(response.notification);
    });

    return () => {
      responseSubscription.remove();
    };
  }, [router]);

  return null;
}
