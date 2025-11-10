export function safeJson(raw: string) {
  if (!raw) throw new Error("Leere KI-Antwort.");

  // 1) Codeblöcke entfernen
  raw = raw
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .replace(/^\s+|\s+$/g, "");

  // 2) Wenn GPT bereits komplette JSON-Objektstruktur liefert
  try {
    return JSON.parse(raw);
  } catch (_) {}

  // 3) Versuchen, den JSON-Bereich herauszuschneiden
  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  const firstBracket = raw.indexOf("[");
  const lastBracket = raw.lastIndexOf("]");

  // 3A) Versuch 1: Array extrahieren
  if (firstBracket !== -1 && lastBracket !== -1) {
    const slice = raw.slice(firstBracket, lastBracket + 1);
    try {
      return JSON.parse(slice);
    } catch (_) {}
  }

  // 3B) Versuch 2: Objekt extrahieren
  if (firstBrace !== -1 && lastBrace !== -1) {
    const slice = raw.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(slice);
    } catch (_) {}
  }

  // 4) HARDCODED FIX:
  // Falls GPT mehrere Objekte OHNE Array zurückgibt:
  // Wir parsen alle {...} Blöcke und erstellen ein Array.
  const objectMatches = raw.match(/\{[\s\S]*?\}/g);
  if (objectMatches && objectMatches.length > 0) {
    const arr = [];
    for (const objStr of objectMatches) {
      try {
        arr.push(JSON.parse(objStr));
      } catch (e) {
        // skip invalid objects
      }
    }
    if (arr.length > 0) return arr;
  }

  console.error("JSON String war:", raw);
  throw new Error("KI lieferte kein gültiges JSON.");
}
