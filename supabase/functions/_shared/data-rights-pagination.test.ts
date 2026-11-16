import assert from "node:assert/strict";
import { readOrderedPages, removeExportFiles } from "./data-rights-pagination.ts";

Deno.test("export includes rows after the API's first thousand results", async () => {
  const expected = Array.from({ length: 1_250 }, (_, id) => ({ id }));
  const result = await readOrderedPages((from, to) => Promise.resolve({
    data: expected.slice(from, to + 1),
    error: null,
  }));
  assert.deepEqual(result, { data: expected, error: null });
});

Deno.test("a page failure reports an error instead of returning an incomplete table", async () => {
  const error = { message: "unavailable" };
  const result = await readOrderedPages((from) => Promise.resolve(from === 0
    ? { data: Array.from({ length: 500 }, (_, id) => id), error: null }
    : { data: null, error }));
  assert.deepEqual(result, { data: null, error });
});

Deno.test("a mutating storage listing drains the entire export folder", async () => {
  let files = Array.from({ length: 250 }, (_, index) => ({ id: String(index), name: `${index}.json` }));
  const removed = await removeExportFiles(
    "actor",
    () => Promise.resolve({ data: files.slice(0, 100), error: null }),
    (paths) => {
      const selected = new Set(paths);
      files = files.filter(file => !selected.has(`actor/${file.name}`));
      return Promise.resolve({ error: null });
    },
  );
  assert.equal(removed, 250);
  assert.deepEqual(files, []);
});

Deno.test("storage cleanup stops when removal makes no progress", async () => {
  await assert.rejects(removeExportFiles(
    "actor",
    () => Promise.resolve({ data: [{ id: "file", name: "file.json" }], error: null }),
    () => Promise.resolve({ error: null }),
  ), /export_storage_removal_made_no_progress/);
});
