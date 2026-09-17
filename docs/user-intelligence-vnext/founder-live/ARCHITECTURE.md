# Authority-, Consent-, Session- und Lifecycle-Modell

## Authority

`FounderLiveSubjectAuthority` bindet pseudonymes Subject, servergebundenen User, Subject-Hash, Session-Hash, Consent-Hash, Purpose, Environment, Lifecycle, Release und Slot. Ein externer Trust Context muss Release, Trust Anchor, leeren Founder-Slot und Authority Record unabhängig liefern.

Der aktuelle Contract akzeptiert ausschließlich synthetische lokale Mappings. Die später vorgesehenen Quellen `SERVER_AUTH_APP_METADATA` und `CANONICAL_SERVER_SUBJECT_MAPPING` stehen nur im leeren Slot-Manifest. Ihre Aktivierung benötigt eine neue explizite Release-Version. `user_metadata` aus dem Client bleibt ausdrücklich wirkungslos.

## Verarbeitung

1. Unbekannte Runtime-Konfiguration wird `OFF`.
2. Request Kill Switch, Lifecycle und Consent greifen vor Authority- oder Event-Verarbeitung.
3. Invocation, Request, Consent, Session, Purpose, Environment und Release werden hashgebunden geprüft.
4. Nur der synthetische Testpfad darf die vorhandene lokale Dark-Projection-Engine verwenden.
5. Output ist entweder eine minimierte `RelevantUserProjection` oder ein nicht personenbezogener stabiler Fehlerzustand.

## Stabile Degradation

- `RUNTIME_OFF`
- `NO_CONSENT`
- `LIFECYCLE_BLOCKED`
- `SESSION_CHANGED`
- `PROJECTION_NOT_AVAILABLE`
- `KILL_SWITCH`
- `AUTHORITY_DENIED`

Diese Antworten enthalten weder User-/Subject-/Session-IDs noch interne Authority-Details.

## Vorbereitete, deaktivierte Pipeline

`mobile event → consent/purpose gate → append-only evidence → dedupe/corrections → full/incremental projection → RelevantUserProjection → Decision`

Alle Adapter für Mobile Events, Persistenz und Writeback bleiben unregistriert. Decision darf ausschließlich den letzten minimierten Port konsumieren und niemals Raw Events.

## Privacy/Legal

Privacy Export verwendet eine eigene `PRIVACY_LEGAL_PROCESS`-Authority. Mobile, Decision und Founder Projection können diesen Pfad nicht aufrufen. Withdrawal, Full Reset und Account Erasure verhindern jede Projection; Account Erasure unterliegt weiterhin den kanonischen tatsächlichen DELETE-Nachweisen.
