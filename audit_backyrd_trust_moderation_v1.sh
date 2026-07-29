#!/usr/bin/env bash
set -u

ROOT="${HOME}/dev/backyrd"
OUT="${ROOT}/trust_moderation_v1_audit.txt"

if [ ! -d "$ROOT" ]; then
  echo "Backyrd-Repository nicht gefunden: $ROOT"
  exit 1
fi

cd "$ROOT" || exit 1

{
  echo "============================================================"
  echo "BACKYRD TRUST & MODERATION ENGINE V1 – LOCAL AUDIT"
  echo "Erstellt: $(date)"
  echo "Repository: $ROOT"
  echo "============================================================"
  echo

  echo "### GIT STATUS"
  git status --short 2>&1 || true
  echo

  echo "### AKTUELLER BRANCH / COMMIT"
  git branch --show-current 2>&1 || true
  git rev-parse HEAD 2>&1 || true
  echo

  echo "### RELEVANTE OWNER-, CLAIM-, MODERATION- UND MANAGE-DATEIEN"
  find . \
    \( -path './node_modules' \
       -o -path './.git' \
       -o -path './admin-dashboard/.next' \
       -o -path './mobile/.expo' \
       -o -path './dist' \
       -o -path './build' \) -prune \
    -o -type f \
    \( -iname '*owner*' \
       -o -iname '*claim*' \
       -o -iname '*moder*' \
       -o -iname '*trust*' \
       -o -iname '*manage*' \
       -o -iname '*audit*' \) \
    -print | sort
  echo

  echo "### VERWENDETE OWNER-/CLAIM-RPCS"
  grep -RInE \
    --exclude-dir=node_modules \
    --exclude-dir=.git \
    --exclude-dir=.next \
    --exclude-dir=.expo \
    --exclude='*.map' \
    'get_spot_owner_context|upsert_owner_description|upsert_spot_owner_fields|spot_claim|claim_queue|decide_spot_claim|approve_spot_claim|reject_spot_claim|revoke_spot_operator|set_spot_owner|clear_spot_owner' \
    . 2>/dev/null || true
  echo

  echo "### DIREKTE SCHREIBZUGRIFFE AUF SPOTS"
  grep -RInE \
    --exclude-dir=node_modules \
    --exclude-dir=.git \
    --exclude-dir=.next \
    --exclude-dir=.expo \
    --exclude='*.map' \
    '\.from\(["'\'']spots["'\'']\).*\.(update|upsert|insert)|from\(["'\'']spots["'\'']\)' \
    admin-dashboard mobile app src 2>/dev/null || true
  echo

  echo "### OWNER-RELEVANTE FELDER"
  grep -RInE \
    --exclude-dir=node_modules \
    --exclude-dir=.git \
    --exclude-dir=.next \
    --exclude-dir=.expo \
    --exclude='*.map' \
    'description|keywords|phone|website|business_email|header_photo|price_level|category_id|opening|spot_hours' \
    admin-dashboard mobile supabase 2>/dev/null || true
  echo

  echo "### BESTEHENDE VALIDIERUNG"
  grep -RInE \
    --exclude-dir=node_modules \
    --exclude-dir=.git \
    --exclude-dir=.next \
    --exclude-dir=.expo \
    --exclude='*.map' \
    'isValidEmail|normalizeEmail|phone.*valid|valid.*phone|website.*valid|valid.*website|E\.164|libphonenumber|validator|zod|moderation|profan|blocked|forbidden|toxic|abuse' \
    . 2>/dev/null || true
  echo

  echo "### SQL: TABELLEN, TRIGGER UND FUNKTIONEN"
  grep -RInE \
    --include='*.sql' \
    --exclude-dir=node_modules \
    --exclude-dir=.git \
    'create table|alter table|create or replace function|create trigger|spot_claims|owner_id|owner_description|moderation|audit|version|history' \
    supabase 2>/dev/null || true
  echo

  echo "### PACKAGE-ABHÄNGIGKEITEN FÜR VALIDIERUNG"
  find . \
    \( -path './node_modules' -o -path './.git' -o -path './.next' \) -prune \
    -o -name package.json -print | while read -r package; do
      echo "--- $package"
      grep -nE \
        '"(libphonenumber-js|validator|zod|yup|joi|bad-words|openai|@supabase/supabase-js)"' \
        "$package" 2>/dev/null || true
    done
  echo

  echo "### DATEIINHALT: MOBILE OWNER MANAGE"
  for file in \
    "mobile/app/spot/[id]/manage.tsx" \
    "app/spot/[id]/manage.tsx"
  do
    if [ -f "$file" ]; then
      echo
      echo "-------------------- $file --------------------"
      cat "$file"
    fi
  done
  echo

  echo "### DATEIINHALT: MÖGLICHE WEB-OWNER-EDITOREN"
  while IFS= read -r file; do
    echo
    echo "-------------------- $file --------------------"
    cat "$file"
  done < <(
    find admin-dashboard \
      -type f \( -name '*.tsx' -o -name '*.ts' \) \
      ! -path '*/node_modules/*' \
      ! -path '*/.next/*' \
      -print0 2>/dev/null |
    xargs -0 grep -IlE \
      'upsert_spot_owner_fields|upsert_owner_description|Spot verwalten|Owner Dashboard|owner.*save|save.*owner' \
      2>/dev/null | sort
  )
  echo

  echo "### DATEIINHALT: RELEVANTE SQL-MIGRATIONEN"
  while IFS= read -r file; do
    echo
    echo "-------------------- $file --------------------"
    cat "$file"
  done < <(
    find supabase \
      -type f -name '*.sql' \
      ! -path '*/node_modules/*' \
      -print0 2>/dev/null |
    xargs -0 grep -IlE \
      'upsert_spot_owner_fields|upsert_owner_description|get_spot_owner_context|spot_claims|decide_spot_claim|private_start_spot_claim' \
      2>/dev/null | sort
  )

  echo
  echo "============================================================"
  echo "AUDIT ENDE"
  echo "============================================================"
} > "$OUT"

echo
echo "✓ Audit erstellt:"
echo "$OUT"
echo
echo "Bitte diese Datei hier im Chat hochladen:"
echo "trust_moderation_v1_audit.txt"
