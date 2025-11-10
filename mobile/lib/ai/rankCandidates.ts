import { runJsonModel } from "./jsonAi";

export async function rankCandidates(intention: any, slim: any[], memory: any) {
  const prompt = `
Bewerte Spots nach Fit für die INTENTION und MEMORY.

INTENTION:
${JSON.stringify(intention, null, 2)}

MEMORY:
${JSON.stringify(memory || {}, null, 2)}

CANDIDATES:
${JSON.stringify(slim, null, 2)}

FORMAT:
[
  { "id": "uuid", "score": number, "reasoning": "string", "fitFactors": ["..."] }
]
`;

  return runJsonModel({ prompt });
}
