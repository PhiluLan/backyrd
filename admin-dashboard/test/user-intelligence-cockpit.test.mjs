import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sidebar = await readFile(new URL("../components/intelligence/Sidebar.tsx", import.meta.url), "utf8");
const indexPage = await readFile(new URL("../app/user-intelligence/page.tsx", import.meta.url), "utf8");
const detailPage = await readFile(new URL("../app/user-intelligence/[id]/page.tsx", import.meta.url), "utf8");
const migration = await readFile(new URL("../../supabase/migrations/20260921182331_create_user_intelligence_admin_cockpit_v1.sql", import.meta.url), "utf8");

test("User Intelligence is a first-class, continuously refreshed Admin destination", () => {
  assert.match(sidebar, /href:\s*"\/user-intelligence"/);
  assert.match(indexPage, /backyrd_admin_user_intelligence_cockpit_list_v1/);
  assert.match(detailPage, /backyrd_admin_user_intelligence_cockpit_detail_v1/);
  assert.match(indexPage, /setInterval/);
  assert.match(detailPage, /setInterval/);
  assert.doesNotMatch(indexPage + detailPage, /service_role|SUPABASE_SERVICE_ROLE|rawDecisionText/i);
});

test("cockpit RPCs are admin-only and project canonical evidence without guessed attribution", () => {
  assert.match(migration, /auth\.uid\(\) is null or not coalesce\(public\.admin_is_admin_v1\(\),false\)/);
  assert.match(migration, /backyrd_user_intelligence_snapshots_v2/);
  assert.match(migration, /backyrd_user_intelligence_snapshot_nodes_v1/);
  assert.match(migration, /backyrd_memory_events_v1/);
  assert.match(migration, /product_learning_records_v1/);
  assert.match(migration, /backyrd_user_intelligence_change_ledger_v1/);
  assert.match(migration, /triggering_chain_ids &&/);
  assert.match(migration, /rawDecisionTextIncluded',false/);
  assert.match(migration, /serviceCredentialsIncluded',false/);
  assert.doesNotMatch(migration, /mood_a_text|mood_b_text/);
  assert.match(migration, /revoke all on function[\s\S]+from public,anon,authenticated,service_role/);
  assert.match(migration, /grant execute on function[\s\S]+to authenticated,service_role/);
});

test("the interface states uncertainty and direct attribution honestly", () => {
  assert.match(detailPage, /UNKNOWN bleibt UNKNOWN/);
  assert.match(detailPage, /Keine direkt zuordenbare Profiländerung/);
  assert.match(detailPage, /Keine direkte Decision-Zuordnung im Ledger/);
  assert.match(detailPage, /Keine Tokens, Service-Credentials oder rohen Decision-Texte/);
  assert.match(detailPage, /Noch in Prüfung/);
  assert.match(detailPage, /Für Ranking freigegeben/);
  assert.match(detailPage, /Bewusst sichtbar/);
  assert.match(detailPage, /Lebendes Nutzerbild/);
});
