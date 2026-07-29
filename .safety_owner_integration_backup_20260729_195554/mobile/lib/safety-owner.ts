import { supabase } from "@/lib/supabase";

type ModeratedOwnerSaveResult = {
  event_id?: string | null;
};

export async function evaluateOwnerChangeMobile(
  result: unknown,
): Promise<void> {
  const eventId = (result as ModeratedOwnerSaveResult | null)?.event_id;
  if (!eventId) return;

  try {
    const { data: caseData, error: caseError } = await supabase.rpc(
      "safety_get_case_for_owner_change_v1",
      { p_owner_change_event_id: eventId },
    );

    if (caseError) {
      console.warn("[Safety] Case lookup failed", caseError.message);
      return;
    }

    const caseId = (caseData as { case_id?: string | null } | null)?.case_id;
    if (!caseId) return;

    const { error: invokeError } = await supabase.functions.invoke(
      "safety-evaluate",
      { body: { caseId } },
    );

    if (invokeError) {
      console.warn("[Safety] Evaluation remains queued", invokeError.message);
    }
  } catch (error) {
    console.warn("[Safety] Background evaluation failed", error);
  }
}
