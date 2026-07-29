#!/usr/bin/env bash
set -u

ROOT="${HOME}/dev/backyrd"
OUT="${ROOT}/trust_moderation_v1_audit_compact.txt"

if [ ! -d "$ROOT" ]; then
  echo "Backyrd-Repository nicht gefunden: $ROOT"
  exit 1
fi

cd "$ROOT" || exit 1

MAX_LINES=260

print_file_excerpt() {
  local file="$1"

  if [ -f "$file" ]; then
    echo
    echo "-------------------- $file --------------------"
    sed -n "1,${MAX_LINES}p" "$file"
    local total
    total=$(wc -l < "$file" | tr -d ' ')
    if [ "$total" -gt "$MAX_LINES" ]; then
      echo
      echo "[gekürzt: $total Zeilen insgesamt]"
    fi
  fi
}

{
  echo "============================================================"
  echo "BACKYRD TRUST & MODERATION ENGINE V1 – KOMPAKT-AUDIT"
  echo "Erstellt: $(date)"
  echo "Repository: $ROOT"
  echo "============================================================"
  echo

  echo "### GIT"
  echo "Branch: $(git branch --show-current 2>/dev/null || true)"
  echo "Commit: $(git rev-parse HEAD 2>/dev/null || true)"
  echo
  git status --short 2>/dev/null | head -n 120 || true
  echo

  echo "### RELEVANTE DATEIEN"
  find \
    admin-dashboard mobile supabase \
    -type f \
    \( -name '*.tsx' -o -name '*.ts' -o -name '*.sql' \) \
    ! -path '*/node_modules/*' \
    ! -path '*/.next/*' \
    ! -path '*/.expo/*' \
    ! -path '*/dist/*' \
    ! -path '*/build/*' \
    ! -path '*/coverage/*' \
    ! -path '*/.turbo/*' \
    -size -2M \
    2>/dev/null |
  grep -Ei \
    'owner|claim|manage|moder|trust|audit|spot.*edit|edit.*spot' |
  sort |
  head -n 200
  echo

  echo "### OWNER-/CLAIM-RPC-TREFFER"
  grep -RInE \
    --include='*.ts' \
    --include='*.tsx' \
    --include='*.sql' \
    --exclude-dir=node_modules \
    --exclude-dir=.git \
    --exclude-dir=.next \
    --exclude-dir=.expo \
    --exclude-dir=dist \
    --exclude-dir=build \
    --exclude-dir=coverage \
    --exclude-dir=.turbo \
    --exclude='*.map' \
    'get_spot_owner_context|upsert_owner_description|upsert_spot_owner_fields|spot_claims|claim_queue|decide_spot_claim|approve_spot_claim|reject_spot_claim|revoke_spot_operator|set_spot_owner|clear_spot_owner' \
    admin-dashboard mobile supabase 2>/dev/null |
  head -n 500 || true
  echo

  echo "### DIREKTE SPOT-SCHREIBZUGRIFFE"
  grep -RInE \
    --include='*.ts' \
    --include='*.tsx' \
    --exclude-dir=node_modules \
    --exclude-dir=.git \
    --exclude-dir=.next \
    --exclude-dir=.expo \
    --exclude-dir=dist \
    --exclude-dir=build \
    --exclude='*.map' \
    '\.from\(["'\'']spots["'\'']\)|upsert_spot_owner_fields|upsert_owner_description' \
    admin-dashboard mobile 2>/dev/null |
  head -n 400 || true
  echo

  echo "### BESTEHENDE VALIDIERUNG / MODERATION"
  grep -RInE \
    --include='*.ts' \
    --include='*.tsx' \
    --include='*.sql' \
    --exclude-dir=node_modules \
    --exclude-dir=.git \
    --exclude-dir=.next \
    --exclude-dir=.expo \
    --exclude-dir=dist \
    --exclude-dir=build \
    --exclude='*.map' \
    'isValidEmail|normalizeEmail|libphonenumber|E\.164|validator|zod|valid.*phone|phone.*valid|valid.*website|website.*valid|moderation|profan|toxic|abuse|forbidden|blocked|audit|history|version' \
    admin-dashboard mobile supabase 2>/dev/null |
  head -n 500 || true
  echo

  echo "### MOBILE OWNER MANAGE"
  print_file_excerpt "mobile/app/spot/[id]/manage.tsx"
  print_file_excerpt "app/spot/[id]/manage.tsx"

  echo
  echo "### MOBILE CLAIM"
  print_file_excerpt "mobile/app/spot/[id]/claim.tsx"
  print_file_excerpt "app/spot/[id]/claim.tsx"

  echo
  echo "### WEB OWNER-EDITOR-KANDIDATEN"
  while IFS= read -r file; do
    print_file_excerpt "$file"
  done < <(
    grep -RIlE \
      --include='*.tsx' \
      --include='*.ts' \
      --exclude-dir=node_modules \
      --exclude-dir=.next \
      --exclude-dir=.git \
      --exclude-dir=dist \
      --exclude-dir=build \
      'upsert_spot_owner_fields|upsert_owner_description|Spot verwalten|Owner Dashboard' \
      admin-dashboard 2>/dev/null |
    head -n 12
  )

  echo
  echo "### RELEVANTE SQL-DATEIEN"
  while IFS= read -r file; do
    print_file_excerpt "$file"
  done < <(
    grep -RIlE \
      --include='*.sql' \
      --exclude-dir=node_modules \
      --exclude-dir=.git \
      'upsert_spot_owner_fields|upsert_owner_description|get_spot_owner_context|spot_claims|decide_spot_claim|private_start_spot_claim' \
      supabase 2>/dev/null |
    head -n 16
  )

  echo
  echo "### PACKAGE-ABHÄNGIGKEITEN"
  for package in \
    package.json \
    mobile/package.json \
    admin-dashboard/package.json
  do
    if [ -f "$package" ]; then
      echo "--- $package"
      grep -nE \
        '"(libphonenumber-js|validator|zod|yup|joi|bad-words|openai|@supabase/supabase-js)"' \
        "$package" 2>/dev/null || true
    fi
  done

  echo
  echo "============================================================"
  echo "AUDIT ENDE"
  echo "============================================================"
} > "$OUT"

SIZE=$(du -h "$OUT" | awk '{print $1}')

echo
echo "✓ Kompakt-Audit erstellt:"
echo "$OUT"
echo "Grösse: $SIZE"
echo
echo "Bitte diese Datei hier hochladen:"
echo "trust_moderation_v1_audit_compact.txt"
