#!/usr/bin/env bash
set -euo pipefail
umask 077
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
snapshot_output="${1:?Pass a new private database snapshot directory}"
supabase_cli="${BACKYRD_BACKUP_SUPABASE_CLI:-supabase}"
test "$("$supabase_cli" --version)" = 2.116.0 || { echo 'Backup requires the workflow-pinned Supabase CLI 2.116.0.' >&2; exit 1; }
target="${BACKYRD_BACKUP_DATABASE_TARGET:?Explicit linked or local backup target is required}"
case "$target" in
 linked) database_args=(--linked) ;;
 local)
  test "${BACKYRD_BACKUP_EPHEMERAL:-}" = 1 || { echo 'Local backup requires an explicit disposable fixture.' >&2; exit 1; }
  : "${BACKYRD_BACKUP_LOCAL_WORKDIR:?Local fixture workdir is required}"
  test -f "$BACKYRD_BACKUP_LOCAL_WORKDIR/supabase/config.toml"
  if rg -q 'hjgcrrzfjchzqoegcywn' "$BACKYRD_BACKUP_LOCAL_WORKDIR/supabase/config.toml" "$BACKYRD_BACKUP_LOCAL_WORKDIR/supabase/.temp" 2>/dev/null; then
   echo 'Production reference is forbidden in a local backup fixture.' >&2; exit 1
  fi
  database_args=(--local --workdir "$BACKYRD_BACKUP_LOCAL_WORKDIR") ;;
 *) echo 'Unknown database snapshot target.' >&2; exit 1 ;;
esac
mkdir "$snapshot_output"
# No schema allowlist: CLI defaults include every non-platform application schema,
# including current and future private schemas. Data defaults also retain Auth and
# Storage metadata. The platform-excluded migration ledger is exported separately.
"$supabase_cli" db dump "${database_args[@]}" --role-only --file "$snapshot_output/roles.sql" --agent=no >/dev/null
"$supabase_cli" db dump "${database_args[@]}" --file "$snapshot_output/schema.sql" --agent=no >/dev/null
"$supabase_cli" db dump "${database_args[@]}" --data-only --use-copy --file "$snapshot_output/data.sql" --agent=no >/dev/null
"$supabase_cli" db dump "${database_args[@]}" --schema supabase_migrations --file "$snapshot_output/migration-schema.sql" --agent=no >/dev/null
"$supabase_cli" db dump "${database_args[@]}" --data-only --use-copy --schema supabase_migrations --file "$snapshot_output/migration-data.sql" --agent=no >/dev/null
"$supabase_cli" db query "${database_args[@]}" --file "$repo_root/scripts/ops/backup-managed-controls.sql" --output json --agent=no > "$snapshot_output/managed-controls.json"
jq -e '.[0].managed_backup.version=="backyrd-managed-recovery-controls-v1" and .[0].managed_backup.safeStorageRls==true and .[0].managed_backup.ruleCount>0' "$snapshot_output/managed-controls.json" >/dev/null
jq -er '.[0].managed_backup.sql' "$snapshot_output/managed-controls.json" > "$snapshot_output/managed-controls.sql"
for part in roles schema data migration-schema migration-data; do
 test -s "$snapshot_output/$part.sql" || { echo "Database snapshot part is empty: $part" >&2; exit 1; }
done
rg -q 'booking_private' "$snapshot_output/schema.sql" || { echo 'Private Booking schema is missing from backup.' >&2; exit 1; }
rg -q 'booking_private' "$snapshot_output/data.sql" || { echo 'Private Booking data sections are missing from backup.' >&2; exit 1; }
rg -q 'schema_migrations' "$snapshot_output/migration-data.sql" || { echo 'Migration history is missing from backup.' >&2; exit 1; }
mkdir "$snapshot_output/canonical"
for control in auth_hooks storage realtime cron webhooks; do cp "$repo_root/supabase/canonical/$control.sql" "$snapshot_output/canonical/$control.sql"; done
jq -n '{version:"backyrd-database-snapshot-v2",scope:"all-non-platform-application-schemas",managedData:["auth","storage"],migrationLedger:"separate",managedControls:{captured:"managed-controls.sql",canonicalReferenceOnly:["auth_hooks","storage","realtime","cron","webhooks"]},files:["roles.sql","schema.sql","data.sql","migration-schema.sql","migration-data.sql"]}' > "$snapshot_output/scope.json"
(
 cd "$snapshot_output"
 sha256sum roles.sql schema.sql data.sql migration-schema.sql migration-data.sql scope.json managed-controls.json managed-controls.sql canonical/auth_hooks.sql canonical/storage.sql canonical/realtime.sql canonical/cron.sql canonical/webhooks.sql > files-sha256.txt
)
find "$snapshot_output" -type f -exec chmod 600 {} +
