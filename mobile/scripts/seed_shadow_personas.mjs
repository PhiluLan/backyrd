import fs from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

function pickTimeBucket(i) {
  const buckets = ["morning", "afternoon", "evening", "night"];
  return buckets[i % buckets.length];
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

async function rpc(name, args) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data;
}

async function main() {
  const raw = await fs.readFile("personas.backyrd.json", "utf8");
  const spec = JSON.parse(raw);

  console.log(`Seeding ${spec.personas.length} shadow personas...`);

  for (const p of spec.personas) {
    const shadowUserId = await rpc("create_shadow_user_v1", {
      p_handle: p.handle,
      p_display_name: p.display_name,
      p_city: spec.meta.city
    });

    await rpc("reset_shadow_user_v1", { p_handle: p.handle });

    for (const seed of p.favorite_seeds) {
      await rpc("insert_shadow_event_v1", {
        p_shadow_user_id: shadowUserId,
        p_event_type: "seed_favorite_spot",
        p_spot_id: seed.spot_id,
        p_mood_text: seed.mood ?? null,
        p_time_bucket: null,
        p_occurred_at: new Date().toISOString(),
        p_meta: { source: "persona_seed" }
      });

      if (seed.mood) {
        await rpc("insert_shadow_event_v1", {
          p_shadow_user_id: shadowUserId,
          p_event_type: "exact_mood",
          p_spot_id: seed.spot_id,
          p_mood_text: seed.mood,
          p_time_bucket: "evening",
          p_occurred_at: new Date().toISOString(),
          p_meta: { source: "persona_seed_weak" }
        });
      }
    }

    const plan = p.action_plan;
    const events = [];
    const pushMany = (type, count) => { for (let i = 0; i < count; i++) events.push(type); };

    pushMany("was_here", plan.was_here);
    pushMany("exact_mood", plan.exact_mood);
    pushMany("not_there", plan.not_there);
    pushMany("tapped", plan.tapped);

    events.sort((a, b) => (a > b ? 1 : -1));

    const spotPool = p.favorite_seeds.map(s => s.spot_id);

    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      const spotId = spotPool[i % spotPool.length];
      const tb = p.time_bias?.[i % p.time_bias.length] ?? pickTimeBucket(i);
      const occurredAt = daysAgo(Math.floor((i * plan.days) / Math.max(events.length, 1)));

      let moodText = null;
      if (ev === "exact_mood") {
        moodText = p.top_moods[i % p.top_moods.length];
      }

      await rpc("insert_shadow_event_v1", {
        p_shadow_user_id: shadowUserId,
        p_event_type: ev,
        p_spot_id: spotId,
        p_mood_text: moodText,
        p_time_bucket: tb,
        p_occurred_at: occurredAt,
        p_meta: { source: "persona_action_plan" }
      });
    }

    console.log(`✅ Seeded ${p.handle} (${shadowUserId})`);
  }

  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
