// mobile/lib/ai/safeJson.ts

/**
 * Robustes JSON-Parsing mit:
 * - Entfernen von Markdown-Codeblöcken
 * - Versuch, Array oder Objekt-Bereich herauszuschneiden
 * - Fallback: mehrere { ... }-Blöcke als Array interpretieren
 */
export function safeJson(raw: string) {
  if (!raw) throw new Error("Leere KI-Antwort.");

  // 1) Codeblöcke & offensichtliches Markdown entfernen
  raw = raw
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .replace(/^\s+|\s+$/g, "");

  // 2) Direktversuch: ist der komplette String schon gültiges JSON?
  try {
    return JSON.parse(raw);
  } catch {
    // Ignorieren, wir versuchen es abgestuft weiter
  }

  // 3) Versuchen, den JSON-Bereich herauszuschneiden (Array zuerst)
  const firstBracket = raw.indexOf("[");
  const lastBracket = raw.lastIndexOf("]");
  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");

  // 3A) Array extrahieren
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    const slice = raw.slice(firstBracket, lastBracket + 1);
    try {
      return JSON.parse(slice);
    } catch {
      // weiter unten versuchen
    }
  }

  // 3B) Objekt extrahieren
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const slice = raw.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(slice);
    } catch {
      // weiter unten versuchen
    }
  }

  // 4) HARDCODED FIX:
  // Falls mehrere JSON-Objekte "aneinandergeklatscht" zurückkommen,
  // parsen wir alle {...}-Blöcke und geben sie als Array zurück.
  const objectMatches = raw.match(/\{[\s\S]*?\}/g);
  if (objectMatches && objectMatches.length > 0) {
    const arr: any[] = [];
    for (const objStr of objectMatches) {
      try {
        arr.push(JSON.parse(objStr));
      } catch {
        // invaliden Block überspringen
      }
    }
    if (arr.length > 0) return arr;
  }

  console.error("JSON String war nicht parsbar:", raw);
  throw new Error("KI lieferte kein gültiges JSON.");
}
