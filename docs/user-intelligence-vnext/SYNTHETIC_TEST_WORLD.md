# Synthetische Testwelt

Alle Fixtures sind erfunden, deterministisch und enthalten keine Production- oder personenbezogenen Daten.

Abgedeckt sind:

- Cold User und No Consent;
- Exposure only und Open only;
- Save/Remove und Navigation;
- Verified Visit ohne Satisfaction;
- Standard/Smart Review mit identischer Semantik;
- positive und negative Evidence in derselben Journey;
- wiederholte Spotinteraktionen als eine Journey-Einheit;
- Multi-Concept-Attribution ohne zusätzliche Experience;
- Cross-User-Abweisung;
- gefälschte Journeys sowie fremde Decision-/Spot-Referenzen;
- fehlende, falsche, fremde und nachträglich manipulierte Reference Resolution;
- unterschiedliche Resolution-Record-Hashes bei identischen sichtbaren Referenzen;
- Client-Save/-Reservation ohne verifizierten Product State;
- Event-Reference-Matrix einschließlich Visit, Review, Satisfaction und Correction;
- Future-Skew für Occurrence/Ingestion, inkonsistente Zeitreihenfolge und explizit erlaubtes Offline-Event;
- unbekannte Contract-/Registry-Version und unbekanntes Concept;
- getrennte Direct-Spot-, Practical- und Taste-Contracts;
- Item-/Bytebudget und neutrale Projection;
- No-Consent-Minimierung ohne Snapshot-Referenz oder Profil-Suppression;
- tatsächliches Delete aller personenbezogenen Stores bei abgeschlossener Account Erasure;
- runtime-validierte Abweisung kommerzieller Felder.
- fünf deterministische Journey-Resolution-Zustände mit Reason-/Proof-Hashes;
- Event-ID-, Idempotency-, Offline-Retry- und Product-Source-Dedupe;
- Standard-/Smart-Review-Parität einschließlich Cross-Journey-Konflikt;
- event-time World Provider, historische Stabilität, Conflicts und Future-State-Abweisung;
- expliziter, abgeleiteter und fehlender Context ohne Long-Term-Taste-Propagation;
- append-only Correction mit Cross-User/-Spot- und Zeitprüfung;
- unabhängige Repeat Visits nur über getrennte servergelöste Journeys;
- byte-identischer Full-/Incremental-Rebuild bei Out-of-order Delivery;
- innere Semantik-Manipulation trotz neu berechnetem äußeren Hash;
- Evidence-State-Purge bei Withdrawal, Full Reset und Account Erasure.

Der Concept-Slice `backyrd.synthetic-user-concepts@1.0` enthält ausschließlich Café, Bar, Restaurant, cozy/quiet/lively, calm/energetic, budget/premium und indoor/outdoor. Er ist Testvokabular, keine World- oder Founder-Freigabe.

Die Fixtures simulieren Contracts und Konsistenzregeln. Sie simulieren weder einen vollständigen Reducer noch echte Preference-Qualität, Full-/Incremental-Rebuild-Parität oder Production-RLS.
