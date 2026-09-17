# User Intelligence Week 3 — Internal Allowlisted Projection

Week 3 ergänzt den kanonischen Week‑2-Pfad um einen geschlossenen internen Consumer für pseudonyme synthetische Testsubjekte. Der öffentliche Consumer liefert ausschließlich `RelevantUserProjection | null`; State, Ledger, Handoff, Privacy Export und Writeback sind kein Bestandteil dieser Grenze.

Alle produktiven Fähigkeiten bleiben standardmäßig und im Release-Artefakt `false`. Fehlende oder unbekannte Konfiguration ist `OFF`, der Kill Switch ist `FORCED_OFF`. Ein isolierter `LOCAL_TEST`- oder `PROD_LIKE_TEST`-Aufruf benötigt einen extern akzeptierten, request-, purpose-, environment-, consent-, lifecycle-, release- und hashgebundenen Allowlist Record.

Es wurden keine Migrationen, Functions, Auth-/RPC-/Edge-Änderungen, Product Consumer, Production-Daten oder echten Nutzer eingebunden.

