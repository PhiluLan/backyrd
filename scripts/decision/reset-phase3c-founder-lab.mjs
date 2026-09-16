import { createFounderLabStateStore } from "./phase3c-founder-lab-state.mjs";

const result = createFounderLabStateStore().reset();
process.stdout.write(`${JSON.stringify({ ...result, scope: "LOCAL_DECISION_LAB_ONLY", productionAuthorized: false })}\n`);
