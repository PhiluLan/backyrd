/** Production Decision entrypoint. Re-exports canonical implementations only;
 * fixture/research barrels must not execute in a hosted request isolate. */
export * from "./registry.js";
export * from "./contracts.js";
export * from "./source-policy.js";
export * from "./port.js";
export * from "./slice3b.js";
export * from "./experience-profile.js";
export * from "./experience-language.js";
export * from "./spot-catalog.js";
export * from "./authoring-taxonomy.js";
