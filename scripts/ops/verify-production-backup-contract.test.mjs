import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("backup workflow is main-only, OIDC-authenticated and fail-closed", () => {
  const workflow = read(".github/workflows/production-backup.yml");
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /AWS_BACKUP_ROLE_ARN/);
  assert.match(workflow, /allowed-account-ids/);
  assert.match(workflow, /export-production-backup\.sh/);
  assert.doesNotMatch(workflow, /AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY/);
});

test("bucket contract binds privacy, KMS encryption and 30-day retention", () => {
  const template = read("infrastructure/aws/production-backup.yaml");
  for (const setting of ["BlockPublicAcls", "BlockPublicPolicy", "IgnorePublicAcls", "RestrictPublicBuckets"]) {
    assert.match(template, new RegExp(`${setting}: true`));
  }
  assert.match(template, /SSEAlgorithm: aws:kms/);
  assert.match(template, /EnableKeyRotation: true/);
  assert.match(template, /ExpirationInDays: 30/);
  assert.match(template, /Type: AWS::IAM::OIDCProvider/);
  assert.match(template, /Url: https:\/\/token\.actions\.githubusercontent\.com/);
  assert.match(template, /ClientIdList:\s*\n\s*- sts\.amazonaws\.com/);
  assert.match(template, /repo:\$\{Repository\}:ref:refs\/heads\/main/);
});

test("backup exporter verifies account, bucket and object contracts before success", () => {
  const script = read("scripts/ops/export-production-backup.sh");
  assert.match(script, /canonical main SHA mismatch/);
  assert.match(script, /dedicated backup account mismatch/);
  assert.match(script, /get-public-access-block/);
  assert.match(script, /get-bucket-encryption/);
  assert.match(script, /get-bucket-lifecycle-configuration/);
  assert.match(script, /supabase storage cp/);
  assert.match(script, /supabase db dump/);
  assert.match(script, /head-object/);
  assert.doesNotMatch(script, /AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY/);
});
