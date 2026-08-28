# Admin Metric Lineage V2

Stand: 28. August 2026. Diese Matrix ist der verbindliche Lesevertrag für normale Founder-/Admin-Kennzahlen. Sie ändert keine Product-Ereignisse und keine historische Zeile.

## Gemeinsamer Product-Vertrag

`admin_product_spot_universe_v2` enthält ausschließlich Spots mit `data_origin IN ('REAL','IMPORT','LEGACY')` und `status IN ('approved','pending')`. Unbekannte Herkunft, `TEST`, `FIXTURE`, archivierte und abgelehnte Identitäten werden fail-closed ausgeschlossen. Ein spotbezogener Datensatz zählt nur, wenn sein Spot in diesem Universe liegt.

Nicht spotbezogene reale Nutzeraktivität bleibt absichtlich erhalten. Eine Decision ohne Impressions bleibt eine reale leere Decision; eine Decision mit ausschließlich Fixture-Impressions zählt nicht als Product-Decision. Safety-/Audit-Rohhistorie und technische Fehlertelemetrie bleiben vollständig, werden aber nicht als Product-Spot-Aktivität ausgegeben.

| Oberfläche / Kennzahlfamilie | UI | V2 Read Contract | Quellen | Population / Aktualität |
|---|---|---|---|---|
| Founder Launch-KPIs | `/founder` | `founder_launch_overview_v2`, `founder_core_kpis_v2` | gefilterte Analytics, Product-Decisions, Product-Reviews, Product-Spots | Product-only, live pro Request |
| Operations-Übersicht | `/dashboard` | `admin_founder_overview_v2` | Nutzer, Product-Aktivität, Product-Reviews/-Claims/-Decisions; technische Fehler separat roh | Product-only für Product-Metriken, live |
| Wachstum | `/growth` | `admin_growth_intelligence_v2` | Registrierung plus gefilterte Product-Ereignisse | Product-only bei Aktivierung, Funnel und Retention, live |
| Nutzeranalyse | `/users`, `/users/[id]` | `admin_users_intelligence_v2`, `admin_user_detail_intelligence_v2` | Nutzer, Sessions, gefilterte Ereignisse/Reviews/Decisions/Favoriten | Product-only für Spot-Aktivität; paginiert, live |
| Empfehlungsdiagnostik | `/decision`, `/decision/[id]` | `admin_decision_intelligence_v2`, `admin_decision_session_v2` | gefilterte Decision-Events, Product-Decision-Sessions | Fixture-only Decisions ausgeschlossen, live |
| Moments | `/moments` | `admin_moments_intelligence_v2` | Product-Posts/-Reaktionen/-Kommentare/-Feed-Events, gefilterte Analytics | Product-only, live |
| Partner | `/partners` | `admin_partners_intelligence_v2` | Product-Spots mit Owner, Product-Events/-Reviews/-Claims | Product-only, live |
| Reviews | `/reviews`, Detail | `admin_review_spots_v2`, `admin_review_spot_detail_v2` | Product-Reviews und Product-Spots | Product-only, live |
| Spot Quality | `/spot-quality` | `admin_spot_quality_v2` | Product-Spots, effektiver Inhalt, Fotos, Zeiten, Taxonomie | Product-only, live |
| Spot Operations | `/spots`, Detail | `admin_spots_operations_v2`, `admin_spot_detail_operations_v2` | Product-Spots, Product-Reviews, Product-Aktivität | Product-only, serverseitig paginiert, live |
| Claims | `/claims` | `get_spot_claim_queue_v3` | Product-Claims | Product-only, live |
| Taxonomie-Auslastung | `/taxonomy` | `admin_get_taxonomy_overview_v2` | Taxonomie plus Product-Spot-Zuordnungen | Product-only für Spot-Counts, live |
| Mood-Auslastung | `/moods` | `admin_concepts_overview_v2` | Concepts plus Product-Spot-Zuordnungen | Product-only für Spot-Counts, live |
| Owner-Änderungsmoderation | `/trust-moderation` | `admin_get_spot_owner_moderation_queue_v2` | Audit-Events zu Product-Spots | Product-only in normaler Queue; Rohhistorie bleibt erhalten |
| Safety | `/safety-integrity/**` | bestehende Safety-Verträge | Safety Cases, Reports, Enforcement, Appeals | vollständige Audit-Historie absichtlich; keine Product-KPI |
| System/Fehler | `/system`, `/errors/**` | bestehende System-/Fehlerverträge | Worker- und Fehlertelemetrie | technische Rohdiagnostik absichtlich; keine Product-KPI |

## Production-Before-Snapshot

Der read-only Snapshot vom 28. August 2026 belegt fünf archivierte Fixture-Spots, 17 Fixture-Reviews, 17 verknüpfte Analytics-Ereignisse, acht Decision-Impressions und acht Social Posts. Gelöscht oder umgeschrieben wurde nichts.

Im aktuellen August-Zeitraum waren drei Reviews, fünf Analytics-Ereignisse, acht Decision-Impressions, eine ausschließlich Fixture-basierte Decision-Session und zwei Social Posts betroffen. Der exakte Active-User-Delta beträgt null, weil derselbe reale Nutzer im Zeitraum weitere Product-Aktivität hatte. All-time wurden Overview-Review-Zeilen um 17, Spot Opens um fünf, Moments um acht Posts plus einen Share und Review-Drill-downs um 17 Zeilen überhöht. Die alte rein Analytics-basierte Decision-Seite hatte durch diese 17 Events keinen direkten Event-Delta; Overview-Impressions waren um acht und die Decision-Session-Population um eine Fixture-only Sitzung überhöht. Claims, Taxonomie, Moods und Owner-Moderation hatten jeweils Delta null, sind aber präventiv auf denselben Vertrag gebracht.

Der reproduzierbare, ausschließlich lesende Nachweis liegt in `scripts/ci/audit-admin-metric-fixtures.mjs`.

## Sicherheitsvertrag

Alle V2-Funktionen prüfen die bestehende Admin-Autorisierung, verwenden einen expliziten sicheren `search_path`, entziehen `PUBLIC`/`anon` die Ausführung und gewähren nur `authenticated` plus `service_role` den Funktionsaufruf. Die internen Views sind für Browserrollen nicht direkt lesbar. Es entstehen keine Consumer- oder Owner-Rechte.
