import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.24.1";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const openaiKey = Deno.env.get("OPENAI_API_KEY")!;

const supabase = createClient(supabaseUrl, serviceKey);
const openai = new OpenAI({ apiKey: openaiKey });

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

serve(async (req) => {
  try {
    const { spot_id, job_id } = await req.json();
    if (!spot_id) return Response.json({ ok: false, error: "missing spot_id" }, { status: 400 });

    // lock job (optional)
    if (job_id) {
      await supabase
        .from("spot_enrichment_jobs")
        .update({ status: "processing", locked_at: new Date().toISOString(), tries: supabase.rpc ? undefined : undefined })
        .eq("id", job_id);
    }

    const { data: spot, error: sErr } = await supabase
      .from("spots")
      .select("id,name,website,address,city,country,category_id,price_level,status")
      .eq("id", spot_id)
      .maybeSingle();

    if (sErr) throw sErr;
    if (!spot || spot.status !== "approved") {
      return Response.json({ ok: false, error: "spot not approved" }, { status: 200 });
    }

    let categoryName: string | null = null;
    if (spot.category_id) {
      const { data: cat } = await supabase.from("categories").select("name").eq("id", spot.category_id).maybeSingle();
      categoryName = cat?.name ?? null;
    }

    const website: string | null = spot.website ? String(spot.website) : null;

    let pageText = "";
    let usedUrl: string | null = null;

    if (website && /^https?:\/\//i.test(website)) {
      usedUrl = website;
      const resp = await fetch(website, { headers: { "User-Agent": "backyrd-bot/1.0" } });
      if (resp.ok) {
        const html = await resp.text();
        pageText = stripHtml(html).slice(0, 12000); // keep it bounded
      }
    }

    const context = {
      name: spot.name,
      city: spot.city,
      address: spot.address,
      country: spot.country,
      category: categoryName,
      price_level: spot.price_level,
      website: usedUrl,
      website_text: pageText,
    };

    const system = `
Du erstellst eine kurze, faktenbasierte Beschreibung für einen Ort in einer Discovery-App.
Wichtig:
- Keine erfundenen Auszeichnungen, keine Sterne, keine Preise, wenn sie nicht im Text stehen.
- Wenn Website-Text fehlt: nutze nur Name/Adresse/Kategorie, schreibe das neutral.
- Ton: klar, nicht werblich, 2–3 Sätze.
Output als JSON:
{
  "description": "string",
  "keywords": ["..."],
  "quality_score": 0..1
}
`;

    const user = JSON.stringify(context);

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let parsed: any = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // last resort extract JSON
      const a = raw.indexOf("{");
      const b = raw.lastIndexOf("}");
      parsed = a >= 0 && b > a ? JSON.parse(raw.slice(a, b + 1)) : null;
    }

    const description = typeof parsed?.description === "string" ? parsed.description.trim() : "";
    const keywords = Array.isArray(parsed?.keywords) ? parsed.keywords.map(String).slice(0, 12) : [];
    const qualityScore = Number.isFinite(Number(parsed?.quality_score)) ? Math.max(0, Math.min(1, Number(parsed.quality_score))) : 0.3;

    // upsert spot_descriptions
    await supabase.from("spot_descriptions").upsert({
      spot_id: spot_id,
      enriched_description: description || null,
      enriched_keywords: keywords.length ? keywords : null,
      enriched_source: "crawl",
      enriched_url: usedUrl,
      enriched_updated_at: new Date().toISOString(),
      quality_score: qualityScore,
    });

    if (job_id) {
      await supabase.from("spot_enrichment_jobs").update({ status: "done" }).eq("id", job_id);
    }

    return Response.json({ ok: true, spot_id, used_url: usedUrl, quality_score: qualityScore });
  } catch (e: any) {
    console.error("enrich-spot-description error", e);
    try {
      const body = await req.json().catch(() => ({}));
      if (body?.job_id) {
        await supabase
          .from("spot_enrichment_jobs")
          .update({ status: "failed", last_error: String(e?.message ?? e) })
          .eq("id", body.job_id);
      }
    } catch {}
    return Response.json({ ok: false }, { status: 200 });
  }
});
