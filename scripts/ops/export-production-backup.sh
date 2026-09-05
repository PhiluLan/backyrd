#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

required=(
  AWS_BACKUP_ACCOUNT_ID
  AWS_BACKUP_BUCKET
  AWS_BACKUP_KMS_KEY_ARN
  AWS_BACKUP_REGION
  GITHUB_SHA
  SUPABASE_ACCESS_TOKEN
)
for name in "${required[@]}"; do
  test -n "${!name:-}" || { echo "required backup configuration missing: $name" >&2; exit 1; }
done
test "$GITHUB_REF" = "refs/heads/main" || { echo "canonical main is required" >&2; exit 1; }
test "$GITHUB_SHA" = "$(git rev-parse HEAD)" || { echo "canonical main SHA mismatch" >&2; exit 1; }

actual_account="$(aws sts get-caller-identity --query Account --output text)"
test "$actual_account" = "$AWS_BACKUP_ACCOUNT_ID" || { echo "dedicated backup account mismatch" >&2; exit 1; }

public_block="$(aws s3api get-public-access-block --bucket "$AWS_BACKUP_BUCKET" --query 'PublicAccessBlockConfiguration.[BlockPublicAcls,IgnorePublicAcls,BlockPublicPolicy,RestrictPublicBuckets]' --output text)"
test "$public_block" = $'True\tTrue\tTrue\tTrue' || { echo "S3 public-access block is incomplete" >&2; exit 1; }
test "$(aws s3api get-bucket-versioning --bucket "$AWS_BACKUP_BUCKET" --query Status --output text)" = "Enabled" || { echo "S3 versioning is not enabled" >&2; exit 1; }
encryption="$(aws s3api get-bucket-encryption --bucket "$AWS_BACKUP_BUCKET" --query 'ServerSideEncryptionConfiguration.Rules[0].ApplyServerSideEncryptionByDefault.[SSEAlgorithm,KMSMasterKeyID]' --output text)"
test "$encryption" = $'aws:kms\t'"$AWS_BACKUP_KMS_KEY_ARN" || { echo "S3 KMS encryption contract mismatch" >&2; exit 1; }
expiration="$(aws s3api get-bucket-lifecycle-configuration --bucket "$AWS_BACKUP_BUCKET" --query 'Rules[?Status==`Enabled`].Expiration.Days' --output text)"
test "$expiration" = "30" || { echo "S3 30-day retention contract mismatch" >&2; exit 1; }

umask 077
snapshot_root="$(mktemp -d)"
trap 'rm -rf "$snapshot_root"' EXIT
snapshot="$snapshot_root/snapshot"
mkdir -p "$snapshot/storage"

supabase link --project-ref hjgcrrzfjchzqoegcywn >/dev/null
mapfile -t buckets < <(supabase storage ls ss:/// --linked --experimental | sed -nE 's#^([A-Za-z0-9._-]+)/$#\1#p')
test "${#buckets[@]}" -gt 0 || { echo "Production Storage bucket inventory is empty or unreadable" >&2; exit 1; }
for bucket in "${buckets[@]}"; do
  mkdir -p "$snapshot/storage/$bucket"
  supabase storage cp --linked --experimental --recursive "ss:///$bucket" "$snapshot/storage/$bucket" >/dev/null
done

(
  cd "$snapshot"
  find storage -type f -print0 | sort -z | xargs -0 sha256sum > storage-sha256.txt
)
storage_files="$(find "$snapshot/storage" -type f | wc -l | tr -d ' ')"
storage_bytes="$(du -sb "$snapshot/storage" | cut -f1)"

backup_mode="${BACKUP_MODE:-daily}"
include_database=false
if test "$backup_mode" = "weekly" || test "$(date -u +%u)" = "7"; then
  include_database=true
  mkdir -p "$snapshot/database"
  supabase db dump --linked --role-only --file "$snapshot/database/roles.sql" --agent=no >/dev/null
  supabase db dump --linked --schema public --file "$snapshot/database/schema.sql" --agent=no >/dev/null
  supabase db dump --linked --data-only --use-copy --schema public,auth,storage --file "$snapshot/database/data.sql" --agent=no >/dev/null
  (
    cd "$snapshot"
    find database -type f -print0 | sort -z | xargs -0 sha256sum > database-sha256.txt
  )
fi

created_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
snapshot_id="$(date -u +%Y%m%dT%H%M%SZ)-${GITHUB_SHA:0:12}"
jq -n \
  --arg version "backyrd-production-backup-v1" \
  --arg createdAt "$created_at" \
  --arg canonicalMainSha "$GITHUB_SHA" \
  --arg projectRef "hjgcrrzfjchzqoegcywn" \
  --arg supabaseCliVersion "$(supabase --version)" \
  --argjson storageFiles "$storage_files" \
  --argjson storageBytes "$storage_bytes" \
  --argjson databaseIncluded "$include_database" \
  '{version:$version,createdAt:$createdAt,canonicalMainSha:$canonicalMainSha,projectRef:$projectRef,supabaseCliVersion:$supabaseCliVersion,storageFiles:$storageFiles,storageBytes:$storageBytes,databaseIncluded:$databaseIncluded}' \
  > "$snapshot/metadata.json"

archive="$snapshot_root/$snapshot_id.tar.gz"
tar -C "$snapshot_root" -czf "$archive" snapshot
archive_sha="$(sha256sum "$archive" | cut -d ' ' -f1)"
prefix="backyrd-production/$(date -u +%Y/%m/%d)/$snapshot_id"
aws s3 cp "$archive" "s3://$AWS_BACKUP_BUCKET/$prefix/snapshot.tar.gz" \
  --only-show-errors \
  --sse aws:kms \
  --sse-kms-key-id "$AWS_BACKUP_KMS_KEY_ARN"
printf '%s  snapshot.tar.gz\n' "$archive_sha" > "$snapshot_root/archive-sha256.txt"
aws s3 cp "$snapshot_root/archive-sha256.txt" "s3://$AWS_BACKUP_BUCKET/$prefix/archive-sha256.txt" \
  --only-show-errors \
  --sse aws:kms \
  --sse-kms-key-id "$AWS_BACKUP_KMS_KEY_ARN"

stored_encryption="$(aws s3api head-object --bucket "$AWS_BACKUP_BUCKET" --key "$prefix/snapshot.tar.gz" --query '[ServerSideEncryption,SSEKMSKeyId]' --output text)"
test "$stored_encryption" = $'aws:kms\t'"$AWS_BACKUP_KMS_KEY_ARN" || { echo "uploaded backup encryption mismatch" >&2; exit 1; }

echo "Production backup completed: mode=$backup_mode storage_files=$storage_files database=$include_database canonical_main=$GITHUB_SHA"
