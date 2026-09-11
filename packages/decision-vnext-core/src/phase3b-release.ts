import { verify } from "node:crypto";
import { canonicalJson, deepFreeze } from "./canonical.js";
import { ProductContextReleaseTrustAnchorSchema, type ProductContextReleaseTrustAnchor } from "./phase3b-contracts.js";
import {
  PHASE3B_COMBINED_RELEASE, PHASE3B_COMBINED_TRUST_ANCHOR, PHASE3B_CONTEXT_POLICY,
  PHASE3B_CONTEXT_REGISTRY, PHASE3B_FOUNDER_AUTHORITY, PHASE3B_FOUNDER_DECISION_RECORD,
  PHASE3B_FOUNDER_TRUST_ANCHOR, PHASE3B_ORACLE_AUTHORITY_CATALOG, PHASE3B_ORACLE_TRUST_CATALOG,
  PHASE3B_POLICY_RELEASE, PHASE3B_PRODUCT_ORACLES, PHASE3B_PRODUCT_SCENARIO_IDS,
  PHASE3B_REGISTRY_RELEASE, validatePhase3BProductArtifacts,
} from "./phase3b-artifacts.js";

declare const acceptedPhase3BReleaseBrand: unique symbol;
export interface AcceptedPhase3BProductContextRelease {
  readonly decisionRecord: typeof PHASE3B_FOUNDER_DECISION_RECORD;
  readonly registry: typeof PHASE3B_CONTEXT_REGISTRY;
  readonly policy: typeof PHASE3B_CONTEXT_POLICY;
  readonly oracles: typeof PHASE3B_PRODUCT_ORACLES;
  readonly release: typeof PHASE3B_COMBINED_RELEASE;
  readonly [acceptedPhase3BReleaseBrand]: true;
}

const acceptedCapabilities = new WeakSet<object>();
const PHASE3B_RELEASE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEASMEFU3IolJh2LQboXNLfPuGCb1tWclKxB1t6ee5fHWE=
-----END PUBLIC KEY-----`;

/** Read-only attestation data. Validation never mints an accepted capability. */
export function readPhase3BReleaseAttestation(): { readonly trustAnchor: ProductContextReleaseTrustAnchor; readonly publicKey: string } {
  return deepFreeze({ trustAnchor: PHASE3B_COMBINED_TRUST_ANCHOR, publicKey: PHASE3B_RELEASE_PUBLIC_KEY });
}

export function verifyPhase3BReleaseAttestation(value: unknown): boolean {
  try {
    const anchor = ProductContextReleaseTrustAnchorSchema.parse(value);
    if (anchor.verificationKeyId !== "phase3b-product-context-synthetic-fixture-key-1" || anchor.authorityScope !== "SYNTHETIC_FIXTURE_ONLY" || anchor.productionCapable || anchor.productApproved || anchor.acceptedReleaseId !== "backyrd.decision-vnext.context-release@3b-1") return false;
    return verify(null, Buffer.from(anchor.acceptedReleaseHash, "utf8"), PHASE3B_RELEASE_PUBLIC_KEY, Buffer.from(anchor.releaseHashSignature, "base64"));
  } catch { return false; }
}

function mintPinnedRelease(): AcceptedPhase3BProductContextRelease {
  validatePhase3BProductArtifacts();
  if (!verifyPhase3BReleaseAttestation(PHASE3B_COMBINED_TRUST_ANCHOR) || PHASE3B_COMBINED_TRUST_ANCHOR.acceptedReleaseHash !== PHASE3B_COMBINED_RELEASE.releaseHash) throw new Error("phase3b_release_not_accepted");
  if (PHASE3B_FOUNDER_TRUST_ANCHOR.acceptedAuthorityHash !== PHASE3B_FOUNDER_AUTHORITY.authorityHash || PHASE3B_REGISTRY_RELEASE.founderAuthorityHash !== PHASE3B_FOUNDER_AUTHORITY.authorityHash || PHASE3B_POLICY_RELEASE.founderAuthorityHash !== PHASE3B_FOUNDER_AUTHORITY.authorityHash) throw new Error("phase3b_founder_authority_binding_mismatch");
  const capability = deepFreeze({ decisionRecord: PHASE3B_FOUNDER_DECISION_RECORD, registry: PHASE3B_CONTEXT_REGISTRY, policy: PHASE3B_CONTEXT_POLICY, oracles: PHASE3B_PRODUCT_ORACLES, release: PHASE3B_COMBINED_RELEASE }) as unknown as AcceptedPhase3BProductContextRelease;
  acceptedCapabilities.add(capability);
  return capability;
}

/** The sole capability mint. It accepts no caller-selected artifact or hash. */
export function loadAcceptedPhase3BProductContextRelease(): AcceptedPhase3BProductContextRelease { return mintPinnedRelease(); }

export function assertAcceptedPhase3BProductContextRelease(value: AcceptedPhase3BProductContextRelease): void {
  if (!value || typeof value !== "object" || !acceptedCapabilities.has(value)) throw new Error("phase3b_accepted_release_capability_required");
  if (canonicalJson(value.release.scenarioAllowlist) !== canonicalJson(PHASE3B_PRODUCT_SCENARIO_IDS)) throw new Error("phase3b_scenario_release_mismatch");
}

export function selectAcceptedPhase3BScenario(value: AcceptedPhase3BProductContextRelease, scenarioId: string) {
  assertAcceptedPhase3BProductContextRelease(value);
  const index = PHASE3B_PRODUCT_SCENARIO_IDS.indexOf(scenarioId as typeof PHASE3B_PRODUCT_SCENARIO_IDS[number]);
  if (index < 0) throw new Error("phase3b_scenario_not_accepted");
  const oracle = value.oracles[index]; const authority = PHASE3B_ORACLE_AUTHORITY_CATALOG.entries[index]; const anchor = PHASE3B_ORACLE_TRUST_CATALOG.entries[index];
  if (!oracle || !authority || !anchor || oracle.oracleHash !== authority.oracleHash || authority.authorityHash !== anchor.acceptedAuthorityHash) throw new Error("phase3b_oracle_authority_binding_mismatch");
  return deepFreeze({ oracle, authority, anchor });
}
