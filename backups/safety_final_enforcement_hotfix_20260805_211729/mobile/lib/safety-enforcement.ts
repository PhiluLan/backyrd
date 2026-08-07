import { supabase } from "./supabase";

export type SafetyWriteStatus = {
  activePoints: number;
  confirmedViolations: number;
  activeMeasureType: string | null;
  activeMeasureEndsAt: string | null;
  canWrite: boolean;
  requiresAccountReview: boolean;
};

export async function getSafetyWriteStatus():
Promise<SafetyWriteStatus | null> {
  const { data, error } = await supabase.rpc(
    "safety_user_enforcement_summary_v1",
    {},
  );

  if (error) {
    console.log("getSafetyWriteStatus failed", error);
    return null;
  }

  const row = Array.isArray(data) ? data[0] : data;

  if (!row) return null;

  return {
    activePoints: Number(row.active_points ?? 0),
    confirmedViolations: Number(
      row.confirmed_violations ?? 0,
    ),
    activeMeasureType:
      row.active_measure_type ?? null,
    activeMeasureEndsAt:
      row.active_measure_ends_at ?? null,
    canWrite: row.can_write !== false,
    requiresAccountReview:
      row.requires_account_review === true,
  };
}

export function getSafetyRestrictionMessage(
  error: unknown,
): string | null {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null
        ? String(
            (error as { message?: unknown }).message ?? "",
          )
        : String(error ?? "");

  if (message.includes("SAFETY_WRITE_RESTRICTED")) {
    return "Du kannst derzeit keine neuen Reviews, Moments oder Kommentare veröffentlichen. Öffne dein Safety Center für weitere Informationen.";
  }

  if (message.includes("SAFETY_DUPLICATE_REPORT")) {
    return "Du hast diesen Inhalt bereits gemeldet.";
  }

  if (
    message.includes("SAFETY_REPORT_RATE_LIMIT") ||
    message.includes("SAFETY_REPORTING_RESTRICTED")
  ) {
    return "Du hast in kurzer Zeit sehr viele Meldungen eingereicht. Bitte versuche es später erneut.";
  }

  return null;
}
