# Founder Live Account Projection — Foundation

## Status

Diese Foundation bereitet genau einen späteren Founder-Live-Slot vor. Der Slot ist absichtlich `NOT_CONFIGURED_PENDING_EXPLICIT_RELEASE`; weder eine reale Account-ID noch deren Hash ist Bestandteil des Repositorys.

Der Slice autorisiert ausschließlich `LOCAL_TEST` und `PROD_LIKE_TEST` mit pseudonymen synthetischen Subjects. Er aktiviert weder User Learning noch Event-Ingestion, Persistenz, Netzwerkzugriffe, Writeback, Ranking, Eligibility, Confidence-Einfluss oder Shadow Traffic. Der ausgelieferte Kill Switch bleibt `FORCED_OFF`.

## Kanonische Grenze

Decision erhält ausschließlich den bestehenden `RelevantUserProjection`-Contract. Raw Events, Evidence, Review- oder Suchfreitexte, präzise Standorte, private Social-Daten und kommerzielle Felder sind nicht Teil dieses Ports.

Die spätere Live-Bindung darf nur aus einer separat freigegebenen serverseitigen Authority stammen. Client-veränderbare `user_metadata` ist keine Autorisierungsquelle. Die gegenwärtige synthetische Authority verwendet ausschließlich `SYNTHETIC_LOCAL_MAPPING`.

## Aktivierungszustand

- realer Founder-Slot: nicht konfiguriert;
- Production Authority: nicht vorhanden;
- Post-Deploy-Evidence: `NOT_EXECUTED_NO_PRODUCTION_AUTHORITY`;
- Retention: `NOT_CONFIGURED_PENDING_FOUNDER_CTO_LEGAL`;
- Production-Ausführung: nicht autorisiert.

## Reproduktion

```bash
npm run user-intelligence-vnext:founder-live:fast
npm run user-intelligence-vnext:founder-live:report -- --full-output /tmp/founder-live-report.json --verify-summary docs/user-intelligence-vnext/founder-live/release-summary.json
```

Der vollständige Report bleibt ein CI-Artefakt; eingecheckt wird nur die kompakte, deterministische Summary.
