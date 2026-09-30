import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const fixture = () => {
  const directory = mkdtempSync(join(tmpdir(), "backyrd-auth-smtp-"));
  const config = { projectRef: "fixture-project", config: {
    site_url: "https://www.backyrd.ch",
    smtp_admin_email: "hello@backyrd.ch",
    smtp_host: "smtp.resend.com",
    smtp_port: "465",
    smtp_user: "resend",
    smtp_sender_name: "backyrd",
  } };
  const source = JSON.stringify(config);
  const configPath = join(directory, "supabase/production/auth-config.json");
  const planPath = join(directory, "plan.json");
  const auditPath = join(directory, "audit.json");
  const mockPath = join(directory, "mock-fetch.mjs");
  mkdirSync(join(directory, "supabase/production"), { recursive: true });
  writeFileSync(configPath, source);
  writeFileSync(planPath, JSON.stringify({
    projectRef: config.projectRef,
    canonicalMainSha: "a".repeat(40),
    planHash: "b".repeat(64),
    authConfig: { deploy: true, path: "supabase/production/auth-config.json", sha256: createHash("sha256").update(source).digest("hex") },
  }));
  writeFileSync(mockPath, `let current = {};
globalThis.fetch = async (_url, options) => {
  if (options.method === "PATCH") {
    current = JSON.parse(options.body);
    if (current.smtp_pass !== process.env.BACKYRD_RESEND_AUTH_SMTP_KEY) return { ok: false, status: 400 };
  }
  return { ok: true, json: async () => current };
};\n`);
  return { directory, configPath, planPath, auditPath, mockPath };
};

const run = (paths, smtpKey) => spawnSync(process.execPath, [
  "--import", paths.mockPath,
  new URL("./apply-supabase-auth-config.mjs", import.meta.url).pathname,
  "--plan", paths.planPath,
  "--audit", paths.auditPath,
], { cwd: paths.directory, encoding: "utf8", env: {
  ...process.env,
  SUPABASE_ACCESS_TOKEN: "fixture-token",
  ...(smtpKey ? { BACKYRD_RESEND_AUTH_SMTP_KEY: smtpKey } : { BACKYRD_RESEND_AUTH_SMTP_KEY: "" }),
} });

test("SMTP deployment fails closed without a Resend credential", () => {
  const result = run(fixture(), "");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /BACKYRD_RESEND_AUTH_SMTP_KEY required/);
});

test("SMTP credential is applied but never written to the audit", () => {
  const paths = fixture();
  const result = run(paths, "re_fixture_key");
  assert.equal(result.status, 0, result.stderr);
  const auditText = readFileSync(paths.auditPath, "utf8");
  const audit = JSON.parse(auditText);
  assert.equal(audit.smtpCredentialApplied, true);
  assert.equal(audit.verified.smtp_admin_email, "hello@backyrd.ch");
  assert.ok(!auditText.includes("re_fixture_key"));
  assert.ok(!auditText.includes("smtp_pass"));
  assert.ok(!result.stdout.includes("re_fixture_key"));
});

test("Production Auth emails keep the lowercase brand and styled recovery action", () => {
  const { config } = JSON.parse(readFileSync(new URL("../../supabase/production/auth-config.json", import.meta.url), "utf8"));
  assert.equal(config.smtp_admin_email, "hello@backyrd.ch");
  assert.equal(config.smtp_sender_name, "backyrd");
  for (const key of ["mailer_subjects_confirmation", "mailer_subjects_recovery"]) {
    assert.match(config[key], /backyrd/);
    assert.doesNotMatch(config[key], /Backyrd|BACKYRD/);
  }
  for (const key of ["mailer_templates_confirmation_content", "mailer_templates_recovery_content"]) {
    assert.match(config[key], /background:#050506/);
    assert.match(config[key], /background:#fa4189/);
    assert.match(config[key], />backyrd<\/span>/);
    assert.doesNotMatch(config[key], /Backyrd|BACKYRD/);
  }
  assert.match(config.mailer_templates_recovery_content, /href="{{ \.ConfirmationURL }}"/);
});
