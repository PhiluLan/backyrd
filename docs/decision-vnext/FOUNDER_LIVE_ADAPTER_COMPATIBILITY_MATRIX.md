# Founder-Live Adapter Compatibility Matrix

| Grenze | Kanonische Quelle | Adapter-Verhalten | Status |
|---|---|---|---|
| Session/UUID | Supabase Auth + User UUID Authority | server-verifiziert, keine Client-Identity | implementiert, inaktiv |
| World | `WorldKnowledgeReaderPort` | privates Cohort-Manifest, hashgebundene Published Snapshots, read-only | implementiert, inaktiv |
| User | `DecisionVNextUserProjectionPort` | injizierte kanonische `RelevantUserProjection`, keine Raw Events oder Ersatzprojektion | NO-GO: Production-Port fehlt |
| Context | Founder-Live Request | Freitext + serverautorisierte Zielstadt | implementiert |
| Mobile v13 | `EXISTING_ENGINE` | unverändert | kompatibel |
| Mobile Founder Live | `FOUNDER_LIVE_READ_ONLY` | eigener Renderer, keine IDs oder Side Effects | implementiert, Binding aus |
| Continuation | v13 Decision ID | Cross-Engine fail-closed | implementiert |
| Product Ranking | keine Authority | `NOT_CONFIGURED` | unverändert |
| Durable Operations | autorisierte Idempotency-/Rate-Limit-Ports | keine prozesslokalen Stores | NO-GO: Ports fehlen |
| Production | keine Authority | permanenter PII-freier 503-Einstieg; keine Environment-Aktivierung | SOURCE_ONLY_NO_GO |
