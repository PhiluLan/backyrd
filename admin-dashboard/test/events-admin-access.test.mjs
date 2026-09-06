import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Events is reachable from the active Founder navigation", async () => {
  const [layout, sidebar, eventsPage] = await Promise.all([
    read("app/layout.tsx"),
    read("components/intelligence/Sidebar.tsx"),
    read("app/events/page.tsx"),
  ]);

  assert.match(layout, /<AdminGuard>/);
  assert.match(layout, /<IntelligenceSidebar\s*\/>/);
  assert.match(sidebar, /href:\s*"\/events",\s*label:\s*"Events"/);
  assert.match(sidebar, /pathname\.startsWith\(`\$\{href\}\/`\)/);
  assert.match(eventsPage, /href="\/events\/new"/);
  assert.match(eventsPage, />\s*Neues Event\s*</);
  assert.match(eventsPage, /className="bi-primaryButton"/);
});

test("Events overview preserves list, search, filters, and edit access", async () => {
  const page = await read("app/events/page.tsx");

  assert.match(page, /\.from\("events_v1"\)/);
  assert.match(page, /\.eq\("primary_source_id",\s*"manual_admin"\)/);
  assert.match(page, /placeholder="Events suchen …"/);
  assert.match(page, /\["DRAFT",\s*"PUBLISHED",\s*"CANCELLED",\s*"ENDED"\]/);
  assert.match(page, /href=\{`\/events\/\$\{event\.id\}\/edit`\}/);
});

test("Create and edit routes keep the complete Manual Admin editor", async () => {
  const [createPage, editPage, editor] = await Promise.all([
    read("app/events/new/page.tsx"),
    read("app/events/[id]/edit/page.tsx"),
    read("app/events/EventEditor.tsx"),
  ]);

  assert.match(createPage, /<EventEditor\s*\/>/);
  assert.match(editPage, /<EventEditor eventId=/);
  assert.match(editor, /save\("DRAFT"\)/);
  assert.match(editor, /save\("PUBLISHED"\)/);
  assert.match(editor, /save\("CANCELLED"\)/);
  assert.match(editor, /VORSCHAU/);
  assert.match(editor, /Wiederkehrend/);
  assert.match(editor, /regenerate_manual_event_occurrences_v1/);
  assert.match(editor, /Zeit ändern/);
  assert.match(editor, /Termin absagen/);
  assert.match(editor, /storage\.from\("event-images"\)\.upload/);
  assert.match(editor, /\.from\("spots"\)/);
  assert.match(editor, /Kein Spot \/ unmatched/);
});

test("Events remain behind the existing Admin authorization boundary", async () => {
  const [layout, guard] = await Promise.all([
    read("app/layout.tsx"),
    read("components/AdminGuard.tsx"),
  ]);

  assert.match(layout, /<AdminGuard>/);
  assert.match(guard, /supabase\.auth\.getSession\(\)/);
  assert.match(guard, /supabase\.rpc\("admin_is_admin_v1"\)/);
  assert.match(guard, /router\.replace\("\/login"\)/);
});
