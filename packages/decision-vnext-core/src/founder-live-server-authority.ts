import { createHmac } from "node:crypto";
import { createFounderLivePrivateUuidProvider, FounderLiveUuidPrivateRecordSchema } from "@backyrd/user-intelligence-vnext-core";
import { canonicalJson, contentHash, deepFreeze } from "./canonical.js";
import type { FounderLiveAllowlistPort, FounderLiveAuthPort, FounderLiveRuntimeControl } from "./founder-live-api.js";

export const FOUNDER_LIVE_SERVER_AUTHORITY_VERSION = "backyrd.decision-vnext.founder-live-server-uuid-authority@1.0" as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

interface JwtClaims {
  readonly sub: string;
  readonly sessionId: string;
  readonly expiresAtSeconds: number;
  readonly issuedAtSeconds: number;
}

function parseVerifiedSessionCandidate(token: string, now: Date): JwtClaims | null {
  if (!token || token.length > 16_384 || /\s/.test(token)) return null;
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const raw = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Record<string, unknown>;
    const sub = raw.sub; const sessionId = raw.session_id; const expiresAtSeconds = raw.exp; const issuedAtSeconds = raw.iat;
    if (typeof sub !== "string" || !UUID.test(sub) || typeof sessionId !== "string" || !UUID.test(sessionId)) return null;
    if (typeof expiresAtSeconds !== "number" || !Number.isSafeInteger(expiresAtSeconds) || typeof issuedAtSeconds !== "number" || !Number.isSafeInteger(issuedAtSeconds) || issuedAtSeconds > Math.floor(now.getTime() / 1_000) || expiresAtSeconds <= Math.floor(now.getTime() / 1_000)) return null;
    if (raw.role !== "authenticated" || !(raw.aud === "authenticated" || (Array.isArray(raw.aud) && raw.aud.includes("authenticated")))) return null;
    return { sub: sub.toLowerCase(), sessionId: sessionId.toLowerCase(), expiresAtSeconds, issuedAtSeconds };
  } catch { return null; }
}

function normalizeSupabaseUrl(value: string): string {
  const url = new URL(value);
  const local = url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "::1";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) throw new Error("founder_live_supabase_url_not_server_safe");
  if (url.username || url.password || url.search || url.hash) throw new Error("founder_live_supabase_url_invalid");
  return url.toString().replace(/\/$/, "");
}

/**
 * Server-only Supabase session verifier. Authorization is derived from the
 * verified Auth user and JWT session claims; email and metadata are ignored.
 */
export function createFounderLiveSupabaseAuthPort(input: {
  readonly supabaseUrl: string;
  readonly publishableKey: string;
  readonly fetchImpl?: FetchLike;
  readonly now?: () => Date;
}): FounderLiveAuthPort {
  const baseUrl = normalizeSupabaseUrl(input.supabaseUrl);
  if (!input.publishableKey || input.publishableKey.length > 8_192) throw new Error("founder_live_supabase_publishable_key_missing");
  const fetchImpl = input.fetchImpl ?? fetch; const now = input.now ?? (() => new Date());
  return Object.freeze({
    contractVersion: "backyrd.decision-vnext.founder-live-auth-port@2.0" as const,
    async authenticate(bearerToken: string) {
      const claims = parseVerifiedSessionCandidate(bearerToken, now());
      if (!claims) return null;
      let response: Response;
      try {
        response = await fetchImpl(`${baseUrl}/auth/v1/user`, { method: "GET", redirect: "error", headers: { apikey: input.publishableKey, authorization: `Bearer ${bearerToken}`, accept: "application/json" } });
      } catch { return null; }
      if (!response.ok) return null;
      let user: Record<string, unknown>;
      try { user = await response.json() as Record<string, unknown>; } catch { return null; }
      if (typeof user.id !== "string" || user.id.toLowerCase() !== claims.sub || user.role !== "authenticated" || user.is_anonymous === true) return null;
      const subjectBindingHash = contentHash({ namespace: "founder-live-subject@1.0", verifiedUserId: claims.sub });
      const sessionBindingHash = contentHash({ namespace: "founder-live-session@1.0", subjectBindingHash, sessionId: claims.sessionId });
      return deepFreeze({
        userId: claims.sub,
        subjectBindingHash,
        authenticationContextHash: contentHash({ namespace: "founder-live-auth-context@1.0", subjectBindingHash, sessionId: claims.sessionId, expiresAtSeconds: claims.expiresAtSeconds }),
        sessionBindingHash,
        issuedAt: new Date(claims.issuedAtSeconds * 1_000).toISOString(),
        expiresAt: new Date(claims.expiresAtSeconds * 1_000).toISOString(),
        expertAccess: false,
      });
    },
  });
}

/** Canonical User-Intelligence private provider; no UUID enumeration or client input. */
export function createFounderLiveCanonicalUuidAllowlistPort(input: {
  readonly loadPrivateStoreSecret: () => string;
  readonly bindingSecret: string;
  readonly now?: () => Date;
}): FounderLiveAllowlistPort {
  if (Buffer.byteLength(input.bindingSecret, "utf8") < 32) throw new Error("founder_live_allowlist_binding_secret_too_short");
  const provider = createFounderLivePrivateUuidProvider(input.loadPrivateStoreSecret);
  const now = input.now ?? (() => new Date());
  return Object.freeze({
    contractVersion: "backyrd.decision-vnext.founder-live-allowlist-port@2.0" as const,
    async authorize(value: Parameters<FounderLiveAllowlistPort["authorize"]>[0]) {
      let authorized = false;
      try {
        const record = FounderLiveUuidPrivateRecordSchema.parse(provider.findByAuthUserId(value.verifiedUserId));
        const verifiedAt = now().getTime();
        authorized = value.purpose === "FOUNDER_DECISION_EVALUATION"
          && (value.environment === "LOCAL_TEST" || value.environment === "PROD_LIKE_TEST")
          && record.status === "ACTIVE" && record.consentState === "GRANTED" && record.lifecycle === "ACTIVE"
          && record.subjectBindingHash === value.subjectBindingHash
          && record.acceptedSessionBindingHash === value.sessionBindingHash
          && verifiedAt >= Date.parse(record.validFrom) && verifiedAt <= Date.parse(record.validUntil)
          && Date.parse(value.issuedAt) <= verifiedAt && verifiedAt < Date.parse(value.expiresAt);
      } catch { authorized = false; }
      const decisionHash = createHmac("sha256", input.bindingSecret).update(canonicalJson({ authorityVersion: FOUNDER_LIVE_SERVER_AUTHORITY_VERSION, authenticationContextHash: value.authenticationContextHash, environment: value.environment, purpose: value.purpose, subjectBindingHash: value.subjectBindingHash, sessionBindingHash: value.sessionBindingHash, providerEnvelopeHash: provider.providerEnvelopeHash(), authorized })).digest("hex");
      return deepFreeze({ authorized, authorityVersion: FOUNDER_LIVE_SERVER_AUTHORITY_VERSION, decisionHash });
    },
  });
}

/**
 * Builds the private allowlist authority from server-only configuration. The
 * two UUIDs and the binding secret never enter a serializable Decision value.
 */
export function createFounderLivePrivateUuidAllowlistPort(input: {
  readonly memberUuids: readonly string[];
  readonly bindingSecret: string;
}): FounderLiveAllowlistPort {
  const members = input.memberUuids.map((value) => value.toLowerCase());
  if (members.length !== 2 || new Set(members).size !== 2 || members.some((value) => !UUID.test(value))) throw new Error("founder_live_allowlist_requires_exactly_two_distinct_uuids");
  if (Buffer.byteLength(input.bindingSecret, "utf8") < 32) throw new Error("founder_live_allowlist_binding_secret_too_short");
  const accepted = new Set(members);
  return Object.freeze({
    contractVersion: "backyrd.decision-vnext.founder-live-allowlist-port@2.0" as const,
    async authorize(value: Parameters<FounderLiveAllowlistPort["authorize"]>[0]) {
      const verifiedUserId = value.verifiedUserId.toLowerCase();
      const expectedSubject = contentHash({ namespace: "founder-live-subject@1.0", verifiedUserId });
      const authorized = UUID.test(verifiedUserId) && accepted.has(verifiedUserId) && value.subjectBindingHash === expectedSubject;
      const decisionHash = createHmac("sha256", input.bindingSecret).update(canonicalJson({
        authorityVersion: FOUNDER_LIVE_SERVER_AUTHORITY_VERSION,
        authenticationContextHash: value.authenticationContextHash,
        environment: value.environment,
        purpose: value.purpose,
        subjectBindingHash: value.subjectBindingHash,
        authorized,
      })).digest("hex");
      return deepFreeze({ authorized, authorityVersion: FOUNDER_LIVE_SERVER_AUTHORITY_VERSION, decisionHash });
    },
  });
}

export function createFounderLivePrivateUuidAllowlistFromEnvironment(environment: Readonly<Record<string, string | undefined>>): FounderLiveAllowlistPort {
  const raw = environment.BACKYRD_FOUNDER_LIVE_UUID_ALLOWLIST;
  const bindingSecret = environment.BACKYRD_FOUNDER_LIVE_AUTHORITY_BINDING_SECRET;
  if (!raw || !bindingSecret) throw new Error("founder_live_private_authority_not_configured");
  return createFounderLivePrivateUuidAllowlistPort({ memberUuids: raw.split(",").map((value) => value.trim()), bindingSecret });
}

/** Default state is OFF with the kill switch engaged. Only test environments exist. */
export function createFounderLiveServerRuntimeControl(environment: Readonly<Record<string, string | undefined>>): FounderLiveRuntimeControl {
  const requested = environment.BACKYRD_FOUNDER_LIVE_TEST_ENVIRONMENT;
  const testEnvironment = requested === "LOCAL_TEST" || requested === "PROD_LIKE_TEST" ? requested : "LOCAL_TEST";
  const enabled = environment.BACKYRD_FOUNDER_LIVE_TEST_EVALUATION_ENABLED === "true";
  return Object.freeze({
    enabled,
    environment: testEnvironment,
    purpose: "FOUNDER_DECISION_EVALUATION" as const,
    requestTimeoutMilliseconds: 5_000,
    maxRequestBytes: 16_384,
    // Read on every stage boundary so Emergency-OFF also aborts in-flight work.
    isKillSwitchEngaged: () => environment.BACKYRD_FOUNDER_LIVE_TEST_KILL_SWITCH !== "DISENGAGED_FOR_TEST_EVALUATION",
  });
}
