# Phase-2 Synthetic Acceptance Matrix

Alle Tests verwenden ausschließlich `synthetic-*` Identitäten. Normative Suite: `packages/user-intelligence-vnext-core/test/*.test.mjs`.

| Acceptance-Fall | Nachweis |
|---|---|
| Cold User / No Consent / Withdrawal | leere, nicht personenbezogene Evidence States |
| Impression / Spot Open / Dwell | Exposure und Interaction neutral; Dwell `NOT_CONFIGURED` |
| Favorite Add/Remove | `STATE_CHANGE`; kein Satisfaction-/Dislike-Signal |
| Navigation ohne Visit | `INTENT`; explizite Limitation |
| Verified Visit | `EXPERIENCE`, Satisfaction `NOT_APPLICABLE` |
| Standard-/Smart-Review | gleiche Katalogsemantik; gleiches Product Review dedupliziert |
| Review ohne Satisfaction | leeres Satisfaction-Slot |
| positive/negative Satisfaction | nur explizites Satisfaction-Event setzt Direction |
| Retry / Offline / doppelte Review | Event-ID-, Idempotency- und Source-Record-Dedupe |
| verspätet / out of order | kanonische Sortierung und Replay-Parität |
| Correction / Supersedes | Ziel bleibt historisch, wird aktiv inaktiv; Authority-Hash |
| viele Interaktionen einer Journey | maximal eine unabhängige Experience Unit |
| Repeat Visits | nur getrennte servergelöste Journeys ergeben getrennte Units |
| ungelöste Journey | keine Independence |
| fremder User/Spot/Decision | Phase‑1-Authority plus Resolver/Correction/Binding fail-closed |
| Product-State-Manipulation | Phase‑1-Adapter- und Hash-Tests bleiben Teil derselben Suite |
| Event-time World | historische Hash-Bindung stabil; zukünftiger State abgewiesen |
| World Conflict/Unknown | im Binding erhalten, keine Attribution erzeugt |
| Context explizit/inferiert/fehlend | getrennte Source States; niemals Long-Term Taste |
| Social Observation | `NOT_CONFIGURED`, keine Cross-User- oder Taste-Propagation |
| Commercial Fields | strict Builder-Boundary lehnt Owner Tier, Payment und Advertising ab |
| Account Erasure / Full Reset | Chains, Pointer, Caches, Work Items und Subject Binding entfernt |
| Full/Incremental / deterministischer Replay | byte-identischer State und Hash |
| innere Manipulation | schlägt trotz neu berechnetem Chain-Hash gegen Ledger/Katalog fehl |

Nicht behauptet: Product-Qualität, Production-RLS-Ausführung, Taste-Genauigkeit, Gewichte, Attribution, Decay, Ranking oder Deployment.
