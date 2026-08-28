# Spot Quality Contract V2

Spot Quality ist operative Vollständigkeit. Sie ist weder Canonical Gold noch Human Readiness und fließt nicht in Eligibility, Ranking oder User Learning ein.

## Root Cause des Werts „Ohne Beschreibung: 128“

Der alte Read Contract las nur `owner_description` und `enriched_description`, obwohl Founder-Edits in `admin_description` gespeichert wurden. Zusätzlich zählte er alle 130 Spot-Zeilen einschließlich fünf archivierter Fixtures und einer weiteren archivierten Product-Zeile. Deshalb blieb die Kennzahl nach korrekten Founder-Saves scheinbar stehen.

Der read-only Production-Snapshot ergab:

| Kennzahl | Alter sichtbarer Wert | Product-only live | direkter Fixture-Anteil |
|---|---:|---:|---:|
| Spots gesamt | 130 | 124 | 5 |
| Ohne Google Place ID | 5 | 0 | 5 |
| Ohne Bild | 4 | 0 | 4 |
| Ohne Beschreibung | 128 | 38 | 5 |
| Ohne Öffnungszeiten | 38 | 33 | 5 |
| Taxonomie unvollständig | 127 | 121 | 5 |

Beim Beschreibungs-Delta stammen weitere 85 Korrekturen aus kanonischen Admin-Beschreibungen und dem Ausschluss des zusätzlichen archivierten Product-Spots. Die Rohdaten wurden nicht verändert. Der Snapshot ist zeitgestempelt, weil Founder-Verbesserungen diese Live-Werte erwartungsgemäß sofort verändern.

## Universe und Aktualität

Nur `REAL`, `IMPORT` oder `LEGACY` mit Status `approved` oder `pending`. `TEST`, `FIXTURE`, unbekannte Herkunft, `archived` und `rejected` sind ausgeschlossen. Jede Abfrage berechnet live aus kanonischen Tabellen; es gibt keinen Snapshot, Worker und keine manuelle Neuberechnung. Nach einem bestätigten Save und Reload gilt der neue Zustand unmittelbar.

## Deterministischer Score (100 Punkte)

| Bereich | Punkte | Regel |
|---|---:|---|
| Name | 5 | nicht leer |
| Adresse | 10 | nicht leer |
| Koordinaten | 10 | Latitude und Longitude vorhanden |
| Kategorie | 5 | kanonische Kategorie vorhanden |
| Google-Verknüpfung | 10 | nicht leere Place ID |
| Bild | 15 / 8 | eigenes kanonisches Bild = 15; erlaubter Google-Fallback = 8 |
| Beschreibung | 10 | effektiver Inhalt gemäß `spot_effective_content_v1`: Owner, Admin, dann Enrichment |
| Öffnungszeiten | 10 | mindestens ein vollständiges Open-/Close-Zeitfenster |
| Website | 5 | nicht leer |
| Telefon | 3 | nicht leer |
| Taxonomie | 12 / 8 / 4 | mindestens 8 / 4 / 1 Zuordnungen |
| Freigabe | 5 | Status `approved` |

Quality-Bänder: launchbereit ab 85, gute Basis 70–84, ausbaufähig 50–69, kritisch unter 50. Diese Bänder sind ausschließlich Operations-Priorisierung.

## Queue-Regeln

- Ohne Google Place ID: Place ID leer.
- Ohne Bild: kein Header-/Galeriebild und kein erlaubter Google-Fallback.
- Ohne Beschreibung: effektive kanonische Beschreibung leer; Whitespace zählt als leer.
- Ohne Öffnungszeiten: kein vollständiges Zeitfenster. Der heutige Datenvertrag kennt noch keinen strukturierten Zustand für „bewusst unbekannt“, saisonal oder dauerhaft geschlossen; das bleibt als P2 transparent dokumentiert.
- Taxonomie unvollständig: weniger als vier aktuelle Zuordnungen.
- Mögliches Duplikat: identische nicht leere Google Place ID oder identischer normalisierter Name plus Adresse innerhalb des Product Universe.

Für jede Queue gilt serverseitig `summary count == filtered_total == vollständige Ergebnismenge`; die UI paginiert je 50. Der Test verbessert Beschreibung, Bild, Zeiten, Google-Verknüpfung und Taxonomie einzeln und beweist das unmittelbare Entfernen aus der jeweiligen Queue sowie den reversiblen Beschreibungsfall.
