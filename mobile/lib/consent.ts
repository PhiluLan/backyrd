// mobile/lib/consent.ts

import Constants from "expo-constants";

import { supabase } from "./supabase";

export type ConsentPurposeKey =
  | "personalized_recommendations"
  | "optional_product_analytics"
  | "precise_location"
  | "push_notifications"
  | "marketing_messages"
  | "photo_ai_processing"
  | "model_improvement";

export type ConsentStateRow = {
  purpose_key: ConsentPurposeKey;
  title_de: string;
  description_de: string;
  category: string;
  legal_basis: string;
  requires_consent: boolean;
  is_required: boolean;
  current_status: "granted" | "withdrawn" | "not_set" | "not_required";
  granted_at: string | null;
  withdrawn_at: string | null;
  document_id: string | null;
  document_version: string | null;
  document_title: string | null;
};

type CachedConsent = {
  value: boolean;
  expiresAt: number;
};

const CACHE_TTL_MS = 30_000;
const cache = new Map<string, CachedConsent>();

function appVersion() {
  return Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? "unknown";
}

export function clearConsentCache(purposeKey?: ConsentPurposeKey) {
  if (purposeKey) {
    cache.delete(purposeKey);
    return;
  }
  cache.clear();
}

export async function hasActiveConsent(
  purposeKey: ConsentPurposeKey,
  options?: { forceRefresh?: boolean },
): Promise<boolean> {
  const cached = cache.get(purposeKey);
  if (!options?.forceRefresh && cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const { data, error } = await supabase.rpc("has_active_consent_v1", {
    p_purpose_key: purposeKey,
  });

  if (error) {
    console.warn(`[consent] failed to check ${purposeKey}`, error);
    return false;
  }

  const value = data === true;
  cache.set(purposeKey, {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
  return value;
}

export async function getMyConsentState(): Promise<ConsentStateRow[]> {
  const { data, error } = await supabase.rpc("get_my_consent_state_v1", {
    p_locale: "de-CH",
  });

  if (error) throw error;
  return (Array.isArray(data) ? data : []) as ConsentStateRow[];
}

export async function setMyConsent(
  purposeKey: ConsentPurposeKey,
  granted: boolean,
  documentId: string | null = null,
) {
  const { data, error } = await supabase.rpc("set_my_consent_v1", {
    p_purpose_key: purposeKey,
    p_granted: granted,
    p_document_id: documentId,
    p_source: "mobile",
    p_app_version: appVersion(),
    p_locale: "de-CH",
  });

  if (error) throw error;
  clearConsentCache(purposeKey);
  return data;
}

export async function getMyLegalGateStatus() {
  const { data, error } = await supabase.rpc("get_my_legal_gate_status_v1", {
    p_locale: "de-CH",
  });

  if (error) throw error;
  return Array.isArray(data) ? data[0] ?? null : data;
}

export async function getMyPendingLegalDocuments() {
  const { data, error } = await supabase.rpc(
    "get_my_pending_legal_documents_v1",
    { p_locale: "de-CH" },
  );

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function acceptLegalDocument(documentId: string) {
  const { data, error } = await supabase.rpc("accept_legal_document_v1", {
    p_document_id: documentId,
    p_source: "mobile",
    p_app_version: appVersion(),
    p_locale: "de-CH",
  });

  if (error) throw error;
  return data === true;
}


export type ConsentHistoryRow = {
  event_id: string;
  purpose_key: string | null;
  purpose_title: string | null;
  document_id: string | null;
  document_title: string | null;
  document_version: string | null;
  event_type: string;
  source: string;
  app_version: string | null;
  locale: string | null;
  occurred_at: string;
};

export type LegalDocumentOverviewRow = {
  document_id: string;
  document_type: string;
  version: string;
  locale: string;
  title: string;
  summary: string | null;
  content_markdown: string;
  content_hash: string;
  requires_acceptance: boolean;
  accepted: boolean;
  accepted_at: string | null;
  effective_at: string;
};

export async function getMyConsentHistory(
  limit = 100,
): Promise<ConsentHistoryRow[]> {
  const { data, error } = await supabase.rpc("get_my_consent_history_v1", {
    p_limit: limit,
  });

  if (error) throw error;
  return (Array.isArray(data) ? data : []) as ConsentHistoryRow[];
}

export async function getMyLegalDocumentsOverview(): Promise<
  LegalDocumentOverviewRow[]
> {
  const { data, error } = await supabase.rpc(
    "get_my_legal_documents_overview_v1",
    { p_locale: "de-CH" },
  );

  if (error) throw error;
  return (Array.isArray(data) ? data : []) as LegalDocumentOverviewRow[];
}

supabase.auth.onAuthStateChange(() => {
  clearConsentCache();
});
