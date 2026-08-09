import type { FounderGateStatus, FounderPriority, FounderSourceType } from "@/types/founder";

export const gateStatusLabels: Record<FounderGateStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  verify: "Verify",
  verified: "Verified",
  accepted_risk: "Accepted risk",
};

export const sourceLabels: Record<FounderSourceType, string> = {
  automatic: "Automatic",
  system: "System",
  manual: "Manual",
};

export const priorityOrder: Record<FounderPriority, number> = { P0: 0, P1: 1, P2: 2 };

export function founderDate(value?: string | null): string {
  return value
    ? new Date(value).toLocaleString("de-CH", { dateStyle: "medium", timeStyle: "short" })
    : "—";
}
export function founderNumber(value: number): string {
  return new Intl.NumberFormat("de-CH").format(value);
}
