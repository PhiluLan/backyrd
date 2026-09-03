const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type NotificationData = Record<string, unknown> | undefined;

/**
 * Notification taps may only enter explicitly supported Product routes.
 * Provider payloads are untrusted input: unknown types, arbitrary routes and
 * malformed identifiers must never become navigation targets.
 */
export function resolveNotificationRoute(
  data: NotificationData,
): string | null {
  if (data?.type === "direct_message") {
    const chatId = data.chat_id;
    return typeof chatId === "string" && UUID_PATTERN.test(chatId)
      ? `/messages/${chatId}`
      : null;
  }

  if (data?.type === "test_push" && data.route === "/privacy-consent") {
    return "/privacy-consent";
  }

  return null;
}
