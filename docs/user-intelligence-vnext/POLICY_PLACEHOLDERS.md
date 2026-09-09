# Offene Policy-Schnittstellen

Die folgenden Werte sind nicht entschieden und werden in Phase 1 nur als versionierte Referenzen geführt:

- Event Weight;
- Source Reliability;
- Attribution Confidence und Dilution;
- Decay sowie Recent/Long-term;
- Maturity und domainbezogene Sufficiency;
- Projection Selection;
- Context Allowlist;
- Occasion Patterns;
- Personalization Cap und Ranking Movement;
- Review-Mood- und Moment-Wirkung;
- Save-Wirkung;
- Onboarding-Stärke;
- finale Retention-Zeiträume.

Auch konkrete Temporal-Grenzwerte sind Product-/Operations-Policy und werden nicht als Default festgelegt. Der Contract verlangt stattdessen eine injizierte, versionierte Policy; numerische Werte in Tests sind ausschließlich synthetisch.

`synthetic-*` dient ausschließlich der Testidentität. `UNRESOLVED_PRODUCT_POLICY` und `UNRESOLVED_PRIVACY_POLICY` verhindern, dass eine Fixture-Zahl als Product Truth missverstanden wird. Ein späterer Reducer muss jede Policy über den `UserIntelligenceManifest`-Hash binden.
