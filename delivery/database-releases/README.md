# Database release evidence

`database-baseline.json` anchors the last independently verified current schema
and ACL. Each additive database change adds exactly one generated JSON record in
this directory. Run the disposable clean boot with
`BACKYRD_DATABASE_SNAPSHOT_OUTPUT=/tmp/backyrd-db.json`, stage the migration and
SQL tests, then run:

```sh
node scripts/ci/generate-database-release.mjs \
  --base-sha origin/main \
  --snapshot /tmp/backyrd-db.json \
  --id 20260909120000-short-purpose
```

The generator derives migration and test paths plus file hashes. CI independently
rebuilds the candidate, reruns behavior and authorization tests, recomputes both
fingerprints and verifies that the record extends the prior evidence. The JSON is
therefore a deterministic receipt, not a human approval or a self-authenticating
security verdict.
