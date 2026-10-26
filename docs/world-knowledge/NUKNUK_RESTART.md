# Nuknuk: kontrollierter Neustart des Rechercheablaufs

Stand: 21. Oktober 2026. Auftrag: Backyrd-Recherche neu aufbauen und richtige
bisherige Erkenntnisse erhalten. Status: Neustart vorbereitet, keine neue
Recherche-Runtime implementiert und kein Modell zurückgesetzt oder trainiert.

## Technischer Befund

Der lokale Dienst auf Port 8088 meldete bei dieser Bestandsprüfung:
Qwen3.5-27B-4bit, Revision `45797d2985a12c55e6473686e9ea91b95e959553`,
`loaded_adapter:null`. Die Runtime erlaubt zusätzlich die gepinnte 9B-Revision
`8b2b98c00a6b4d291155e4890773ca8f769aee53`.

Die dokumentierten Nuknuk-Anpassungen waren Code-/Prompt-/Verarbeitungsänderungen,
keine Trainingsläufe. Jeder aktuelle Forschungsaufruf erhält Systemanweisung und
Quelldaten; dieser Pfad schreibt keine Modellgewichte. Dies ist keine Aussage
über eventuell separat trainierte, hier nicht geladene Modelle oder Adapter.
Solche Dateien werden nicht verändert. Es gibt keinen belegten Grund, Gewichte,
Modellverzeichnisse, Adapter, Forschungsberichte oder Spotdaten zu löschen.

## Erhaltener Ausgangspunkt

Git-Stand der Methode und letzten Auswertung: `18baf97c` auf
`codex/nuknuk-research`. Git bleibt der Versionsverlauf; keine parallelen
Backupkopien der Implementierung oder Modellgewichte anlegen.
Bestehende uncommittete Admin-Arbeiten werden nicht verändert.

| Bestand | Behandlung beim Neustart |
| --- | --- |
| Lokale Modellgewichte und eventuell vorhandene Adapter | Unverändert erhalten; Training ist ein eigener späterer Auftrag |
| Backyrd-Methode `backyrd.research-method@1.0` | Fachlicher Auftrag; keine Zusage vollständiger Runtime-Umsetzung |
| Kanonische Felder, Angebote, Bereiche, erlaubte Scopes und Typen | Verbindlich weiterverwenden; keine zweite Taxonomie |
| Schutz öffentlicher Abrufe, exakte Filialzuordnung, Quellhashes, Literalbelege | Weiterverwenden und durch bestehende Tests schützen |
| Menschenprüfung, keine automatischen Profilimporte, unbekannt bleibt offen | Unverändert verbindlich |
| Getestete Telefon-/Zeitnormalisierung | Nach Eignungsprüfung wiederverwenden; keine Garantie für alle Quellen |
| Bestehende richtige Spotangaben und bestätigte Betreiberangaben | Unverändert erhalten; Recherche liefert ergänzende Entwürfe/Konflikte |
| Fehlgeschlagene und erfolgreiche Forschungsberichte | Als Entwicklungs-/Fehlerbelege erhalten; nicht automatisch Trainingsdaten |
| Historische Prompts, Menüprodukt-Heuristiken, Same-Model-Kritik | Als Versionsgeschichte erhalten; nicht ungeprüft in den neuen Ablauf übernehmen |
| 491 bestandene Softwaretests | Schutz einzelner technischer Regeln; kein Nachweis ausreichender Recherchequalität |

Der letzte Isaak-Test ist ein Regressionstest, kein künftiger Blindtest. Seine
korrekten Aussagen sind belegte Beispiele, kein frei übertragbares Ortswissen.
Der fehlerhafte Fischerstube-Entwurf bleibt zurückgezogen, nicht Trainingsvorbild.

## Neustartgrenze

Neu aufgebaut werden soll die Auswahl und Verarbeitung recherchierter Aussagen.
Nicht neu aufgebaut werden Modellgrundwissen, Datenbank, Decision, Community-
Moods, vorhandene Betreiberprofile oder deren Freigaben.

Zuerst Referenzfälle samt erwarteten Belegen einfrieren. Erst danach den neuen
Ablauf implementieren und gegen die unveränderte Ausgangsversion vergleichen.
Keine laufende Promptoptimierung an als unabhängig bezeichneten Testfällen.

Der neue Ablauf soll folgende klare Übergaben haben:

1. **Auftrag:** genaue Ortsidentität, gesuchte Dimensionen, bestehende Werte,
   Quellen- und Zeitbudget. Nicht recherchierte Felder bleiben kenntlich.
2. **Quellen:** relevante offizielle Seiten erfassen. Nicht erreichbare oder
   ungelesene Seiten sichtbar von fehlenden Tatsachen unterscheiden.
3. **Aussagen:** kurze, quellengestützte Tatsachen mit Originalstelle, Subjekt,
   Bedingungen und Zeitbezug erfassen, noch ohne komplexes Backyrd-Profil.
   Praktische Kernangaben vor optionalen Gerichtsspezialitäten bearbeiten.
4. **Zuordnung:** diese Aussagen zu vorhandenen Katalogobjekten/Feldern zuordnen;
   keine JSON-kodierten Freitextwerte innerhalb anderer JSON-Strings als unnötige
   zweite Serialisierung. Komplexe Preise/Zeitpläne erst nach Belegprüfung bilden.
5. **Prüfung:** Literalbeleg, Scope, Wert, Filiale, Ergänzung/Konflikt getrennt
   prüfen. Offene Servicebeginnzeiten und Zuschläge nicht durch erfundene
   Pflichtwerte speicherbar machen. Vertragslücken gesondert melden.
6. **Entwurf und Bewertung:** übernehmbare Angaben, fehlende belegte Kernangaben,
   Unsicherheiten und bestehende Konflikte gemeinsam zeigen. Kein automatischer
   Import, keine leere Ausgabe als Erfolg.

Die vorhandene kanonische Runtime wird erweitert oder nach Abnahme ersetzt,
nicht durch dauerhaft parallele Import-/Recherchepfade ergänzt. Ein neuer
experimenteller Ablauf bleibt ausdrücklich opt-in, bis die Vergleichsprüfung
besteht. Die produktive Decision wird durch diesen Auftrag nicht verändert.

## Richtige Erkenntnisse erhalten, schlechte nicht einlernen

Eine spätere Beispielsammlung darf nur nach Quellenprüfung freigegebene
Eingabe-Ausgabe-Paare enthalten. Pro Beispiel: Herkunft, geprüfte Aussage,
richtige Zuordnung, Bedingungen, Prüfer und Freigabestand. Reale Kontodaten und
private Betreiberinformationen gehören nicht hinein. Historische Modellantworten
werden nicht allein durch Wiederholung zu Wahrheit.

Fehlerfälle erhalten getrennte erwartete Korrekturen; der fehlerhafte Text wird
nicht als Zielantwort trainiert. Entwicklungs-, Validierungs- und unangetastete
Testfälle bleiben getrennt. Kein Training und keine neue Gewichtsdatei, bevor
die Probleme ohne Training lokalisiert und der Datensatz fachlich geprüft sind.

## Nächster begrenzter Arbeitsblock

Die nächsten Änderungen sollen die Referenzsuite aus dem vereinbarten Plan
aufbauen. Danach zuerst einen kleinen Aussagenextraktions-/Zuordnungsfall lösen:
Abendessen, vegetarische Option, Adresse und offener Servicebeginn. Ausgangs-
und neue Version müssen dieselben Quellen und Erwartungen erhalten.

Abnahme dieses Blocks: korrekte Übertragung dieser Kernangaben, keine neuen
falschen oder falsch zugeordneten Angaben, sichtbare Quellen-/Abdeckungslücken
und gemessene Laufzeit. Ein solcher Einzeltest ersetzt weiterhin keine
systemweite Qualitätsabnahme. Ohne messbaren Fortschritt keine Ausweitung und
keine automatische Veröffentlichung.

Siehe [Methode](NUKNUK_RESEARCH_METHOD.md) und
[letzten Praxistest](NUKNUK_METHOD_V1_TEST.md).

Für den Aufbau gilt der [Qualitätsstandard der Lernsammlung](NUKNUK_LEARNING_COLLECTION.md).
