import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import OpenAI from "https://esm.sh/openai@4.24.1";

const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY")! });

function safeJsonParse(raw: string): any | null {
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch {}
    }
    return null;
  }
}

serve(async (req) => {
  try {
    const body = await req.json();

    const {
      user_moods,
      city,
      spots,
    }: {
      user_moods: string[];
      city: string;
      spots: {
        id: string;
        name: string;
        category_name?: string | null;
        price_level?: number | null;
        evidence_tokens?: string[];
        evidence_clusters?: string[];
      }[];
    } = body;

    if (!user_moods?.length || !city || !Array.isArray(spots) || spots.length === 0) {
      return Response.json({ reasons: [] });
    }

    const systemPrompt = `
Du schreibst Why-This-Erklärungen für BACKYRD.
Kontext: Es gibt KEINEN direkten Mood-Match (0/2). Du darfst das NIE als Match verkaufen.

Ziele:
- Nutzer fühlt sich verstanden, ohne dass wir behaupten "passt".
- Pro Spot eine unterschiedliche, konkrete Begründung.
- Immer konstruktiv: niemals abwertend oder "aber/jedoch/fehlen/keine Hinweise"-Style.

HARTE REGELN:
1) Jede Begründung startet exakt mit: "Kein direkter Mood-Match –"
2) Max 200 Zeichen.
3) Keine Negationen wie: "jedoch", "aber", "fehlen", "keine Hinweise", "nicht".
4) Verwende, wenn möglich, 1–2 der evidence_tokens (Vibes aus Reviews).
5) Wenn category_name vorhanden: nutze sie als Kontext (Restaurant/Café/Museum…).
6) Confidence zwischen 0.2 und 0.6.

Output exakt JSON:
{
  "reasons": [
    { "spot_id": "...", "confidence": 0.2, "reason": "..." }
  ]
}
`;

    const userPrompt = `
Stadt: ${city}
User-Moods: ${user_moods.join(" + ")}

Spots (Fakten aus Reviews, keine Fantasie):
${spots
  .map((s) => {
    const tokens = (s.evidence_tokens ?? []).slice(0, 4).join(", ");
    const clusters = (s.evidence_clusters ?? []).slice(0, 6).join(", ");
    const cat = s.category_name ? s.category_name : "Unbekannt";
    const price = typeof s.price_level === "number" ? `€${s.price_level}` : "€?";
    return `- ${s.name} (id: ${s.id})
  Kategorie: ${cat}, Preis: ${price}
  Vibes (Tokens): [${tokens}]
  Cluster: [${clusters}]`;
  })
  .join("\n")}

Schreibe 1 Why-This pro Spot. Fokus: plausibler Fit zum Gefühl "lecker + nice" o.ä. über Kategorie + Vibes.
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    const parsed = safeJsonParse(raw);
    if (!parsed || !Array.isArray(parsed.reasons)) return Response.json({ reasons: [] });

    const reasons = parsed.reasons
      .filter((r: any) => r && typeof r.spot_id === "string" && typeof r.reason === "string")
      .map((r: any) => {
        const c = Number(r.confidence);
        const confidence = Number.isFinite(c) ? Math.max(0.2, Math.min(0.6, c)) : 0.2;
        let reason = r.reason.trim();
        if (!reason.startsWith("Kein direkter Mood-Match –")) {
          reason = `Kein direkter Mood-Match – ${reason.replace(/^[-–—]\s*/, "")}`;
        }
        if (reason.length > 220) reason = reason.slice(0, 217) + "…";
        return { spot_id: r.spot_id, confidence, reason };
      });

    return Response.json({ reasons });
  } catch (e) {
    console.error("semantic-bridge-decision error", e);
    return Response.json({ reasons: [] }, { status: 200 });
  }
});
