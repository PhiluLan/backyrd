# Founder-Live Adapter Compatibility Matrix

| Grenze | Kanonische Quelle | Adapter-Verhalten | Status |
|---|---|---|---|
| Session/UUID | Supabase Auth + User UUID Authority | server-verifiziert, keine Client-Identity | implementiert, inaktiv |
| World | `WorldKnowledgeReaderPort` | privates Cohort-Manifest, hashgebundene Published Snapshots, read-only | implementiert, inaktiv |
| User | kanonische `createProductionRelevantUserProjectionPort`-Factory | read-only `RelevantUserProjection`, keine Raw Events oder Ersatzprojektion | integriert, Runtime Authority bleibt false |
| Context | Founder-Live Request | Freitext + serverautorisierte Zielstadt | implementiert |
| Mobile v13 | `EXISTING_ENGINE` | unverändert | kompatibel |
| Mobile Founder Live | `FOUNDER_LIVE_READ_ONLY` | eigener Renderer, keine IDs oder Side Effects | implementiert, Binding aus |
| Continuation | v13 Decision ID | Cross-Engine fail-closed | implementiert |
| Product Ranking | keine Authority | `NOT_CONFIGURED` | unverändert |
| Durable Idempotency | `FounderLiveDurableIdempotencyPort@1.0` aus PR #311 | atomar `CREATED | REPLAYED | CONFLICT`, purpose-/subject-/release-/artifact-/source-set-gebunden | integriert, kein Production-Apply |
| Rate Limit | `FounderLiveRateLimitPort@1.0` auf kanonischem Gate-7-RPC | eigener HMAC-Scope, atomare service-only Counter, keine prozesslokalen Stores, vor jedem Replay | integriert, Runtime Authority bleibt false |
| Production | keine Authority | keine Edge Function, keine Environment-Aktivierung | SOURCE_ONLY_NO_GO |
