# Gate 3 Reference Location post-merge Production identity

PR #172 was merged by a normal merge commit into canonical `main` at `8001183fe3ff93f22bc7f644a84976768353d862`. The merge tree is byte-identical to reviewed PR head `24129617922fa0c476d2424bf63844cd2d4b0fd7`; the protected Decision/Admin implementation remains semantic source commit `f91dd269039bba0138a655d0f4050699ccb5f0f4`.

The normal Supabase `main` integration subsequently produced Decision Function version 122. This was an identity transition, not a semantic change:

- Production project: `hjgcrrzfjchzqoegcywn`
- Function: `decision-v13`
- active version: 122
- JWT verification: enabled
- EZBR SHA-256: `e7fc644676de3eadf719cc3368dd0e2662af62f3a923f8501080ec2938bdd41a`
- entrypoint: exactly `import "./live-index.ts";` plus one newline
- entrypoint SHA-256: `4a4af963c4c30821be7b0d2b021f3a232520c104acfd34079a6284daea9e8299`
- downloaded sources: 40
- canonical-main byte matches: 40/40
- missing or mismatching sources: 0

Production migration history contains `20260901164414_create_decision_location_admin_contract_v1.sql` as its current tip. The server contract remains `ACTIVE` for Basel at 800 m. The production Admin deployment from canonical main completed successfully.

This v13 re-certification is identity-only. The protected semantic source-set hash remains unchanged from v12. Mood, Offering/Purpose, Taste, Trust, N4, personalization, ranking, dynamic Place resolution, explicit-distance authority, the 100–2,000 m Admin bound, audit semantics, and fail-closed behavior are unchanged.
