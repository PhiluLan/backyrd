# D2/D3 Mood Production identity re-certification

Status: PASS — production identity only; no Decision semantic change.

The Founder/CTO-authorized Canonical Mood V1 Decision delta was merged through PR #162 and the Consumer Web SSR release correction through PR #165. Canonical main `1b491e1eaa8c3a6da8a6b7c040bfaf31ae994253` is the audited Production source.

Production Supabase project `hjgcrrzfjchzqoegcywn` serves `decision-v13` version 110 with JWT verification enabled and EZBR SHA-256 `5bf3dc86c778a4c6d10de5c21165505e2d5d8b4d41dcb0adb5d8829ff0902c7c`.

The active bundle was downloaded read-only through the Supabase CLI. Excluding two CLI metadata files, it contains 39 deployed source files. All 39 paths exist in canonical main and are byte-identical; missing files: 0; byte mismatches: 0. The deployment entrypoint remains `import "./live-index.ts";` plus one newline with SHA-256 `4a4af963c4c30821be7b0d2b021f3a232520c104acfd34079a6284daea9e8299`.

The protected Engine source remains `1fe82c39ad164fa811c2673cd46d8f451d7628c7ddabd1d8c595afd18a54c14f`. This re-certification changes only the bound Production function version and bundle identity from the pre-deployment v6 evidence. It does not change general ranking, N3/N4/N5/N6, Taste, Gold, eligibility, or the authorized bounded Mood signal.

Required acceptance after this identity update:

- D2.1 freeze validation PASS
- D2.2 parent re-certification PASS
- D3.1 preflight PASS with Production access NONE
- full Decision Lab PASS
- D2 scope guard remains fail-closed
- JWT verification remains enabled
