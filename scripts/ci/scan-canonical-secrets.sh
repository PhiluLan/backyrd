#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
targets=(
  "$repo_root/supabase/migrations"
  "$repo_root/supabase/canonical"
)

patterns=(
  'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}'
  '(?i)(postgres|postgresql)://[^[:space:]]+:[^[:space:]@]+@'
  '(sk_live_[A-Za-z0-9]{16,}|sk-[A-Za-z0-9_-]{20,}|sb_secret_[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,})'
  '-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----'
  "(?i)(service[_-]?role|webhook[_-]?secret|database[_-]?password|api[_-]?key)[A-Za-z0-9_ -]*(=|:)[[:space:]]*['\"][A-Za-z0-9_./+=-]{16,}['\"]"
)

for pattern in "${patterns[@]}"; do
  matches=()
  while IFS= read -r match; do
    matches+=("$match")
  done < <(rg --pcre2 -l -- "$pattern" "${targets[@]}" || true)
  if test "${#matches[@]}" -gt 0; then
    printf 'Potential secret material detected in canonical SQL:\n' >&2
    printf '  %s\n' "${matches[@]#$repo_root/}" >&2
    exit 1
  fi
done

printf 'Canonical SQL secret scan passed.\n'
