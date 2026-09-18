# Production RelevantUserProjection Port — inaktive Servergrenze

Status: Source-ready, nicht aktiviert. Der Port implementiert ausschließlich den bestehenden Vertrag `DecisionVNextUserProjectionPort` und liefert ausschließlich eine bereits autorisierte, minimierte `RelevantUserProjection`.

## Grenze

- Die User-ID stammt ausschließlich aus einer serververifizierten Supabase-Auth-Session. Client-Identity, E-Mail und `user_metadata` besitzen keine Autorität.
- Session, Subject, Consent, Lifecycle, privater Zwei-Personen-UUID-Record, Request, Purpose, Project/Host-Binding, Release, Artifact und Source Set werden bei jedem Read erneut geprüft.
- Der Port baut keine Projection, liest keine Raw Evidence und erzeugt weder eine synthetische noch eine leere Ersatzprojektion. Fehlt die autorisierte Projection, endet der Request ehrlich mit `PROJECTION_MISSING`.
- Rückgabe ist ausschließlich der kanonische minimierte Projection-Vertrag. User-ID, E-Mail, private Events, Raw Evidence, Such-/Reviewtext, Rohstandort, private Social-Daten, Retention-Daten und Commercial-Felder verlassen die Grenze nicht.
- Withdrawal, Full Reset, Account Erasure, blockierte oder gelöschte Accounts, abgelaufene Sessions, Kill Switch und Authority-Drift sperren den Read fail-closed.

## Infrastrukturentscheidung

Der bestehende service-role-geschützte RPC `backyrd_read_latest_shared_user_card_v1` liefert eine ältere User Card, keine kanonische vNext-`RelevantUserProjection`. Diese Closure führt bewusst weder eine semantische Live-Konvertierung noch neue Persistenz ein. Ein Server-Adapter darf den Port erst anbinden, wenn ein separat autorisierter Read-Provider eine bereits materialisierte und hashgebundene kanonische Projection liefert. Dafür wurde keine Migration, Function oder Production-Abfrage ausgeführt.

## Nicht autorisiert

Runtime-Aktivierung, Deployment, Production-Abfrage, Migration, Learning, Persistenz, Writeback, Shadow Traffic, Ranking und Eligibility bleiben aus. Die Release- und Trust-Artefakte belegen die Source-Grenze, sind aber keine Ausführungs-Autorität.
