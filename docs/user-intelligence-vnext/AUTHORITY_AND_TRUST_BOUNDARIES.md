# Authority und Trust Boundaries

## Client zu Server

`ClientObservationInput` besitzt weder `userId`, `eventClass`, Retention, Authority, Hash noch Outcome-Typen. `bindClientObservation` übernimmt die authentifizierte User-ID, Eventklasse, Source, Consent, Retention und Idempotency aus dem Serverkontext. Zusätzliche Clientfelder werden abgelehnt.

Client Observations können nur Exposure und die explizit gelisteten Product-Aktionen abbilden. `VERIFIED_VISIT` ist kein zulässiger Clienttyp und benötigt `VERIFIED_OUTCOME`-Authority. Das Package stellt keine Product-Endpunkte bereit.

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
- Commercial-, Owner-Tier-, Payment- und Advertising-Felder sind in den strict Contracts nicht zugelassen.

Admin-Lifecycle-Autorität ist modelliert, aber nicht produktiv implementiert. Service-Role-, RLS- und Grant-Grenzen bleiben unverändert und werden in Phase 1 nicht getestet oder geändert.
