import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AUTHORING_FIELDS, validateAuthoringSubmission } from "@backyrd/world-knowledge-core";
import { readWorldResearchDetail, WORLD_RESEARCH_SPOT_ID } from "./worldResearchExport";

export type ResearchFieldEdit = { spotId?: unknown; attributeKey?: unknown; knowledgeState?: unknown; value?: unknown; validUntil?: unknown; expectedClaimId?: unknown; idempotencyKey?: unknown };
export const sameValue = (a: unknown, b: unknown): boolean => JSON.stringify(a, (_key, item: unknown) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a],[b]) => a.localeCompare(b))) : item) === JSON.stringify(b, (_key, item: unknown) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a],[b]) => a.localeCompare(b))) : item);

export async function researchFieldEdit(actor: SupabaseClient, service: SupabaseClient | null, actorId: string, input: ResearchFieldEdit, save: boolean) {
  if (typeof input.spotId !== "string" || !WORLD_RESEARCH_SPOT_ID.test(input.spotId)) throw new Error("Ungültiger Ort.");
  const detail = await readWorldResearchDetail(actor,input.spotId);
  const answers = Object.fromEntries(Object.entries(detail.answers ?? {}).filter(([,answer]) => answer.visibility === "PUBLIC"));
  if (!save) return { answers };
  const field = AUTHORING_FIELDS.find(field => field.attributeKey === input.attributeKey);
  if (!field || !detail.actor?.allowedAttributeKeys?.includes(field.attributeKey) || typeof input.knowledgeState !== "string") throw new Error("Dieses Feld ist nicht freigegeben.");
  const validated = validateAuthoringSubmission(field.attributeKey,input.knowledgeState,input.value);
  if (!validated.ok) throw new Error(validated.message);
  if (typeof input.idempotencyKey !== "string" || !/^research-edit:[0-9a-f-]{36}$/.test(input.idempotencyKey)) throw new Error("Ungültige Speicherkennung.");
  if (input.validUntil !== undefined && (typeof input.validUntil !== "string" || !Number.isFinite(Date.parse(input.validUntil)))) throw new Error("Ungültiges Gültig-bis-Datum.");
  if (field.attributeKey === "state.current" && !input.validUntil) throw new Error("Bitte ein Gültig-bis-Datum angeben.");
  if (!service) throw new Error("Die Profilaktualisierung ist derzeit nicht verfügbar. Es wurde nichts gespeichert.");
  const current = detail.answers?.[field.attributeKey];
  const alreadySaved = current?.knowledgeState === input.knowledgeState && sameValue(current?.value,validated.value) && (current?.validUntil ?? null) === (input.validUntil ?? null);
  if (!alreadySaved) {
    if ((current?.claimId ?? null) !== input.expectedClaimId) throw new Error("Diese Angabe wurde inzwischen geändert. Bitte den Editor neu öffnen und erneut prüfen.");
    const submitted = await actor.rpc("world_product_admin_submit_claim_v1",{
      p_spot_id:input.spotId,p_attribute_key:field.attributeKey,p_knowledge_state:input.knowledgeState,p_value:validated.value,
      p_observed_at:new Date().toISOString(),p_valid_from:null,p_valid_until:input.validUntil ?? null,p_visibility:"PUBLIC",
      p_supersedes_claim_id:current?.claimId ?? null,p_idempotency_key:input.idempotencyKey,
    });
    if (submitted.error) throw new Error("Die eigene Angabe konnte nicht gespeichert werden. Bitte erneut versuchen.");
  }
  const rebuilt = await service.rpc("world_product_rebuild_spot_v1",{p_actor_user_id:actorId,p_spot_id:input.spotId,p_as_of:new Date().toISOString(),p_idempotency_key:`${input.idempotencyKey}:rebuild`}).then(result=>result,()=>({data:null,error:{message:"unavailable"}}));
  if (rebuilt.error) throw new Error("Die Angabe ist gespeichert; die Profilansicht konnte noch nicht aktualisiert werden. Bitte erneut versuchen.");
  const after = await readWorldResearchDetail(actor,input.spotId).catch(()=>{throw new Error("Die Angabe ist gespeichert; das aktuelle Profil konnte noch nicht zurückgelesen werden. Bitte erneut versuchen.");});
  const persisted = after.answers?.[field.attributeKey];
  if (!rebuilt.data?.manifestHash || after.manifest?.worldSnapshot?.spotId !== input.spotId || rebuilt.data.worldSnapshot?.spotId !== input.spotId || after.manifest?.manifestHash !== rebuilt.data.manifestHash || !sameValue(after.manifest?.worldSnapshot,rebuilt.data.worldSnapshot)
    || persisted?.knowledgeState !== input.knowledgeState || !sameValue(persisted?.value,validated.value)) throw new Error("Die Angabe ist gespeichert; das Zurücklesen konnte noch nicht bestätigt werden. Bitte den Editor neu öffnen.");
  return { answer:persisted, answers:Object.fromEntries(Object.entries(after.answers ?? {}).filter(([,answer]) => answer.visibility === "PUBLIC")) };
}
