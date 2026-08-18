import { contentHash } from "./canonical-json.mjs";

export const N6A7_VERSIONS = Object.freeze({
  response: "backyrd-n6a7-canonical-provider-response-v1",
  allowlist: "backyrd-n6a7-provider-field-allowlist-v1",
  compatibility: "backyrd-n6a7-checkpoint-compatibility-v1"
});

const RESPONSE_FIELDS = ["id", "object", "model", "status", "created_at", "completed_at", "service_tier"];
const ITEM_FIELDS = ["type", "role", "status"];
const CONTENT_FIELDS = ["type", "text"];
const USAGE_FIELDS = ["input_tokens", "output_tokens", "total_tokens"];

const pick = (value, fields) => Object.fromEntries(fields.filter((field) => value?.[field] !== undefined).map((field) => [field, value[field]]));

function canonicalOutput(raw) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.output)) throw new Error("N6A7_PROVIDER_RESPONSE_MALFORMED");
  const items = raw.output.map((item) => ({
    ...pick(item, ITEM_FIELDS),
    content: Array.isArray(item.content) ? item.content.map((content) => pick(content, CONTENT_FIELDS)) : []
  }));
  const text = items.flatMap((item) => item.content).filter((content) => content.type === "output_text").map((content) => content.text).find((value) => typeof value === "string") ?? null;
  return { items, text };
}

export function canonicalizeProviderResponse(raw) {
  if (!raw || typeof raw !== "object") throw new Error("N6A7_PROVIDER_RESPONSE_MALFORMED");
  const output = canonicalOutput(raw);
  const body = {
    version: N6A7_VERSIONS.response,
    response: pick(raw, RESPONSE_FIELDS),
    output,
    usage: pick(raw.usage, USAGE_FIELDS)
  };
  if (!body.response.id || !body.response.model || !body.response.status) throw new Error("N6A7_PROVIDER_RESPONSE_IDENTITY_MISSING");
  return Object.freeze({ ...body, canonicalHash: contentHash(body) });
}

export function canonicalizeLegacyCheckpoint(checkpoint) {
  if (!checkpoint || typeof checkpoint !== "object" || !checkpoint.rawOutput) throw new Error("N6A7_LEGACY_RESPONSE_MISSING");
  const { rawOutput, ...rest } = checkpoint;
  return {
    ...rest,
    canonicalProviderResponse: canonicalizeProviderResponse(rawOutput),
    checkpointContractVersion: N6A7_VERSIONS.compatibility
  };
}

export const N6A7_ALLOWLIST = Object.freeze({
  response: RESPONSE_FIELDS,
  outputItem: ITEM_FIELDS,
  outputContent: CONTENT_FIELDS,
  usage: USAGE_FIELDS,
  droppedProviderFields: "all fields not listed above, including encrypted_content and opaque provider metadata"
});

