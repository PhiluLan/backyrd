# Phase 3A — User Model Architecture

## Artefakte

1. `ObservationRecord`: unveränderte Aussage darüber, was in einer verifizierten Evidence Chain vorliegt.
2. `InterpretationRecord`: vorsichtige, policygebundene Annahme mit Evidence-, Registry-, Temporal- und Policy-Provenance.
3. `UserModelManifest`: nur nicht-personenbezogene Contract-, Code- und Policy-Identitäten plus offene Policy-Lücken.
4. `UserModelSnapshot`: getrennte Modelldimensionen, Sufficiency, Uncertainty und Konflikte ohne Raw Events.
5. `UserModelState`: Snapshot, Pointer, Reducer-State, Evidence Checkpoint und Rebuild-Verweis; rekursiv verifizierbar und lifecycle-fähig.

Model Authority wird nicht aus Eigenhash und Authority-Label abgeleitet. Ein versionierter Authority Record muss durch einen separat injizierten Trust Anchor exakt akzeptiert sein. Parser, Eigenhash-Prüfung und autoritative rekursive Verifikation sind getrennte APIs.

Long-Term Concept Taste und Aversion werden nicht verrechnet. Recent Preference bleibt getrennt und `NOT_CONFIGURED`. Contextual Taste wird nicht Long-Term. Practical Preferences sind keine Taste-Aussage. Direct Spot Affinity propagiert nicht auf Concepts. Exploration/Familiarity bleibt ohne Product Policy unkonfiguriert.

Explizite Satisfaction kann nur in synthetischen Policies eine Direct-Spot- und Concept-Hypothese erzeugen. Mehrere Event-time World Concepts bleiben konkurrierende Erklärungen derselben Attribution Unit und Journey-Independence. Fehlende Attribution bleibt `ATTRIBUTION_UNRESOLVED`.

Interpretationszeit und Temporal Policy sind injiziert und hashgebunden. Recency und Decay bleiben unkonfiguriert. No Consent, Withdrawal, Reset und Erasure liefern einen personenbezogen leeren persistierbaren State. Neutrale Projections sind zusätzlich von persönlichem Model- und Subject-State unabhängig. Runtime-Grenzen lehnen kommerzielle und selbstdeklarierte Modellfelder ab.
