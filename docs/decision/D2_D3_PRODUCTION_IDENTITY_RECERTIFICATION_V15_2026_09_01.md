# Decision v13 Production identity re-certification v15

Gate 4 changes Account/Auth behavior only. The Decision engine, its 43-file protected semantic source set, ranking, Mood, Offering/Purpose, N3/N4/N5/N6, and factual Reason authority are byte-identical to v14.

The certification evidence set changed because the canonical-main Supabase deployment controller now handles one additional, explicit Production Auth configuration scope. The controller still computes Edge Function source sets transitively and fail-closed; no Decision source changed and the planner proves that this Auth-only change schedules no Decision deployment.

Production Decision remains active version 123 with bundle SHA-256 `edbccf870a30c850cde97c59444b9a2f8d6e9d212dda257a86adb1fbf4fc088a`, `verify_jwt=true`, the same 40/40 byte-matched deployed source modules, and the exact entrypoint `import "./live-index.ts";` (SHA-256 `4a4af963c4c30821be7b0d2b021f3a232520c104acfd34079a6284daea9e8299`).

This is a complete operational evidence re-certification, not a Decision-semantic change and not a guard exception. D2.1, D2.2 and D3.1 are regenerated through their existing validators; their negative mutations continue to block Engine drift, an additional semantic source, Production identity drift and incomplete re-certification.
