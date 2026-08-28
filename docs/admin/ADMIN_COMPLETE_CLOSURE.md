# Backyrd Admin / Intelligence – Closure Inventory

## Oberflächeninventur

41 Seitenrouten, drei Admin-API-Routen, 16 Tabellen-/Listeninstanzen, acht Dialog-/Bestätigungsinteraktionen und drei echte Form-Flows wurden im Repository erfasst. Reachable unreviewed: 0.

| Route | Einordnung | Ergebnis |
|---|---|---|
| `/` | DEPRECATED | stabiler Redirect zum Operations-Cockpit |
| `/login` | ACTIVE | kohärenter, fail-closed Admin-Zugang |
| `/dashboard` | MIGRATED | Product-only Operations Overview V2 |
| `/founder` | MIGRATED | Founder Launch Cockpit, Product-KPIs V2 |
| `/founder/launch-readiness` | ALREADY_GOOD | Launch-Register, bewusst nicht spotmetrisch |
| `/founder/launch-readiness/[key]` | ALREADY_GOOD | Gate-Prüfung und Evidenz |
| `/founder/engineering` | ALREADY_GOOD | serverseitige GitHub-Integration |
| `/growth` | MIGRATED | Growth V2 |
| `/users` | MIGRATED | User Analytics V2, serverseitige Suche/Pagination |
| `/users/[id]` | MIGRATED | Product-only Nutzer-Drill-down |
| `/users/invite` | MIGRATED | serverautorisierter Invite |
| `/decision` | MIGRATED | Product-only Decision Diagnostics V2 |
| `/decision/[id]` | MIGRATED | Product-only Sitzungs-Drill-down |
| `/moments` | MIGRATED | Product-only Community-Kennzahlen V2 |
| `/partners` | MIGRATED | Product-only Partner-Kennzahlen V2 |
| `/spots` | MIGRATED | serverseitig paginierte Product-Operations-Liste |
| `/spots/new` | MIGRATED | bestehender kanonischer Create-Flow |
| `/spots/[id]` | MIGRATED | Operations-Hub ohne tote Links |
| `/spots/[id]/edit` | MIGRATED | Save/Return und Human Intelligence |
| `/spots/[id]/owner` | MIGRATED | bestehende Owner-/Claim-Operationen |
| `/spots/[id]/moods` | DEPRECATED | Redirect zum kanonischen Intelligence-Editor |
| `/spot-quality` | MIGRATED | live Quality V2, korrekte Queues |
| `/spot-quality/[id]/google-backfill` | MIGRATED | kanonischer Google-Backfill |
| `/spot-quality/[id]/enrichment` | MIGRATED | ergänzende Google-Daten |
| `/spot-quality/backfill/[id]` | DEPRECATED | Redirect zum kanonischen Backfill |
| `/reviews` | MIGRATED | Product-only Review-Übersicht |
| `/reviews/[spotId]` | MIGRATED | Product-only Review-Detail |
| `/reviews/[spotId]/new` | DEPRECATED | keine Admin-Erzeugung von Product-Reviews; Redirect |
| `/claims` | MIGRATED | Product-only Claim-Queue V3 |
| `/taxonomy` | MIGRATED | Product-only Auslastungszahlen, bestehende Authoring-Aktionen |
| `/moods` | MIGRATED | Product-only Concept-Auslastung, read-only |
| `/trust-moderation` | MIGRATED | Product-only normale Owner-Änderungsqueue |
| `/safety-integrity` | ALREADY_GOOD | vollständige Safety-Audit-Historie absichtlich |
| `/safety-integrity/[caseId]` | MIGRATED | menschliche Entscheidung, sichere Fehlermeldungen |
| `/safety-integrity/overview` | MIGRATED | Safety Monitoring |
| `/safety-integrity/enforcement` | MIGRATED | menschliche Kontomaßnahmen |
| `/safety-integrity/enforcement/new` | MIGRATED | kontrollierter Enforcement-Flow |
| `/privacy` | MIGRATED | Rechtsdokumente und Betroffenenanfragen |
| `/errors` | MIGRATED | technische Fehlerdiagnostik |
| `/errors/[fingerprint]` | MIGRATED | expandierbare technische Evidenz |
| `/system` | MIGRATED | bewusst technische Rohdiagnostik, keine Product-KPI |

API-Routen: Founder Engineering, Admin Invite und serverautorisierte Foto-Löschung. Die ungenutzten parallelen Service-Role-User-Routen und sämtliche versionierten Backup-Dateien wurden entfernt; Git bleibt die Historie.

## Design- und Operations-Vertrag

Ein dunkles, dichtes Backyrd-Operations-System mit Pink nur für primäre Aktion/Auswahl, Grün für Erfolg, Amber für Aufmerksamkeit und Rot für kritische/destruktive Zustände. Tabellen bleiben Tabellen, erhalten responsive Labels/Scroll-Container und skalierbare serverseitige Populationen. Loading, Empty, Error und Retry sind explizit; rohe Datenbankfehler werden nicht als normale UI-Copy gezeigt.

Navigation: Founder, Operations, Spots, Menschen, Vertrauen, System. Quality, Gold und Human Readiness bleiben sprachlich und technisch getrennt.

## Bewusste Diagnose-Ausnahmen

Safety/Audit zeigt die vollständige Historie, weil deren Entfernung Beweisketten zerstören würde. System und Errors zeigen technische Telemetrie; Stacktraces bleiben ausschließlich in der expandierten Admin-Diagnose. Diese Flächen sind keine normalen Product-Metriken und werden entsprechend benannt.

## Bekannte externe Gate

Ein geerbter Fresh-Boot-Fehler in `20260826120000_production_decision_fixture_cleanup_v1.sql` kann eine leere kanonische Historie mit `fixture_cleanup_identity_or_provenance_mismatch` stoppen. Diese Closure umgeht und repariert ihn nicht. Production-Freigabe bleibt blockiert, solange keine vollständig grüne kanonische CI-Historie diesen Gate belastbar entkräftet oder ein separat autorisierter bootstrap-sicherer Vorwärtsweg vorliegt.
