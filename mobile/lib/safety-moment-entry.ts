import { Alert } from "react-native";

import { getSafetyWriteStatus } from "./safety-enforcement";

type RouterLike = {
  push: (href: any) => void;
};

type OpenMomentComposerOptions = {
  router: RouterLike;
  href: string;
  onAllowed?: () => void | Promise<void>;
};

function formatRestrictionEnd(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat("de-CH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export async function openMomentComposerSafely({
  router,
  href,
  onAllowed,
}: OpenMomentComposerOptions): Promise<boolean> {
  const status = await getSafetyWriteStatus();

  if (!status || status.canWrite) {
    await onAllowed?.();
    router.push(href);
    return true;
  }

  const restrictionEnd = formatRestrictionEnd(
    status.activeMeasureEndsAt,
  );

  const body = restrictionEnd
    ? `Du kannst momentan keine neuen Moments, Reviews oder Kommentare veröffentlichen. Die Schreibsperre gilt voraussichtlich bis ${restrictionEnd}. Weitere Informationen findest du in deinem Safety Center.`
    : "Du kannst momentan keine neuen Moments, Reviews oder Kommentare veröffentlichen. Weitere Informationen findest du in deinem Safety Center.";

  Alert.alert(
    "Veröffentlichen vorübergehend gesperrt",
    body,
    [
      {
        text: "Safety Center öffnen",
        onPress: () => router.push("/safety/account-status"),
      },
      {
        text: "Verstanden",
        style: "cancel",
      },
    ],
  );

  return false;
}
