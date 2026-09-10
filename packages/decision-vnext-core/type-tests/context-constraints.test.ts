import type { BoundHardConstraint, BoundSoftPreference, ContextKernelClientInput } from "../src/context-kernel-contracts.js";

declare const hard: BoundHardConstraint;
declare const soft: BoundSoftPreference;
declare function eligibilityConstraint(value: BoundHardConstraint): void;

eligibilityConstraint(hard);
// @ts-expect-error soft preferences cannot enter the hard-constraint evaluator
eligibilityConstraint(soft);

const client: ContextKernelClientInput = {} as ContextKernelClientInput;
// @ts-expect-error server authority has no client contract channel
client.serverTime;
// @ts-expect-error client cannot choose an unknown policy
client.unknownPolicy;
