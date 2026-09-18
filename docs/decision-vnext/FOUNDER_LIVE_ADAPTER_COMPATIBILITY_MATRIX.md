# Founder-Live Adapter Compatibility Matrix

| Grenze | Kanonische Quelle | Adapter-Verhalten | Status |
|---|---|---|---|
| Session/UUID | Supabase Auth + User UUID Authority | server-verifiziert, keine Client-Identity | implementiert, inaktiv |
| World | `WorldKnowledgeReaderPort` | privates Cohort-Manifest, hashgebundene Published Snapshots, read-only | implementiert, inaktiv |
| User | kanonische `createProductionRelevantUserProjectionPort`-Factory | read-only `RelevantUserProjection`, keine Raw Events oder Ersatzprojektion; `PRODUCTION_FOUNDER_READ_ONLY` ausschließlich nach prozesslokaler Capability-Prüfung | integriert, Checked-in Runtime Authority bleibt false |
| Context | Founder-Live Request | Freitext + serverautorisierte Zielstadt | implementiert |
| Mobile v13 | `EXISTING_ENGINE` | unverändert | kompatibel |
| Mobile Founder Live | `FOUNDER_LIVE_READ_ONLY` | eigener Renderer, keine IDs oder Side Effects | implementiert, Binding aus |
| Continuation | v13 Decision ID | Cross-Engine fail-closed | implementiert |
| Product Ranking | keine Authority | `NOT_CONFIGURED` | unverändert |
| Durable Idempotency | `FounderLiveDurableIdempotencyPort@1.0` aus PR #311 | atomar `CREATED | REPLAYED | CONFLICT`, purpose-/subject-/release-/artifact-/source-set-gebunden | integriert, kein Production-Apply |
| Rate Limit | `FounderLiveRateLimitPort@1.0` auf kanonischem Gate-7-RPC | eigener HMAC-Scope, atomare service-only Counter, keine prozesslokalen Stores, vor jedem Replay | integriert, Runtime Authority bleibt false |
| Edge Host | `decision-founder-live` mit `verify_jwt=true` | bedingte interne Bindung an kanonische Ports; gepinnter Trust Root und versiegeltes Provisioning fehlen, daher vor Body, Auth und allen Reads `RUNTIME_TRUST_ROOT_NOT_PROVISIONED` | implementiert, standardmäßig OFF; keine eingecheckte Ausführungs-Capability |
| Production | keine Runtime Authority | Source-aware Plan erkennt ausschließlich den neuen Edge Host; keine Environment-Aktivierung, kein Deployment | IMPLEMENTATION_READY_DEPLOYMENT_NOT_AUTHORIZED |

Der Edge Host akzeptiert keine Environment-Variable, keinen Header und keinen
Client-Payload als Runtime Authority. Der aktuelle Release kann deshalb selbst
nach einem versehentlichen Source-Deploy keine World-, User-, Rate-Limit-,
Idempotency- oder Evaluations-Ports aufrufen. Eine spätere Aktivierung benötigt
einen separat freigegebenen, extern gebundenen Runtime-Authority-Release.
