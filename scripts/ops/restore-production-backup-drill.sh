#!/usr/bin/env bash
set -euo pipefail
umask 077
# Called only after export-production-backup.sh verified Main/AWS/KMS boundaries.
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
: "${AWS_BACKUP_BUCKET:?}" "${AWS_BACKUP_KMS_KEY_ARN:?}" "${BACKYRD_RESTORE_REPORT:?}"
test "${GITHUB_REF:-}" = refs/heads/main || { echo 'Restore drill requires canonical Main.' >&2; exit 1; }
private_root="$(mktemp -d)"
trap 'rm -rf "$private_root"' EXIT
if test -n "${BACKYRD_RESTORE_SNAPSHOT_KEY:-}"; then
  printf '%s\n' "$BACKYRD_RESTORE_SNAPSHOT_KEY" > "$private_root/candidates"
else
  aws s3api list-objects-v2 --bucket "$AWS_BACKUP_BUCKET" --prefix backyrd-production/ --output json > "$private_root/inventory.json"
  jq -r '[.Contents[]? | select(.Key|endswith("/snapshot.tar.gz"))] | sort_by(.LastModified) | reverse | .[:20][] | .Key' "$private_root/inventory.json" > "$private_root/candidates"
fi
selected=false
while IFS= read -r key; do
  [[ "$key" =~ ^backyrd-production/[0-9]{4}/[0-9]{2}/[0-9]{2}/[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}/snapshot.tar.gz$ ]] || { echo 'Invalid immutable backup object key.' >&2; exit 1; }
  encryption="$(aws s3api head-object --bucket "$AWS_BACKUP_BUCKET" --key "$key" --query '[ServerSideEncryption,SSEKMSKeyId]' --output text)"
  test "$encryption" = $'aws:kms\t'"$AWS_BACKUP_KMS_KEY_ARN" || { echo 'Restore source encryption mismatch.' >&2; exit 1; }
  aws s3 cp "s3://$AWS_BACKUP_BUCKET/$key" "$private_root/snapshot.tar.gz" --only-show-errors
  aws s3 cp "s3://$AWS_BACKUP_BUCKET/${key%/*}/archive-sha256.txt" "$private_root/archive-sha256.txt" --only-show-errors
  grep -Eq '^[a-f0-9]{64}  snapshot.tar.gz$' "$private_root/archive-sha256.txt" || exit 1
  test "$(wc -l < "$private_root/archive-sha256.txt" | tr -d ' ')" = 1 || exit 1
  (cd "$private_root" && sha256sum --status --check archive-sha256.txt)
  mkdir "$private_root/unpacked"
  python3 - "$private_root/snapshot.tar.gz" "$private_root/unpacked" <<'PY'
import sys,tarfile,pathlib,shutil
root=pathlib.Path(sys.argv[2]).resolve();total=0;count=0
with tarfile.open(sys.argv[1],'r:gz') as archive:
 for member in archive:
  name=pathlib.PurePosixPath(member.name);count+=1;total+=member.size
  if name.is_absolute() or '..' in name.parts or '\\' in member.name or not name.parts or name.parts[0]!='snapshot' or count>100000 or total>3*1024**3:
   raise SystemExit('Unsafe backup archive structure.')
  target=root.joinpath(*name.parts)
  if member.isdir(): target.mkdir(parents=True,exist_ok=True)
  elif member.isfile():
   target.parent.mkdir(parents=True,exist_ok=True)
   with archive.extractfile(member) as source,target.open('xb') as dest: shutil.copyfileobj(source,dest)
   target.chmod(0o600)
  else: raise SystemExit('Links or special files are forbidden in a restore archive.')
PY
  if jq -e '.version=="backyrd-production-backup-v2" and .projectRef=="hjgcrrzfjchzqoegcywn" and .databaseIncluded==true' "$private_root/unpacked/snapshot/metadata.json" >/dev/null; then
    selected=true;break
  fi
  rm -rf "$private_root/unpacked"
done < "$private_root/candidates"
test "$selected" = true || { echo 'No complete v2 database/media backup found.' >&2; exit 1; }
export BACKYRD_RESTORE_ARCHIVE_SHA256="$(cut -d ' ' -f1 "$private_root/archive-sha256.txt")"
node "$repo_root/scripts/ops/restore-backup-drill.mjs" "$private_root/unpacked/snapshot" "$BACKYRD_RESTORE_REPORT"
