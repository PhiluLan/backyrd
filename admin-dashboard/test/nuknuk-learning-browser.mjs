/** Manual browser acceptance with synthetic intercepted services, never Production. */
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
const base = process.argv[2] ?? "http://127.0.0.1:3192",
  out = process.argv[3] ?? "/private/tmp/nuknuk-learning-browser";
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base))
  throw Error("local_browser_target_required");
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1040 },
  });
  const actor = "12000000-0000-4000-8000-000000000001";
  const user = {
    id: actor,
    aud: "authenticated",
    role: "authenticated",
    email: "reviewer@fixture.invalid",
    app_metadata: { provider: "email" },
    user_metadata: {},
    created_at: "2026-11-24T10:00:00Z",
  };
  const token = [
    { alg: "HS256", typ: "JWT" },
    {
      sub: actor,
      role: "authenticated",
      aud: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 3600,
    },
    "fixture",
  ]
    .map((x, i) =>
      Buffer.from(i === 2 ? x : JSON.stringify(x)).toString("base64url"),
    )
    .join(".");
  await context.addInitScript(
    ({ token, user }) =>
      localStorage.setItem(
        "sb-127-auth-token",
        JSON.stringify({
          access_token: token,
          refresh_token: "fixture-refresh",
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          expires_in: 3600,
          token_type: "bearer",
          user,
        }),
      ),
    { token, user },
  );
  const headers = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "content-type": "application/json",
  };
  const cases = new Map(),
    events = new Map(),
    runs = [];
  let conflict = false,
    admin = true,
    missing = false,
    clock = 0;
  const now = () =>
    new Date(Date.parse("2026-11-24T10:00:00Z") + clock++ * 1000).toISOString();
  const target = {
    meaning: {
      entities: [
        { id: "a1", kind: "ACTIVITY", label: "Kaffee trinken", members: [] },
      ],
      facts: [
        {
          id: "f1",
          modality: "REQUIRED",
          basis: "EXPLICIT",
          subjectIds: ["a1"],
          key: "food.drink",
          value: { text: "coffee" },
        },
      ],
      logic: null,
      bindings: [],
      extensions: [],
      uncertainties: [],
      weatherConditions: [],
    },
  };
  const sha = (b) => createHash("sha256").update(b).digest("hex");
  function event(row, kind, note) {
    const e = events.get(row.id) ?? [];
    e.unshift({
      id: clock++,
      case_id: row.id,
      actor_id: actor,
      event: kind,
      revision: row.revision,
      note,
      created_at: now(),
    });
    events.set(row.id, e);
  }
  function pageData(payload) {
    const groups = new Map();
    for (const row of cases.values()) {
      const key = row.topic + row.split;
      const g = groups.get(key) ?? {
        topic: row.topic,
        split: row.split,
        familyIds: new Set(),
        situations: 0,
        approved: 0,
        review: 0,
        blocked: 0,
        synthetic: 0,
      };
      g.familyIds.add(row.family_id);
      g.situations++;
      if (row.state in g) g[row.state]++;
      if (row.document.source === "synthetic") g.synthetic++;
      groups.set(key, g);
    }
    const coverage = [...groups.values()].map(({ familyIds, ...g }) => ({
      ...g,
      families: familyIds.size,
    }));
    const rows = [...cases.values()]
      .filter(
        (r) =>
          (!payload.state || r.state === payload.state) &&
          (!payload.topic || r.topic === payload.topic) &&
          (!payload.split || r.split === payload.split) &&
          (!payload.search ||
            r.document.query
              .toLowerCase()
              .includes(payload.search.toLowerCase())),
      )
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    return {
      version: "backyrd.nuknuk-learning@1",
      rows,
      coverage,
      pageSize: 50,
    };
  }
  await context.route("http://127.0.0.1:56984/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    let body = {};
    try {
      body = request.postDataJSON() ?? {};
    } catch {}
    const respond = (value, status = 200) =>
      route.fulfill({ status, headers, body: JSON.stringify(value) });
    if (request.method() === "OPTIONS") return respond({});
    if (url.pathname.startsWith("/auth/")) return respond(user);
    if (url.pathname.endsWith("admin_is_admin_v1")) return respond(admin);
    if (url.pathname.endsWith("admin_list_product_feedback_v2"))
      return respond({
        rows: [],
        page_size: 30,
        summary: {
          total: 0,
          new: 0,
          reviewing: 0,
          done: 0,
          helpful: 0,
          almost: 0,
          not_helpful: 0,
        },
      });
    if (
      url.pathname.endsWith("/nuknuk-learning") &&
      body.action === "situations"
    ) {
      for (let i = 0; i < 5; i++) {
        const id = randomUUID(),
          document = {
            query: `Synthetischer neuer Wunsch ${i + 1}`,
            notes: "",
            obligations: ["Verschiedenheit prüfen."],
            forbidden: [],
            tags: [],
            locale: "de-CH",
            reference: {
              now: "2026-11-25T09:00:00Z",
              timezone: "Europe/Zurich",
            },
            source: "synthetic",
            dataPolicy: "SYNTHETIC_OR_REDACTED",
          };
        const row = {
          id,
          family_id: randomUUID(),
          parent_id: null,
          revision: 1,
          state: "draft",
          document,
          target: null,
          target_policy: null,
          approval_hash: null,
          approved_by: null,
          updated_at: now(),
          family_title: `Neue synthetische Familie ${i + 1}`,
          topic: body.topic,
          split: body.split,
        };
        cases.set(id, row);
        event(row, "created", "Ungeprüfter synthetischer Vorschlag.");
      }
      return respond({
        result: { situationsCreated: 5 },
        humanApproved: false,
        trainingStarted: false,
      });
    }
    if (url.pathname.endsWith("/nuknuk-learning")) {
      const row = cases.get(body.id);
      if (!row) return respond({ error: "missing" }, 404);
      row.target = target;
      row.state = "review";
      row.target_policy = "backyrd.learning-teacher@1:" + "b".repeat(64);
      row.revision++;
      row.updated_at = now();
      event(
        row,
        "translated",
        "Synthetic browser fixture proposal, not a live model test.",
      );
      return respond({
        result: { id: row.id },
        humanApproved: false,
        trainingStarted: false,
      });
    }
    if (!url.pathname.endsWith("admin_nuknuk_learning_v1"))
      return respond({ code: "unsupported_fixture_request" }, 400);
    const action = body.p_action,
      payload = body.p_payload ?? {},
      row = cases.get(body.p_id);
    if (missing)
      return respond(
        { code: "PGRST202", message: "function unavailable" },
        404,
      );
    if (action === "list") return respond(pageData(payload));
    if (action === "runs")
      return respond(runs.map(({ manifestBytes, ...r }) => r));
    if (action === "create") {
      if (cases.has(body.p_id)) return respond({ code: "23505" }, 409);
      const parent = cases.get(payload.parentId);
      const r = {
        id: body.p_id,
        family_id: parent?.family_id ?? randomUUID(),
        parent_id: parent?.id ?? null,
        revision: 1,
        state: "draft",
        document: payload.document,
        target: null,
        target_policy: null,
        approval_hash: null,
        approved_by: null,
        updated_at: now(),
        family_title: parent?.family_title ?? payload.familyTitle,
        topic: parent?.topic ?? payload.topic,
        split: parent?.split ?? payload.split,
      };
      cases.set(r.id, r);
      event(r, "created", "Synthetic fixture created.");
      return respond({ id: r.id, revision: 1 });
    }
    if (action === "detail")
      return row
        ? respond({ case: row, history: events.get(row.id) ?? [] })
        : respond({ code: "P0002" }, 404);
    if (action === "save" || action === "review" || action === "comment") {
      if (conflict) {
        conflict = false;
        row.revision++;
        return respond(
          { code: "40001", message: "learning_revision_conflict" },
          409,
        );
      }
      if (row.revision !== body.p_expected_revision)
        return respond({ code: "40001" }, 409);
      row.revision++;
      row.updated_at = now();
      if (action === "save") {
        row.document = payload.document;
        row.target = null;
        row.target_policy = null;
        row.approval_hash = null;
        row.approved_by = null;
        row.state = "draft";
      }
      if (action === "review") {
        row.state = payload.state;
        row.approval_hash =
          payload.state === "approved" ? "a".repeat(64) : null;
        row.approved_by = payload.state === "approved" ? actor : null;
      }
      event(row, action, payload.note ?? "");
      return respond({ id: row.id, revision: row.revision });
    }
    if (action === "prepare") {
      const rows = [...cases.values()].filter(
        (r) => r.state === "approved" && r.split !== "TEST",
      );
      if (!["TRAIN", "DEV"].every((s) => rows.some((r) => r.split === s)))
        return respond(
          { code: "22023", message: "learning_train_and_dev_required" },
          400,
        );
      const id = randomUUID(),
        manifestBytes = JSON.stringify({
          version: "backyrd.nuknuk-learning@1",
          id,
          kind: payload.kind,
          rows: rows.map((r) => ({
            id: r.id,
            familyId: r.family_id,
            split: r.split,
            revision: r.revision,
            approvalHash: r.approval_hash,
            document: r.document,
            target: r.target,
            targetPolicy: r.target_policy,
          })),
        });
      const run = {
        id,
        title: payload.title,
        kind: payload.kind,
        state: "prepared",
        manifest_hash: sha(manifestBytes),
        manifestBytes,
        created_at: now(),
        report: null,
        case_count: rows.length,
        adapter_hash: null,
      };
      runs.unshift(run);
      return respond({
        id,
        manifestHash: run.manifest_hash,
        caseCount: rows.length,
      });
    }
    if (action === "export") {
      const r = runs.find((r) => r.id === body.p_id);
      r.state = "exported";
      return respond({
        manifestBytes: r.manifestBytes,
        manifestHash: r.manifest_hash,
      });
    }
    if (action === "report") {
      const r = runs.find((r) => r.id === body.p_id);
      r.state = "reported";
      r.report = payload.report;
      return respond({
        id: r.id,
        state: "reported",
        productionActivated: false,
      });
    }
    return respond({ code: "fixture_action_missing" }, 400);
  });
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.setDefaultTimeout(15000);
  await page.goto(base + "/nuknuk/lernen");
  await page
    .getByRole("heading", { name: "NukNuk-Lernwerkstatt", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "30 Startentwürfe anlegen", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "30 Entwürfe angelegt" })
    .waitFor();
  assert.equal(cases.size, 30);
  const first = [...cases.values()][0];
  const list = page.locator('section[aria-label="Situationsliste"]');
  await list
    .getByRole("button")
    .filter({ hasText: first.document.query })
    .click();
  const detail = page.locator('section[aria-label="Situation prüfen"]');
  await detail
    .getByRole("button", {
      name: "Erwartete Bedeutung vorbereiten",
      exact: true,
    })
    .click();
  await detail
    .getByRole("heading", { name: "Deine Prüfung", exact: true })
    .waitFor();
  await detail
    .getByLabel("Alle genannten Wünsche und Einschränkungen sind enthalten.")
    .check();
  await detail
    .getByLabel("Personen, Alter, Gruppen und Bezüge stimmen.")
    .check();
  await detail
    .getByLabel(
      "Es wurde nichts hinzugefügt oder aus einem Wunsch eine Pflicht gemacht.",
    )
    .check();
  await detail
    .getByLabel(
      "Die Fassung ist datenschutzgerecht und darf als Lern- oder Prüffall verwendet werden.",
    )
    .check();
  await detail
    .getByRole("button", {
      name: "Passt · diese Fassung freigeben",
      exact: true,
    })
    .click();
  await detail.getByText("Freigegeben", { exact: true }).waitFor();
  assert.equal(cases.get(first.id).state, "approved");
  await detail
    .getByRole("button", { name: "In eigenen Worten ändern", exact: true })
    .click();
  await page
    .getByLabel("Hinweis oder Korrektur in deinen Worten")
    .fill("Eine Korrektur, die bei einem Konflikt erhalten bleiben muss.");
  await page
    .getByLabel("Die Situation ist erfunden oder ausreichend anonymisiert.", {
      exact: false,
    })
    .check();
  conflict = true;
  await page
    .getByRole("button", { name: "Entwurf speichern", exact: true })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Eingaben bleiben erhalten" })
    .waitFor();
  assert.match(
    await page
      .getByLabel("Hinweis oder Korrektur in deinen Worten")
      .inputValue(),
    /Konflikt/,
  );
  await page
    .getByRole("button", {
      name: "Aktuelle Situation laden · Eingaben verwerfen",
    })
    .click();
  await detail
    .getByRole("button", { name: "In eigenen Worten ändern", exact: true })
    .click();
  await page
    .getByLabel("Hinweis oder Korrektur in deinen Worten")
    .fill("Ruhe ist ein Wunsch, keine Pflicht.");
  await page
    .getByLabel("Die Situation ist erfunden oder ausreichend anonymisiert.", {
      exact: false,
    })
    .check();
  await page
    .getByRole("button", { name: "Entwurf speichern", exact: true })
    .click();
  await detail.getByText("Entwurf", { exact: true }).waitFor();
  assert.equal(cases.get(first.id).target, null);
  assert.equal(cases.get(first.id).approval_hash, null);
  await page.getByRole("tab", { name: "Prüfpakete", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Bis zu 10 Entwürfe mit KI vorbereiten",
      exact: true,
    })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "10 Karten vorbereitet" })
    .waitFor();
  await page
    .getByPlaceholder("Was stimmt? Was müssen wir noch klären?")
    .fill("Diese Bedeutung ist noch nicht vollständig geprüft.");
  await detail.getByRole("button", { name: "Unklar", exact: true }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "Als unklar markiert" })
    .waitFor();
  assert.equal(
    [...cases.values()].filter((c) => c.state === "blocked").length,
    1,
  );
  await page.screenshot({ path: out + "/review-desktop.png", fullPage: true });
  await page.getByRole("tab", { name: "Abdeckung", exact: true }).click();
  await page
    .getByRole("table")
    .filter({ hasText: "Abdeckung nach Bereich" })
    .waitFor();
  await page
    .getByRole("button", { name: "5 neue Situationen entwerfen", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "5 neue synthetische Situationen" })
    .waitFor();
  assert.equal(cases.size, 35);
  await page.screenshot({
    path: out + "/coverage-desktop.png",
    fullPage: true,
  });
  await page.getByRole("tab", { name: "Trainingsläufe", exact: true }).click();
  await page.getByLabel("Name des Pakets").fill("Erste Lernrunde");
  await page
    .getByRole("button", { name: "Freigegebenes Lernpaket einfrieren" })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "mindestens eine freigegebene Lernfamilie" })
    .waitFor();
  assert.equal(runs.length, 0);
  for (const split of ["TRAIN", "DEV"]) {
    const row = [...cases.values()].find((r) => r.split === split);
    row.state = "approved";
    row.target = target;
    row.target_policy = "backyrd.learning-teacher@1:" + "b".repeat(64);
    row.approval_hash = "a".repeat(64);
    row.approved_by = actor;
  }
  await page
    .getByRole("button", { name: "Freigegebenes Lernpaket einfrieren" })
    .click();
  await page.getByText("Vorbereitet", { exact: true }).waitFor();
  assert.equal(runs.length, 1);
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Paket für den Mac herunterladen" })
    .click();
  const file = await downloaded;
  assert.match(file.suggestedFilename(), /^nuknuk-.*\.json$/);
  assert.equal(runs[0].state, "exported");
  const report = {
    version: "backyrd.nuknuk-learning-report@1",
    manifestHash: runs[0].manifest_hash,
    adapterHash: "2".repeat(64),
    kind: "LOCAL_INFERENCE_COMPARISON",
    productionActivated: false,
    rows: [
      {
        id: first.id,
        query: first.document.query,
        status: "SEMANTIC_REVIEW_REQUIRED",
        durationMs: 1200,
        parentCards: [],
        candidateCards: [],
      },
    ],
  };
  await page
    .getByLabel("Ergebnisbericht vom Mac")
    .setInputFiles({
      name: "synthetic-report.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(report)),
    });
  await page.getByText("Bericht eingereicht", { exact: true }).waitFor();
  await page
    .getByText(
      "Eingereichter Nachweis – keine automatische Qualitätsfreigabe oder Live-Aktivierung.",
      { exact: true },
    )
    .waitFor();
  await page.screenshot({ path: out + "/runs-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("tab", { name: "Abdeckung", exact: true }).click();
  await page.getByRole("table").waitFor();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
    "no mobile body overflow",
  );
  await page.screenshot({ path: out + "/coverage-mobile.png", fullPage: true });
  await page.goto(
    base + "/nuknuk/lernen?feedback=22000000-0000-4000-8000-000000000001",
  );
  await page
    .getByText("Es wurde kein Originaltext übernommen.", { exact: false })
    .waitFor();
  assert.equal(
    await page.getByLabel("So würde ein Mensch fragen").inputValue(),
    "",
  );
  missing = true;
  await page.reload();
  await page
    .getByRole("alert")
    .filter({ hasText: "noch nicht eingerichtet" })
    .waitFor();
  await page.screenshot({
    path: out + "/backend-unavailable.png",
    fullPage: true,
  });
  missing = false;
  assert.deepEqual(errors, []);
  await writeFile(
    out + "/receipt.json",
    JSON.stringify(
      {
        scope: "SYNTHETIC_INTERCEPTED_BROWSER_NOT_PRODUCTION_AUTH_OR_MODEL",
        passed: true,
        createdDrafts: cases.size,
        paths: [
          "situations",
          "approval",
          "edit-conflict",
          "review-package",
          "coverage",
          "training-export",
          "report-import",
          "feedback-redaction",
          "backend-unavailable",
        ],
        pageErrors: errors,
        viewportWidths: [1440, 390],
      },
      null,
      2,
    ) + "\n",
  );
  console.log("Learning workshop browser acceptance passed.");
} finally {
  await browser.close();
}
