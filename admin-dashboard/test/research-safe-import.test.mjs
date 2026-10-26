import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import {
  createWorldResearchBatch,
  canonicalJson,
  sha256,
} from "../../packages/world-knowledge-core/dist/index.js";
const dir = await mkdtemp(join(tmpdir(), "safe-research-import-"));
const feedback = ts.transpileModule(
  await readFile(
    new URL("../lib/researchSaveFeedback.ts", import.meta.url),
    "utf8",
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
await writeFile(join(dir, "feedback.mjs"), feedback);
const source = await readFile(
  new URL("../lib/server/researchSafeImport.ts", import.meta.url),
  "utf8",
);
const code = ts
  .transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  })
  .outputText.replace('import "server-only";', "")
  .replace(
    '"@backyrd/world-knowledge-core"',
    JSON.stringify(
      new URL(
        "../../packages/world-knowledge-core/dist/index.js",
        import.meta.url,
      ).href,
    ),
  )
  .replace(
    '"../../../packages/spot-research-runtime/src/nuknuk-sources.mjs"',
    JSON.stringify(
      new URL(
        "../../packages/spot-research-runtime/src/nuknuk-sources.mjs",
        import.meta.url,
      ).href,
    ),
  )
  .replace(
    '"../../../packages/spot-research-runtime/src/research-safe-properties.mjs"',
    JSON.stringify(
      new URL(
        "../../packages/spot-research-runtime/src/research-safe-properties.mjs",
        import.meta.url,
      ).href,
    ),
  )
  .replace(
    '"../../../packages/spot-research-runtime/src/research-evidence-policy.mjs"',
    JSON.stringify(
      new URL(
        "../../packages/spot-research-runtime/src/research-evidence-policy.mjs",
        import.meta.url,
      ).href,
    ),
  )
  .replace(
    '"../researchSaveFeedback"',
    JSON.stringify(pathToFileURL(join(dir, "feedback.mjs")).href),
  );
await writeFile(join(dir, "pipeline.mjs"), code);
const { processSafeResearchDocument, BASIC_RESEARCH_KEYS } = await import(
  pathToFileURL(join(dir, "pipeline.mjs")).href
);
const id = "11111111-1111-4111-8111-111111111111",
  batch = "22222222-2222-4222-8222-222222222222",
  at = "2026-10-26T12:00:00Z",
  now = () => Date.parse(at),
  site = "https://example.org/";
const originalSource = {
  url: site,
  evidence: "Öffentliche Kontaktangabe des Restaurants.",
  observedAt: at,
  trust: "OFFICIAL_PRIMARY",
};
const claim = (attributeKey, value) => ({
  attributeKey,
  knowledgeState: "KNOWN_VALUE",
  value,
  source: originalSource,
});
function fixture(
  proposals = [
    claim("contact.public_email", "info@example.org"),
    claim("description.highlight", "Traditionsrestaurant in Basel."),
  ],
) {
  const calls = [];
  let job = null,
    leased = false,
    epoch = 0,
    rebuildFailure = false,
    receiptFailure = false,
    sourceFailure = false,
    concurrent = false,
    readbackMismatch = false,
    safetyHeld = false;
  const answers = {
    "contact.website": {
      claimId: "website",
      knowledgeState: "KNOWN_VALUE",
      value: site,
      visibility: "PUBLIC",
    },
    "location.locality": {
      claimId: "city",
      knowledgeState: "KNOWN_VALUE",
      value: "Basel",
      visibility: "PUBLIC",
    },
    "location.address_line1": {
      claimId: "address",
      knowledgeState: "KNOWN_VALUE",
      value: "Gerbergasse 11",
      visibility: "PUBLIC",
    },
  };
  const base = {
    spotId: id,
    name: "Fixture Restaurant",
    status: "approved",
    actor: { role: "ADMIN", allowedAttributeKeys: [...BASIC_RESEARCH_KEYS] },
    answers,
    manifest: {
      manifestHash: "a".repeat(64),
      worldSnapshot: { spotId: id, epoch },
    },
  };
  const snapshot = () => ({
    ...base,
    answers: structuredClone(answers),
    manifest: structuredClone(base.manifest),
  });
  const document = createWorldResearchBatch({
    batchId: batch,
    createdAt: at,
    spots: [
      {
        spotId: id,
        name: base.name,
        locality: "Basel",
        manifestHash: base.manifest.manifestHash,
        existingValues: structuredClone(answers),
      },
    ],
  });
  document.research.spots[0].claims = proposals;
  const saved = new Map();
  const repository = {
    readSpot: async () => {
      const s = snapshot();
      if (safetyHeld && epoch)
        s.answers["contact.public_email"].visibility = "SHADOW_HELD";
      if (readbackMismatch && epoch)
        s.answers["contact.public_email"].value = "wrong@example.org";
      return s;
    },
    createOrRead: async (value) => {
      calls.push("journal");
      if (!job) job = structuredClone(value);
      return structuredClone(job);
    },
    acquire: async () => {
      if (leased) return false;
      leased = true;
      return true;
    },
    checkpoint: async (value) => {
      job = structuredClone(value);
      calls.push("proof-checkpoint");
    },
    importClaims: async (_id, _batch, manifest, claims) => {
      calls.push("import");
      assert.ok(job.metadata.accepted.length);
      assert.equal(manifest, base.manifest.manifestHash);
      if (concurrent) throw Error("CANONICAL_IMPORT_REJECTED");
      for (const c of claims)
        if (!saved.has(c.attributeKey) && answers[c.attributeKey])
          throw Error("CANONICAL_IMPORT_REJECTED");
      for (const c of claims) {
        assert.equal(c.supersedesClaimId, null);
        if (saved.has(c.attributeKey)) {
          assert.equal(saved.get(c.attributeKey), canonicalJson(c));
          continue;
        }
        saved.set(c.attributeKey, canonicalJson(c));
        answers[c.attributeKey] = {
          claimId: "saved:" + c.attributeKey,
          knowledgeState: c.knowledgeState,
          value: c.value,
          visibility: "PUBLIC",
        };
      }
    },
    rebuild: async () => {
      calls.push("rebuild");
      if (rebuildFailure) throw Error("PROFILE_REBUILD_FAILED");
      epoch++;
      base.manifest = {
        manifestHash: sha256({ epoch }),
        worldSnapshot: { spotId: id, epoch },
      };
      return structuredClone(base.manifest);
    },
    finish: async (value) => {
      calls.push("finish");
      if (receiptFailure) throw Error("receipt_failed");
      job = structuredClone(value);
      leased = false;
    },
  };
  const fetchPage = async () => {
    calls.push("fetch");
    if (sourceFailure) throw Error("source_http_403");
    return {
      url: site,
      contentType: "text/html",
      observedAt: at,
      body: '<h1>Fixture Restaurant</h1><p>Gerbergasse 11, 4001 Basel</p><footer><aside><a href="mailto:info@example.org">info@example.org</a><a href="tel:+41610000000">+41 61 000 00 00</a></aside></footer>',
    };
  };
  return {
    document,
    answers,
    calls,
    repository,
    fetchPage,
    saved,
    run: () =>
      processSafeResearchDocument(document, {
        actorId: "admin",
        repository,
        fetchPage,
        now,
      }),
    get job() {
      return job;
    },
    flags(v) {
      rebuildFailure = v.rebuildFailure ?? rebuildFailure;
      receiptFailure = v.receiptFailure ?? receiptFailure;
      sourceFailure = v.sourceFailure ?? sourceFailure;
      concurrent = v.concurrent ?? concurrent;
      readbackMismatch = v.readbackMismatch ?? readbackMismatch;
      safetyHeld = v.safetyHeld ?? safetyHeld;
    },
    release() {
      leased = false;
    },
    base,
  };
}
test("research splits into a stored-and-reread safe value and a persisted review proposal", async () => {
  const f = fixture(),
    r = await f.run();
  assert.equal(r.report.saveState, "STORED_VERIFIED");
  assert.deepEqual(r.report.stored, ["contact.public_email"]);
  assert.equal(r.report.review[0].attributeKey, "description.highlight");
  assert.equal(r.report.state, "REVIEW_REQUIRED");
  assert.equal(f.job.metadata.phase, "FINISHED");
  assert.equal(f.job.document.exportHash, r.document.exportHash);
  assert.equal(r.document.batch.spots[0].manifestHash, r.report.manifestHash);
  assert.ok(f.calls.indexOf("proof-checkpoint") < f.calls.indexOf("import"));
  assert.match(
    f.job.metadata.accepted[0].source.evidence,
    /keine manuelle Einzelprüfung/,
  );
});
test("existing confirmed and explicitly unknown values are never overwritten", async () => {
  for (const knowledgeState of ["KNOWN_VALUE", "UNKNOWN"]) {
    const f = fixture([claim("contact.phone", "+41610000000")]);
    f.answers["contact.phone"] = {
      claimId: "owner",
      knowledgeState,
      value: knowledgeState === "UNKNOWN" ? null : "+41619999999",
      visibility: "PUBLIC",
    };
    const r = await f.run();
    assert.equal(r.report.review[0].reason, "EXISTING_VALUE_PROTECTED");
    assert.ok(!f.calls.includes("import"));
    assert.equal(f.answers["contact.phone"].claimId, "owner");
  }
});
test("same values are no-ops and a completed batch does not write a second time", async () => {
  const f = fixture();
  await f.run();
  const count = f.calls.filter((x) => x === "import").length;
  const r = await f.run();
  assert.equal(f.calls.filter((x) => x === "import").length, count);
  assert.equal(f.saved.size, 1);
  assert.equal(r.report.saveState, "STORED_VERIFIED");
  const g = fixture([claim("contact.website", site)]),
    same = await g.run();
  assert.deepEqual(same.report.unchanged, ["contact.website"]);
  assert.ok(!g.calls.includes("import"));
});
test("a rebuild failure is not reported as success and resumes from durable proof without duplicate claims", async () => {
  const f = fixture();
  f.flags({ rebuildFailure: true });
  const first = await f.run();
  assert.equal(first.report.state, "SAVED_UNVERIFIED");
  assert.equal(first.report.saveState, "SAVED_UNVERIFIED");
  assert.deepEqual(first.report.stored, []);
  const frozen = canonicalJson(f.job.metadata.accepted);
  f.flags({ rebuildFailure: false });
  const result = await f.run();
  assert.equal(result.report.saveState, "STORED_VERIFIED");
  assert.equal(f.saved.size, 1);
  assert.equal(canonicalJson(f.job.metadata.accepted), frozen);
  assert.equal(f.calls.filter((c) => c === "fetch").length, 1);
});
test("a concurrent field write causes the canonical import to reject instead of overwrite", async () => {
  const f = fixture();
  f.flags({ concurrent: true });
  const r = await f.run();
  assert.deepEqual(r.report.stored, []);
  assert.equal(f.saved.size, 0);
  assert.notEqual(r.report.saveState, "STORED_VERIFIED");
  assert.ok(r.report.errors.includes("CANONICAL_IMPORT_REJECTED"));
});
test("missing official source routes proposals to review and keeps unknowns explicit", async () => {
  const f = fixture();
  f.flags({ sourceFailure: true });
  const r = await f.run();
  assert.equal(r.report.saveState, "NOT_WRITTEN");
  assert.equal(r.report.sourceFailures.length, 1);
  assert.equal(r.report.review[0].reason, "OFFICIAL_SOURCE_UNAVAILABLE");
  assert.equal(f.job.metadata.phase, "FINISHED");
  assert.ok(
    r.report.unresolved.some((x) => x.attributeKey === "contact.tiktok"),
  );
  assert.ok(!f.calls.includes("import"));
});
test("changed document, actor or identity cannot reuse a prior job", async () => {
  const f = fixture();
  await f.run();
  const altered = structuredClone(f.document);
  altered.research.spots[0].claims[0].value = "evil@example.org";
  await assert.rejects(
    processSafeResearchDocument(altered, {
      actorId: "admin",
      repository: f.repository,
      fetchPage: f.fetchPage,
      now,
    }),
    /job_binding_invalid/,
  );
  await assert.rejects(
    processSafeResearchDocument(f.document, {
      actorId: "other-admin",
      repository: f.repository,
      fetchPage: f.fetchPage,
      now,
    }),
    /job_binding_invalid/,
  );
  const g = fixture();
  g.base.actor.role = "OWNER_BASIC";
  await assert.rejects(g.run(), /identity_changed/);
  assert.ok(!g.calls.includes("journal"));
});
test("schema errors and non-basic claims fail before a job can write", async () => {
  const f = fixture([claim("amenity.features", ["WIFI"])]);
  await assert.rejects(f.run(), /basics_only/);
  assert.equal(f.saved.size, 0);
  const g = fixture([claim("contact.phone", { bad: "shape" })]);
  await assert.rejects(g.run(), /value_invalid/);
  assert.ok(!g.calls.includes("journal"));
});
test("reader mismatch and lost completion receipt never fabricate a stored confirmation", async () => {
  const f = fixture();
  f.flags({ readbackMismatch: true });
  const r = await f.run();
  assert.equal(r.report.state, "SAVED_UNVERIFIED");
  assert.equal(r.report.stored.length, 0);
  const g = fixture();
  g.flags({ receiptFailure: true });
  await assert.rejects(g.run(), (e) => e.saveState === "SAVED_UNVERIFIED");
  assert.equal(g.saved.size, 1);
  assert.equal(g.job.metadata.phase, "PROVED");
  g.release();
  g.flags({ receiptFailure: false });
  assert.equal((await g.run()).report.saveState, "STORED_VERIFIED");
  assert.equal(g.saved.size, 1);
});
test("geographic facts and summaries remain review-only even when the model calls them certain", async () => {
  const f = fixture([
    claim("location.timezone", "Europe/Zurich"),
    claim("description.highlight", "Best place in Basel"),
  ]);
  const r = await f.run();
  assert.equal(r.report.review.length, 2);
  assert.equal(r.report.stored.length, 0);
  assert.ok(!f.calls.includes("import"));
});
test("lease collision and manifest drift stop automatic writes", async () => {
  const f = fixture();
  f.repository.acquire = async () => false;
  await assert.rejects(f.run(), /already_processing/);
  assert.equal(f.saved.size, 0);
  const g = fixture();
  g.base.manifest.manifestHash = "b".repeat(64);
  const r = await g.run();
  assert.ok(r.report.errors.includes("research_pipeline_manifest_drift"));
  assert.equal(g.saved.size, 0);
});
test("pipeline route authenticates and checks the server release flag before processing; normal preview stays separate", async () => {
  const route = await readFile(
    new URL(
      "../app/api/world-knowledge/research-pipeline/route.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.ok(
    route.indexOf("authorizeAdminRequest(request)") <
      route.indexOf("processSafeResearchDocument(document"),
  );
  assert.match(route, /WORLD_RESEARCH_SAFE_IMPORT_ENABLED/);
  assert.match(route, /Buffer.byteLength\(text\)/);
  assert.match(route, /status:\s*413/);
  assert.doesNotMatch(route, /confirmations|reviewed_by|reviewed_at:/);
});

test("a changed canonical website between proof and commit cancels the write", async () => {
  const f = fixture();
  const read = f.repository.readSpot;
  let n = 0;
  f.repository.readSpot = async (...args) => {
    const d = await read(...args);
    if (++n === 2)
      d.answers["contact.website"].value = "https://different.org/";
    return d;
  };
  const result = await f.run();
  assert.ok(result.report.errors.includes("research_pipeline_identity_drift"));
  assert.ok(!f.calls.includes("import"));
});

test("an interrupted proof cannot insert an old contact after its observation expires", async () => {
  const f = fixture();
  f.flags({ concurrent: true });
  await f.run();
  assert.equal(f.saved.size, 0);
  f.flags({ concurrent: false });
  const result = await processSafeResearchDocument(f.document, {
    actorId: "admin",
    repository: f.repository,
    fetchPage: f.fetchPage,
    now: () => Date.parse(at) + 301000,
  });
  assert.ok(result.report.errors.includes("research_pipeline_proof_expired"));
  assert.equal(f.saved.size, 0);
});

test("v2 imports a grounded lunch synonym, corrects the exact old claim, and completes with honest gaps", async () => {
  const proposal = {
    ...claim("offering.groups", ["DINNER", "LUNCH"]),
    source: { ...originalSource, evidence: "Mittag und Abendessen" },
  };
  const f = fixture([proposal]);
  f.answers["offering.groups"] = {
    claimId: "old-offers",
    knowledgeState: "KNOWN_VALUE",
    visibility: "PUBLIC",
    value: ["DINNER"],
  };
  f.document.research.assessments = [
    {
      attributeKey: "offering.groups",
      uncertainty: "MINOR",
      reason: "Mittag ist hier das ausdrücklich angebotene Mittagessen.",
      bindings: {},
    },
  ];
  const repository = {
    ...f.repository,
    readSpot: async (id) => {
      const detail = await f.repository.readSpot(id);
      return {
        ...detail,
        actor: {
          ...detail.actor,
          allowedAttributeKeys: [
            ...detail.actor.allowedAttributeKeys,
            "offering.groups",
          ],
        },
      };
    },
    importClaims: async (_id, _batch, _manifest, claims) => {
      assert.equal(claims.length, 1);
      assert.equal(claims[0].supersedesClaimId, "old-offers");
      f.answers["offering.groups"] = {
        claimId: "new-offers",
        knowledgeState: "KNOWN_VALUE",
        visibility: "PUBLIC",
        value: claims[0].value,
      };
    },
  };
  const fetchPage = async () => ({
    ...(await f.fetchPage()),
    body: "<h1>Fixture Restaurant</h1><p>Gerbergasse 11, Basel</p><p>Mittag und Abendessen</p>",
  });
  const result = await processSafeResearchDocument(f.document, {
    actorId: "admin",
    repository,
    fetchPage,
    now,
  });
  assert.equal(result.report.policy, "backyrd.research-evidence@2");
  assert.deepEqual(result.report.stored, ["offering.groups"]);
  assert.equal(result.report.state, "COMPLETE");
  assert.ok(result.report.unresolved.length > 0);
  assert.equal(result.report.review.length, 0);
  assert.equal(result.report.decisions[0].uncertainty, "MINOR");
  assert.deepEqual(
    result.document.research.assessments,
    f.document.research.assessments,
  );
});

test("v2 major uncertainty creates an actionable review and never writes", async () => {
  const f = fixture([
    {
      ...claim("contact.public_email", "info@example.org"),
      source: { ...originalSource, evidence: "info@example.org" },
    },
  ]);
  f.document.research.assessments = [
    {
      attributeKey: "contact.public_email",
      uncertainty: "MAJOR",
      reason: "Die Adresse könnte zum Nachbarbetrieb gehören.",
      bindings: {},
    },
  ];
  const result = await f.run();
  assert.equal(
    result.report.state,
    "REVIEW_REQUIRED",
    JSON.stringify(result.report),
  );
  assert.equal(result.report.review[0].reason, "MAJOR_UNCERTAINTY");
  assert.equal(f.calls.includes("import"), false);
});

test("v2 persists the fresh hash of every supporting source, including observed subpages", async () => {
  const proposal = {
    ...claim("offering.groups", ["DINNER", "LUNCH"]),
    source: { ...originalSource, evidence: "Mittag" },
    supportingSources: [
      { ...originalSource, url: site + "restaurant", evidence: "Abendessen" },
    ],
  };
  const f = fixture([proposal]);
  f.document.research.assessments = [
    {
      attributeKey: "offering.groups",
      uncertainty: "MINOR",
      reason: "Mittag und Abendessen sind auf den offiziellen Seiten belegt.",
      bindings: {},
    },
  ];
  const repository = {
    ...f.repository,
    readSpot: async (id) => {
      const detail = await f.repository.readSpot(id);
      return {
        ...detail,
        actor: {
          ...detail.actor,
          allowedAttributeKeys: [
            ...detail.actor.allowedAttributeKeys,
            "offering.groups",
          ],
        },
      };
    },
  };
  const fetchPage = async (url) => ({
    url,
    contentType: "text/html",
    observedAt: at,
    body:
      url === site
        ? '<h1>Fixture Restaurant</h1><p>Gerbergasse 11 Basel</p><p>Mittag</p><a href="/restaurant">Restaurant</a>'
        : "<h1>Abendessen</h1>",
  });
  const result = await processSafeResearchDocument(f.document, {
    actorId: "admin",
    repository,
    fetchPage,
    now,
  });
  assert.deepEqual(result.report.errors, []);
  assert.deepEqual(result.report.stored, ["offering.groups"]);
  const proofs = result.report.decisions[0].sourceProofs;
  assert.equal(proofs.length, 2);
  assert.notEqual(proofs[0].hash, proofs[1].hash);
  assert.deepEqual(
    proofs.map((p) => p.url),
    [site, site + "restaurant"],
  );
  assert.ok(proofs.every((p) => p.observedAt === at));
});

test("v2 enriches an existing offer profile through the exact superseding transaction", async () => {
  const previous = {
    contractVersion: "backyrd.world-knowledge.experience-profile@1.0",
    category: "EAT",
    reviewed: true,
    properties: [],
    areas: [
      { id: "restaurant", kind: "INDOOR", name: "Restaurant", properties: [] },
    ],
    offers: [
      {
        id: "lunch",
        kind: "LUNCH",
        name: "Mittagessen",
        properties: [],
        areaIds: [],
        prices: [],
        schedule: [],
        validFrom: null,
        validUntil: null,
      },
    ],
  };
  const value = structuredClone(previous);
  value.offers[0].areaIds = ["restaurant"];
  const f = fixture([
    {
      ...claim("experience.profile", value),
      source: { ...originalSource, evidence: "Restaurant zum Mittagessen" },
    },
  ]);
  f.answers["experience.profile"] = {
    claimId: "existing-profile",
    visibility: "PUBLIC",
    knowledgeState: "KNOWN_VALUE",
    value: previous,
  };
  f.document.research.assessments = [
    {
      attributeKey: "experience.profile",
      uncertainty: "MINOR",
      reason:
        "Mittagessen ist ausdrücklich im Restaurant verfügbar; bisherige Details bleiben erhalten.",
      bindings: { "/offers/0/areaIds": 0 },
    },
  ];
  const repository = {
    ...f.repository,
    readSpot: async (id) => {
      const detail = await f.repository.readSpot(id);
      return {
        ...detail,
        actor: {
          ...detail.actor,
          allowedAttributeKeys: [
            ...detail.actor.allowedAttributeKeys,
            "experience.profile",
          ],
        },
      };
    },
    importClaims: async (_id, _batch, _hash, claims) => {
      assert.equal(claims.length, 1);
      assert.equal(claims[0].supersedesClaimId, "existing-profile");
      f.answers["experience.profile"] = {
        claimId: "enriched-profile",
        visibility: "PUBLIC",
        knowledgeState: "KNOWN_VALUE",
        value: claims[0].value,
      };
    },
  };
  const fetchPage = async () => ({
    ...(await f.fetchPage()),
    body: "<h1>Fixture Restaurant</h1><p>Gerbergasse 11 Basel</p><p>Restaurant zum Mittagessen</p>",
  });
  const result = await processSafeResearchDocument(f.document, {
    actorId: "admin",
    repository,
    fetchPage,
    now,
  });
  assert.deepEqual(result.report.errors, []);
  assert.deepEqual(result.report.stored, ["experience.profile"]);
  assert.equal(result.report.review.length, 0);
  assert.deepEqual(f.answers["experience.profile"].value.offers[0].areaIds, [
    "restaurant",
  ]);
});

test("a confirmed safety hold becomes a review, never a generic failed readback or public success", async () => {
  const f = fixture([claim("contact.public_email", "info@example.org")]);
  f.flags({ safetyHeld: true });
  const result = await f.run();
  assert.equal(result.report.state, "REVIEW_REQUIRED");
  assert.equal(result.report.saveState, "HELD_FOR_REVIEW");
  assert.deepEqual(result.report.stored, []);
  assert.deepEqual(result.report.errors, []);
  assert.equal(result.report.review[0].reason, "CONTENT_SAFETY_HELD");
  assert.equal(f.job.metadata.phase, "FINISHED");
});

test("projection retries reuse the durable timestamp and never duplicate canonical writes", async () => {
  const f = fixture([claim("contact.public_email", "info@example.org")]);
  f.flags({ rebuildFailure: true });
  const requests = [];
  const repository = {
    ...f.repository,
    rebuild: async (spot, key, asOf) => {
      requests.push({ spot, key, asOf });
      return f.repository.rebuild(spot, key, asOf);
    },
  };
  const first = await processSafeResearchDocument(f.document, {
    actorId: "admin",
    repository,
    fetchPage: f.fetchPage,
    now,
  });
  assert.equal(first.report.saveState, "SAVED_UNVERIFIED");
  f.flags({ rebuildFailure: false });
  const second = await processSafeResearchDocument(f.document, {
    actorId: "admin",
    repository,
    fetchPage: f.fetchPage,
    now: () => now() + 10000,
  });
  assert.equal(second.report.saveState, "STORED_VERIFIED");
  assert.deepEqual(requests[0], requests[1]);
  assert.equal(f.calls.filter((c) => c === "import").length, 1);
  assert.match(requests[0].key, /safe-rebuild:v2$/u);
});
