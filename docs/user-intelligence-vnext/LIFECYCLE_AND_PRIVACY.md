# Lifecycle Manifest und Privacy Data Inventory

`USER_INTELLIGENCE_LIFECYCLE_MANIFEST` ist das maschinenlesbare Gate für alle geplanten vNext-Stores. Ein fehlender Store oder ein unvollständiger Export-, Retention-, Purge-, Consent-, Erasure- oder Rebuild-Vertrag lässt die Validierung scheitern.

| Store | Klasse | Wahrheit | Export | Lifecycle |
|---|---|---|---|---|
| Canonical Memory Events | personal raw | Source of Truth | Beobachtungen | Product-Policy noch offen |
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

Finale Aufbewahrungsfristen sind bewusst nicht definiert. `planLifecycleImpact` beweist synthetisch, dass Consent Withdrawal, Full Reset und Account Erasure jeden personenbezogenen Store löschen oder invalidieren; nur nicht-personenbezogene Contract-/Code-/Policy-Identitäten dürfen verbleiben.

Raw Events, Reviewtexte, Rohstandorte, private Social-Daten und vollständige User Cards sind im Decision-Payload nicht repräsentierbar. Diese Foundation repariert den bestehenden Product Export noch nicht; sie definiert lediglich den vollständigen zukünftigen Vertrag.
