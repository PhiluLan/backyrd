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

Der Concept-Slice `backyrd.synthetic-user-concepts@1.0` enthält ausschließlich Café, Bar, Restaurant, cozy/quiet/lively, calm/energetic, budget/premium und indoor/outdoor. Er ist Testvokabular, keine World- oder Founder-Freigabe.

Die Fixtures simulieren Contracts und Konsistenzregeln. Sie simulieren weder einen vollständigen Reducer noch echte Preference-Qualität, Full-/Incremental-Rebuild-Parität oder Production-RLS.
