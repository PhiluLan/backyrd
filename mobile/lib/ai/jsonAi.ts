// mobile/lib/ai/jsonAi.ts
import OpenAI from "openai";
import { safeJson } from "./safeJson";

const openai = new OpenAI({
  apiKey: process.env.EXPO_PUBLIC_OPENAI_KEY!,
});

type RunJsonModelArgs = {
  prompt: string;
  model?: string;
  temperature?: number;
  /**
   * Optional: JSON Schema für strukturierte Antworten.
   * Siehe: https://platform.openai.com/docs/guides/structured-outputs
   */
  jsonSchema?: any;
  /**
   * Name des Schemas (wird im json_schema-Block verwendet).
   * Default: "response"
   */
  schemaName?: string;
  /**
   * Ob das Schema strikt erzwungen werden soll (default: true).
   */
  strict?: boolean;
};

/**
 * Hybrid JSON Runner:
 *
 * 1) Wenn jsonSchema übergeben wird → nutzt JSON-Schema-Structured-Output
 * 2) Nimmt immer `output_text` der Responses API
 * 3) Versucht robustes Parsing mit safeJson()
 * 4) Wenn Parsing scheitert:
 *    - Reparaturversuch mit gpt-4.1-mini
 *    - Vollständiger Retry mit ursprünglichem Modell
 */
export async function runJsonModel({
  prompt,
  model = "gpt-4.1",
  temperature = 0.7,
  jsonSchema,
  schemaName = "response",
  strict = true,
}: RunJsonModelArgs) {
  // Hilfsfunktion: eigentlicher Call an die Responses API
  async function callOnce({
    useSchema,
  }: {
    useSchema: boolean;
  }): Promise<string> {
    const base: any = {
      model,
      input: prompt,
      temperature,
    };

    if (useSchema && jsonSchema) {
      base.response_format = {
        type: "json_schema",
        json_schema: {
          name: schemaName,
          schema: jsonSchema,
          strict,
        },
      };
    }

    const res = await openai.responses.create(base);
    const raw = (res as any).output_text?.trim?.() ?? "";

    if (!raw) {
      throw new Error("Leere KI-Antwort (output_text war leer).");
    }
    return raw;
  }

  // 1) Erster Versuch (mit Schema, falls vorhanden)
  let raw: string;
  try {
    raw = await callOnce({ useSchema: !!jsonSchema });
    try {
      return safeJson(raw);
    } catch (e) {
      console.warn("JSON Parsing failed on first try → attempting repair…");
    }
  } catch (e) {
    console.warn("Initial model call failed:", e);
    // Wir gehen trotzdem in den Reparatur-Flow; raw ist dann evtl. undefined
    raw = "";
  }

  // 2) Repair-Prompt: wir geben das kaputte JSON rein, Modell soll nur repariertes JSON zurückgeben
  try {
    const repairPrompt = `
Deine vorherige Antwort war KEIN gültiges JSON.

Antworte JETZT mit einem *vollständig reparierten* JSON.
KEIN Text außerhalb des JSON. KEIN Markdown. KEINE Codeblöcke.

Kaputtes JSON:
${raw}
`.trim();

    const repair = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: repairPrompt,
      temperature: 0,
    });

    const repairRaw = (repair as any).output_text?.trim?.() ?? "";
    if (!repairRaw) {
      throw new Error("Leere Reparatur-Antwort.");
    }

    try {
      return safeJson(repairRaw);
    } catch {
      console.warn("Repair parsing failed → trying full retry…");
    }
  } catch (e) {
    console.warn("Repair call failed:", e);
  }

  // 3) Vollständiger Retry mit Original-Prompt (ohne Schema, um Fehlerquelle zu eliminieren)
  try {
    const retry = await openai.responses.create({
      model,
      input: prompt,
      temperature,
    });
    const retryRaw = (retry as any).output_text?.trim?.() ?? "";

    if (!retryRaw) {
      throw new Error("Leere Antwort im Retry.");
    }

    return safeJson(retryRaw);
  } catch (e) {
    console.error("Retry failed → giving up. Last error:", e);
    throw new Error("Konnte gültiges JSON nicht generieren.");
  }
}
