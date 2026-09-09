# Authority und Trust Boundaries

## Client zu Server

`ClientObservationInput` besitzt weder `userId`, `journeyId`, kanonische Referenzen, `eventClass`, Retention, Authority, Hash noch Outcome-Typen. Er enthält nur das beobachtete Ziel, einen Client-Zeitpunkt und optional lokale Korrelation. `bindClientObservation` übernimmt User-ID, Journey, Session-/Decision-/Candidate-/Spot-Referenzen, Eventklasse, Source, Consent, Retention, Idempotency und kanonische Zeit aus `ServerBindingContext`. Client-Claims müssen exakt zur `SERVER_PRODUCT_TRUTH`-Bindung passen; zusätzliche oder abweichende Felder scheitern fail-closed.

Client Observations können nur Exposure, Spot Open und Navigation abbilden. `SAVED`, `SAVE_REMOVED` und `RESERVATION_INTENT` laufen ausschließlich über den getrennten `bindVerifiedProductState`-Adapter mit passender persistierter Source-Record-ID. `VERIFIED_VISIT` ist kein zulässiger Clienttyp und benötigt `VERIFIED_OUTCOME`-Authority. Das Package stellt keine Product Producer oder Endpunkte bereit.

`EVENT_REFERENCE_MATRIX` ist die zentrale deterministische Referenz- und Authority-Regel:

| Event | Erforderlich | Zusätzliche Authority |
|---|---|---|
| `CANDIDATE_EXPOSED` | Decision, Spot, Candidate, servergelöste Journey | Client Observation |
| `SPOT_OPENED` | Spot, servergelöste Journey | Client Observation/User Action |
| `SAVED`, `SAVE_REMOVED` | Spot, servergelöste Journey | server-verifizierter Product State |
| `NAVIGATION_INTENT` | Spot, servergelöste Journey | authentifizierte User Action |
| `RESERVATION_INTENT` | Spot, servergelöste Journey | server-verifizierter Product State |
| `VERIFIED_VISIT` | Spot, servergelöste Journey | Verified Outcome |
| `REVIEW_RECORDED` | Spot, Review-Ursprung, servergelöste Journey | server-verifizierter Product State |
| `SATISFACTION_RECORDED` | Experience-Ziel oder qualifizierte servergelöste Journey | authentifizierte User Action/Product State |
| `USER_CORRECTION` | identische `targetEventId` und `supersedesEventId` | Ziel-Ownership-/Zeit-Lookup ist Phase-2-Port |
| `ONBOARDING_DECLARATION` | keine Spot-/Decision-Referenz, keine Journey | authentifizierte User Action/Product State |

Irrelevante Referenzen werden abgelehnt. Referenzen, Journey-Bindung, Reference-Policy und Temporal-Bindung liegen im gehashten Eventkörper.

## Zeitautorität

`TemporalValidationPolicy` ist versioniert und vollständig injizierbar. Sie begrenzt Zukunfts-Skew, erlaubt oder verbietet Offline-/Delayed Events explizit, begrenzt deren Alter und listet dokumentierte Reihenfolge-Ausnahmen. Kanonische Occurrence-, Observation- und Ingestion-Zeit kommen aus der serverseitigen Bindung; die Client-Uhr kann nur unter der expliziten Offline-Policy als gemeldeter Zeitpunkt akzeptiert werden. Phase 1 definiert keine Product-Retention- oder Decay-Dauer.

## Consent

Der einzige Phase-1-Purpose ist `PERSONALIZED_RECOMMENDATIONS`. State, Consent-, Policy- und UX-Version sowie Capture Context sind explizit. Nur `GRANTED` zusammen mit `PERSONALIZATION_EVIDENCE` erlaubt späteres Lernen. UNKNOWN ist keine Zustimmung.

## Domain-Grenzen

- Exposure und fehlende Interaktion sind neutral.
- Save Removal ist eine Zustandsbeobachtung, kein Dislike.
- Navigation und Reservation sind Intent, kein Outcome.
- Visit und Review sind Experience mit `satisfaction: UNKNOWN`.
- Standard und Smart Review unterscheiden nur den Einstieg.
- Satisfaction benötigt ein eigenes ausdrückliches Event.
- Direct Spot und Practical Behavior können keine Concept Affinity setzen.
- Social-Details und Rohstandorte sind in Context/Projection strukturell ausgeschlossen.
- Commercial-, Owner-Tier-, Payment-, Sponsorship- und Advertising-Felder werden an der runtime-validierten Projection-Build-Boundary abgelehnt. Eine echte unabhängige Usererfahrung an einem kommerziellen Spot bleibt als Erfahrung zulässig; kommerzieller Status selbst besitzt keinen Signalpfad.

Admin-Lifecycle-Autorität ist modelliert, aber nicht produktiv implementiert. Service-Role-, RLS- und Grant-Grenzen bleiben unverändert und werden in Phase 1 nicht getestet oder geändert.
