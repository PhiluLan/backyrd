import { contentHash, deepFreeze, withContentHash } from "./canonical.js";
import { PHASE3B_VERSIONS, ResolverOutputSchema, type ResolverOutput } from "./phase3b-contracts.js";
import { assertAcceptedPhase3BProductContextRelease, type AcceptedPhase3BProductContextRelease } from "./phase3b-release.js";

declare const verifiedResolverOutputBrand: unique symbol;
export interface VerifiedResolverOutput extends ResolverOutput { readonly [verifiedResolverOutputBrand]: true }
const verifiedResolverOutputs = new WeakSet<object>();
export interface ProductContextResolverPort { readonly kind: ResolverOutput["resolverKind"]; resolve(input: { readonly ephemeralText: string; readonly market?: string; readonly category?: string; readonly consumption?: string; readonly permission?: "GRANTED"|"DENIED" }, release: AcceptedPhase3BProductContextRelease): VerifiedResolverOutput; }
export interface IntentResolverPort extends ProductContextResolverPort { readonly kind: "INTENT" }
export interface OccasionResolverPort extends ProductContextResolverPort { readonly kind: "OCCASION" }
export interface MoodResolverPort extends ProductContextResolverPort { readonly kind: "MOOD" }
export interface LocationResolverPort extends ProductContextResolverPort { readonly kind: "LOCATION" }
export interface BudgetResolverPort extends ProductContextResolverPort { readonly kind: "BUDGET" }
export interface HardSoftLanguageResolverPort extends ProductContextResolverPort { readonly kind: "HARD_SOFT_LANGUAGE" }

const interpretation = (conceptId: string, role: "PRIMARY"|"SECONDARY"|"OCCASION"|"MOOD"|"LOCATION"|"BUDGET"|"REQUIREMENT") => ({ conceptId, role, knowledgeState: "KNOWN" as const });
function output(kind: ResolverOutput["resolverKind"], input: ProductContextResolverPort["resolve"] extends (i: infer I, ...args: never[]) => unknown ? I : never, state: ResolverOutput["state"], interpretations: readonly ReturnType<typeof interpretation>[], alternatives: readonly ReturnType<typeof interpretation>[] = []): VerifiedResolverOutput {
  const body = { contractVersion: PHASE3B_VERSIONS.resolverOutput, resolverKind: kind, resolverId: `fixture-${kind.toLowerCase()}-resolver`, resolverVersion: `phase3b-fixture-${kind.toLowerCase()}-v1`, registryVersion: PHASE3B_VERSIONS.registry, inputHash: contentHash(input), state, interpretations, alternativeInterpretations: alternatives, clarificationRequired: state === "AMBIGUOUS", confidenceState: state === "RESOLVED" || state === "PARTIALLY_RESOLVED" ? "SUPPORTED_FIXTURE" as const : state === "AMBIGUOUS" ? "AMBIGUOUS" as const : state === "NOT_CONFIGURED" ? "NOT_CONFIGURED" as const : "UNKNOWN" as const, sourceIdentity: "synthetic-fixture-only", rawTextPersisted: false as const, validUntil: "2027-09-12T00:00:00.000Z" };
  const result = deepFreeze(ResolverOutputSchema.parse(withContentHash(body, "proofHash"))) as VerifiedResolverOutput;
  verifiedResolverOutputs.add(result); return result;
}

export function assertVerifiedResolverOutput(value: VerifiedResolverOutput, expectedKind: ResolverOutput["resolverKind"], expectedInputHash: string): void {
  if (!value || typeof value !== "object" || !verifiedResolverOutputs.has(value)) throw new Error("phase3b_verified_resolver_capability_required");
  if (value.resolverKind !== expectedKind || value.inputHash !== expectedInputHash) throw new Error("phase3b_resolver_binding_mismatch");
}

abstract class FixtureResolver implements ProductContextResolverPort {
  abstract readonly kind: ResolverOutput["resolverKind"];
  resolve(input: { readonly ephemeralText: string; readonly market?: string; readonly category?: string; readonly consumption?: string; readonly permission?: "GRANTED"|"DENIED" }, release: AcceptedPhase3BProductContextRelease): VerifiedResolverOutput {
    assertAcceptedPhase3BProductContextRelease(release);
    const text = input.ephemeralText.normalize("NFC").trim().toLocaleLowerCase("de-CH");
    if (this.kind === "LOCATION" && text === "zürich") return output(this.kind, input, "RESOLVED", [interpretation("location.target.zurich", "LOCATION")]);
    if (this.kind === "LOCATION" && input.permission === "DENIED") return output(this.kind, input, "DENIED", []);
    if (this.kind === "INTENT" && text === "ruhig abendessen") return output(this.kind, input, "RESOLVED", [interpretation("context.intent.food.dinner", "PRIMARY"), interpretation("context.intent.food", "SECONDARY")]);
    if (this.kind === "INTENT" && text === "essen und nicht essen") return output(this.kind, input, "AMBIGUOUS", [], [interpretation("context.intent.food", "PRIMARY")]);
    if (this.kind === "OCCASION" && (text === "erstes date" || text.includes("first date"))) return output(this.kind, input, "RESOLVED", [interpretation("context.occasion.first-date", "OCCASION")]);
    if (this.kind === "MOOD" && text === "ruhig und gemütlich") return output(this.kind, input, "RESOLVED", [interpretation("context.mood.quiet", "MOOD"), interpretation("context.mood.cozy", "MOOD")]);
    if (this.kind === "MOOD" && text === "irgendwie besonders aber locker") return output(this.kind, input, "AMBIGUOUS", [], [interpretation("context.mood.cozy", "MOOD"), interpretation("context.mood.quiet", "MOOD")]);
    if (this.kind === "BUDGET" && text === "maximal 20 chf pro person" && input.market === "CH" && input.category === "FOOD_SERVICE" && input.consumption === "DINNER") return output(this.kind, input, "RESOLVED", [interpretation("world.price.low", "BUDGET")]);
    if (this.kind === "HARD_SOFT_LANGUAGE" && text.startsWith("muss ")) return output(this.kind, input, "RESOLVED", [interpretation("requirement.explicit-must", "REQUIREMENT")]);
    return output(this.kind, input, "NOT_CONFIGURED", []);
  }
}
export class SyntheticIntentResolver extends FixtureResolver implements IntentResolverPort { readonly kind = "INTENT" as const; }
export class SyntheticOccasionResolver extends FixtureResolver implements OccasionResolverPort { readonly kind = "OCCASION" as const; }
export class SyntheticMoodResolver extends FixtureResolver implements MoodResolverPort { readonly kind = "MOOD" as const; }
export class SyntheticLocationResolver extends FixtureResolver implements LocationResolverPort { readonly kind = "LOCATION" as const; }
export class SyntheticBudgetResolver extends FixtureResolver implements BudgetResolverPort { readonly kind = "BUDGET" as const; }
export class SyntheticHardSoftResolver extends FixtureResolver implements HardSoftLanguageResolverPort { readonly kind = "HARD_SOFT_LANGUAGE" as const; }
