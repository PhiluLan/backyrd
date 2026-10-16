/** Production Decision entrypoint. Keep synthetic calibration and historical
 * evaluation initialization out of the request isolate. No alternate logic. */
export * from "./contracts.js";
export * from "./product-decision-learning.js";
