# Lifecycle Manifest und Privacy Data Inventory

Phase 3A ergänzt Observation Records, Interpretation Records, User Model Snapshots, Latest Pointer, Incremental Reducer State, Projection Cache, Model Rebuild Material, Attribution Work Items und subject-gebundene Evaluation Fixtures. Alle sind personenbezogen und müssen bei Account Erasure tatsächlich gelöscht werden; nur strikt nicht-personenbezogene technische Manifeste dürfen bestehen bleiben. Retention-Zeiträume sind weiterhin nicht freigegeben.

`USER_INTELLIGENCE_LIFECYCLE_MANIFEST` ist das maschinenlesbare Gate für alle geplanten vNext-Stores. Ein fehlender Store oder ein unvollständiger Export-, Retention-, Purge-, Consent-, Erasure- oder Rebuild-Vertrag lässt die Validierung scheitern.

| Store | Klasse | Wahrheit | Export | Lifecycle |
|---|---|---|---|---|
| Canonical Memory Events | personal raw | Source of Truth | Beobachtungen | Product-Policy noch offen |
| Event Ledger | personal raw | Source of Truth | Beobachtungen | Product-Policy noch offen |
| Dedupe Records | personal derived | Derived | Metadaten | source-bound |
| Evidence Bindings | personal derived | Derived | Metadaten | source-bound |
| Rebuild Material | personal derived | Derived | Metadaten | source-bound |
| Evidence Chains | personal derived | Derived | userlesbar | source-bound |
| Taste Nodes | personal derived | Derived | userlesbar | source-bound |
| Practical Preferences | personal derived | Derived | userlesbar | source-bound |
| Direct Spot Affinities | personal derived | Derived | userlesbar | source-bound |
| Snapshots | personal derived | Derived | userlesbar | source-bound, spätere Kompaktierung nötig |
| Latest Pointer | personal pointer | Pointer | Metadaten | nur solange referenziert |
| Change Records | personal derived | Audit | userlesbar | source-bound |
| Projections | personal derived | Derived | Metadaten | ephemer |
| Work Items | personal derived | Work | Metadaten | ephemer |
| Caches | personal derived | Cache | Metadaten | ephemer |
| Transparency Views | personal derived | Derived | userlesbar | ephemer |
| Technical Audit Manifests | non-personal | Audit | nicht als Userdatenexport | dauerhaft nur ohne Userbezug |

Finale Aufbewahrungsfristen sind bewusst nicht definiert. Consent Withdrawal und Full Personalization Reset dürfen personenbezogene Derived-/Pointer-Zustände invalidieren, sofern ihre jeweils dokumentierte Purge-Wirkung erfüllt wird. Account Erasure ist strenger: `planLifecycleImpact` verlangt für jeden personenbezogenen Store `DELETE`, einschließlich Projections, Caches, Latest Pointer und Work Items. Ein `LifecycleCommand` darf für `ACCOUNT_ERASURE` nur `COMPLETED` sein, wenn `storeResults` die abgeschlossene Löschung jedes personenbezogenen Stores beweist. Eine bloße Invalidierung ist höchstens ein interner Zwischenschritt. Nur strukturell nicht-personenbezogene Contract-, Code- und Policy-Manifeste dürfen verbleiben.

Bei UNKNOWN, DENIED, WITHDRAWN, fehlendem Snapshot oder Kill Switch ist die Projection neutral: keine Taste-/Practical-/Direct-Spot-Nodes, keine Domain Sufficiency, keine Snapshot-ID/-Hash und keine profilabgeleiteten Suppression-Details. Die direkte User-ID wurde aus dem Projection-Payload entfernt. Die serverseitige Request-Authority bleibt intern über `subjectBindingHash` gebunden; Decision darf diese Bindung weder aus Clientdaten erzeugen noch als öffentliche Identität exponieren.

Raw Events, Reviewtexte, Rohstandorte, private Social-Daten und vollständige User Cards sind im Decision-Payload nicht repräsentierbar. Diese Foundation repariert den bestehenden Product Export noch nicht; sie definiert lediglich den vollständigen zukünftigen Vertrag.

Phase 2 ergänzt `EvidenceEngineState` und `applyEvidenceLifecycle`. Bei fehlendem Consent, Withdrawal, Reset oder Erasure werden Subject Binding, Ledger-Hashes, Chains, Latest Pointer, Caches und Work Items gemeinsam entfernt. `ACCOUNT_ERASURE` übernimmt zusätzlich das vollständige Phase‑1-Store-Manifest und verlangt `DELETE` für jeden personenbezogenen Store; `RETAIN_NON_PERSONAL` ist ausschließlich für das technische Manifest zulässig. Es gibt weiterhin keine Production-Speicherung oder Retention-Ausführung.

Kurzlebiger Command-Input und persistierbares Resultat sind getrennt. Unterdrückte oder gelöschte Build-/Lifecycle-Resultate besitzen `rebuildMaterial: null` sowie leere Event- und Dedupe-Arrays. Das Manifest führt Event Ledger, Dedupe Records, Evidence Bindings und Rebuild Material explizit als personenbezogene Stores; Account Erasure kann mit Restmaterial nicht `COMPLETED` verifiziert werden.
