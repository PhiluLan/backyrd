/** UI catalogs and validation only. Keep Founder handoffs, fixture/research
 * entrypoints and server HTTP handlers behind the default/server entrypoints. */
export {
  AUTHORING_CATALOG_VERSION, AUTHORING_CATALOG_HASH, AUTHORING_FIELDS,
  AUTHORING_STEPS, getAuthoringFieldsForContext, getPlaceTypeConflict,
  evaluateAuthoringReadiness, validateAuthoringSubmission, formatPriceOptionsSummary,
} from "./authoring.js";
export type {
  AuthoringField, AuthoringRole, AuthoringSectionState, AuthoringReadinessReport,
} from "./authoring.js";
export * from "./authoring-taxonomy.js";
export * from "./registry.js";
export * from "./contracts.js";
export * from "./discovery.js";
export * from "./experience-profile.js";
export * from "./experience-transfer.js";
export * from "./experience-language.js";
export * from "./spot-catalog.js";
