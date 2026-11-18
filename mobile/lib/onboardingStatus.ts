import { supabase } from "./supabase";

export type ProductEntryStatus = {
  loggedIn: boolean;
  userId: string | null;
  profileBasicsComplete: boolean;
  tasteOnboardingComplete: boolean;
  personalizationConsentValid: boolean;
  canEnterDecision: boolean;
  needsProfileOnboarding: boolean;
  needsDecisionOnboarding: boolean;
  semanticContractVersion: string | null;
  nextRoute: "/auth/login" | "/onboarding/profile" | "/onboarding/decision" | "/(tabs)";
};

export async function getMyProductEntryStatus(signal?: AbortSignal): Promise<ProductEntryStatus> {
  const request = supabase.rpc("get_my_product_entry_status_v1");
  const { data, error } = await (signal ? request.abortSignal(signal) : request);
  if (error) throw error;

  const row = (Array.isArray(data) ? data[0] : data) as ProductEntryStatus | null;
  if (!row || typeof row.canEnterDecision !== "boolean") {
    throw new Error("invalid_product_entry_status");
  }
  return row;
}
