# Product Decision Learning Port

Status: **source-complete, nicht produktiv aktiviert**

Der Port `backyrd.user-intelligence.product-decision-learning-port@1.0` ist die
kanonische serverseitige Grenze zwischen Decision vNext und dem bestehenden
Product→N2→User-Intelligence-Pfad. Er ersetzt keine Evidence- oder
Lifecycle-Wahrheit und besitzt weder Ranking- noch Eligibility-Autorität.

## Ereignisse

- `decision_requested`
- `candidate_impression`
- `candidate_opened`
- `candidate_saved`
- `alternative_requested`
- `candidate_rejected`
- `explicit_feedback`
- `outcome_confirmed` (nur nach expliziter Nutzeraktion und verifiziertem Outcome)
- `event_correction`

Der Transport darf keine User-ID, Signalstärke, Policy, Independence,
Roh-Evidence, Such-/Review-Freitexte oder kommerziellen Felder liefern. User,
Subject, Session, Decision, Journey, Candidate, Spot, Context, Eventzeit,
Purpose, Consent und Authority werden serverseitig gebunden. Ein externer
Trust Anchor muss jeden Authority Record akzeptieren; Eigenhashes genügen
nicht.

## Consent und Lifecycle

Ohne `PERSONALIZATION_EVIDENCE`-Consent bleibt Decision nutzbar. Der Write-Port
liefert `SUPPRESSED_NO_CONSENT`, führt weder Authority-Auflösung noch
Persistenz aus und verlangt eine neutrale `RelevantUserProjection`.
Withdrawal, Full Reset und Account Erasure liefern entsprechend
`SUPPRESSED_LIFECYCLE`. Die physische Löschung bleibt im kanonischen
Lifecycle-/Erasure-Pfad; dieser Port baut keinen zweiten Store.

## Integration

Der Integrations-Track muss genau folgende bestehende Product-Schreibpfade auf
den Port umstellen, ohne Doppelerfassung:

1. Decision-Ausführung → `decision_requested`;
2. serverbestätigte Sichtbarkeit → `candidate_impression`;
3. Spot-Öffnung → `candidate_opened`;
4. erfolgreicher Save-State → `candidate_saved`;
5. Alternativen → `alternative_requested` (neutral);
6. situatives Ablehnen → `candidate_rejected`;
7. explizite Drei-Werte-Antwort → `explicit_feedback`;
8. explizit bestätigtes Outcome → `outcome_confirmed`;
9. Korrektur → `event_correction`.

Persistenz wird über `ProductDecisionLearningRepository` an den bestehenden
kanonischen Outbox-/Memory-Ledger-Pfad gebunden. Dieser User-Slice benötigt
keine neue Tabelle und keine neue Migration. Rate Limit und Idempotency sind
Pflichtports und fail-closed.

`createProductRelevantUserProjectionPort` verwendet weiterhin ausschließlich
den kanonischen `RelevantUserProjection`-Contract. Er besitzt keine
Founder-UUID-Allowlist. Authentifizierte Konten ohne Consent oder mit
unterdrücktem Lifecycle erhalten eine deterministische, nicht
personenbezogene neutrale Projection ohne persönlichen Read.

## Aktivierungsgrenze

`PRODUCT_DECISION_LEARNING_RELEASE` bleibt:

- `productionAuthorized:false`
- `runtimeActivated:false`
- `rankingAuthorized:false`
- `eligibilityAuthorized:false`
- `clientWriteAuthorized:false`

Die Product-Runtime-Konstruktion scheitert deshalb bis zu einem separaten,
versionierten und extern autorisierten Release fail-closed.
