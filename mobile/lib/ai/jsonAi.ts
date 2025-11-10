import OpenAI from "openai";
import { safeJson } from "./safeJson";

const openai = new OpenAI({
  apiKey: process.env.EXPO_PUBLIC_OPENAI_KEY!,
});

/**
 * Macht GPT absolut JSON-stabil durch:
 * 1) Direct attempt
 * 2) JSON repair
 * 3) Full retry fallback
 */
export async function runJsonModel({
  prompt,
  model = "gpt-4.1",
  temperature = 0.7,
}: {
  prompt: string;
  model?: string;
  temperature?: number;
}) {
  // 1) Normaler Versuch
  const first = await openai.responses.create({
    model,
    input: prompt,
    temperature,
  });

  let raw = first.output_text?.trim() || "";

  // Direkt versuchen zu parsen:
  try {
    return safeJson(raw);
  } catch (e) {
    console.warn("JSON Parsing failed → trying repair…");
  }

  // 2) Self-Repair Prompt:
  const repairPrompt = `
Deine vorherige Antwort war KEIN gültiges JSON.

Antworte JETZT mit einem *vollständig reparierten* JSON.
KEIN Text außerhalb des JSON. KEIN Markdown. KEINE Codeblöcke.

Kaputtes JSON:
${raw}
`;

  const repair = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: repairPrompt,
    temperature: 0,
  });

  raw = repair.output_text?.trim() || "";

  try {
    return safeJson(raw);
  } catch (e) {
    console.warn("Repair failed → Trying full retry...");
  }

  // 3) Vollständiger Retry:
  const retry = await openai.responses.create({
    model,
    input: prompt,
    temperature,
  });

  raw = retry.output_text?.trim() || "";

  try {
    return safeJson(raw);
  } catch (e) {
    console.error("Retry failed → giving up.");
    throw new Error("Konnte gültiges JSON nicht generieren.");
  }
}
