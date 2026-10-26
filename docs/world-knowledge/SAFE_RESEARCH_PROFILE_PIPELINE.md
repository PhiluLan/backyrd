# Sichere Übernahme recherchierter Grundinformationen

Stand: 26. Oktober 2026. Policy: `backyrd.research-safe-properties@1`.
Taskklasse: FAST_PR mit betroffenem Admin-/World-/Runtime-Prüfumfang.
Keine Migration, keine Änderung an RLS, Decision oder Community-Moods.

## Auftrag und Grenze

Ein angemeldeter Admin exportiert einen bestehenden, freigegebenen Spot. Eine
Recherche – beispielsweise durch Codex – beantwortet ausschliesslich die 16
Grundinformationen im bestehenden World-Rechercheformat. Die neue Pipeline
verarbeitet dieses Ergebnis; sie startet selbst kein Modell und ersetzt nicht
den bestehenden Rechercheworker. Dateiupload und JSON sind derselbe Eingang.

Zunächst dürfen nur sechs neue Kontaktfelder automatisch gespeichert werden:
öffentliche E-Mail, Telefon, Instagram, Facebook, LinkedIn und TikTok. Dafür
muss ein frischer, serverseitiger Abruf der bereits registrierten offiziellen
Website genau den vorgeschlagenen Kontaktlink enthalten. Identität, Ort und,
wenn vorhanden, Strasse müssen im sichtbaren HTML zusammenpassen. Footer und
Kontakt-Widgets bleiben enthalten. Mehrere mögliche Kontakte, verwechselbare
Betriebe, reine Gruppenprofile, fremde Quellen oder fehlende Belege führen zur
Prüfung. Ein Modell-Vertrauenswert ist keine Freigabe.

Andere Felder der 16, Zusammenfassungen, geografische Ableitungen und jede
abweichende bestehende Angabe bleiben zur Prüfung. Bestehende identische Werte
werden unverändert bestätigt. Explizit unbekannte und private Angaben werden
nicht automatisch ersetzt. Fehlende Informationen bleiben offen.

## Speichern, Nachweis und Wiederaufnahme

`POST /api/world-knowledge/research-pipeline` authentifiziert über den bestehenden
Admin-Guard. `export` erzeugt den gebundenen Auftrag. `process` verarbeitet ein
Ergebnis. `resume` lädt den erhaltenen Auftrag für denselben Admin erneut.
Der Server akzeptiert keine frei gewählte Abruf-URL: Er liest sie aus dem
aktuellen kanonischen Profil und verwendet den bestehenden öffentlichen
HTTP-Abruf mit Netzwerk-/Redirect-/Grössen- und Zeitgrenzen.

Die bestehende Jobtabelle protokolliert Batch, Admin, Spot, Eingabehash, Policy,
Quellenhash, Entscheidungen und Speicherbeleg. Ein Lease verhindert gleichzeitige
Bearbeitung. Die geprüften Claims werden vor dem kanonischen Schreibschritt
haltbar protokolliert. Neue Kontaktwerte werden ausschliesslich durch
`world_product_admin_import_research_spot_v2` unter dem authentifizierten Admin
mit dessen unveränderten Berechtigungen geschrieben. Keine direkte Claim-SQL,
keine nachgebildete Sitzung und keine neue Autoritätsklasse.

Dies ist eine vom Admin beauftragte automatische Regelprüfung: Der bestehende
kanonische Writer bleibt `ADMIN`/`ADMIN_CONFIRMED`. Das bedeutet keine manuelle
Einzelprüfung. Quellenbeleg und Pipeline-Journal kennzeichnen ausdrücklich die
automatische Prüfung und ihre Policy; menschliche `reviewed_by`-/`reviewed_at`-
Felder werden nicht erfunden. Ein unabhängiger maschineller Verifizierer ist
damit ausdrücklich nicht eingeführt.

Vor dem Schreiben werden Profilidentität, kanonische Website und Manifest erneut
geprüft. Der bestehende transaktionale Writer verhindert das Überschreiben
zwischenzeitlicher Änderungen. Eine mehr als fünf Minuten alte Quellenprüfung
darf noch fehlende Kontakte nicht mehr schreiben; dafür ist ein neuer Auftrag
nötig. Bereits gespeicherte Werte können auch später erneut zurückgelesen werden.

Erst nach Rebuild und identischer Rücklesung aus dem aktuellen Profil lautet der
Beleg `STORED_VERIFIED`. Ein möglicherweise erfolgter Schreibschritt ohne
bestätigte Projektion heisst `SAVED_UNVERIFIED`; der Auftrag bleibt wiederaufnehmbar.
Bei Wiederholung werden keine doppelten Claims angelegt. Verbleibende Vorschläge
werden gegen das neue Manifest gebunden und sind über die bestehende Prüfansicht
bearbeitbar. Vollständig abgeschlossene Aufträge verschwinden aus der offenen
Liste, ohne eine menschliche Prüfung vorzutäuschen.

## Aktivierung und Abnahme

`WORLD_RESEARCH_SAFE_IMPORT_ENABLED=true` ist ausschliesslich eine serverseitige
Einstellung und standardmässig aus. Benötigt werden die bestehenden Admin-
Supabase-Konfiguration und der serverseitige Service-Key für Journal/Rebuild.
Weder Schlüssel noch fremde Admin-Aufträge werden an den Browser ausgegeben.
Zur Rücknahme den Schalter ausschalten; abgeschlossene sichere Schreibvorgänge
werden dadurch nicht gelöscht. Änderungen an bestehenden Werten bleiben im
regulären, nachvollziehbaren Admin-Verfahren.

Vor allgemeiner Aktivierung: betroffene Vertrags-/Runtime-Tests, Typprüfung,
Admin-Produktionsbuild und reguläre PR-Gates; danach ein authentifizierter
Admin-Durchlauf mit echtem Profil, Rücklesung und offener Prüfliste. Ein
isolierter Repository-Test oder eine reine Quellenprüfung ist kein Nachweis
einer Live-Speicherung. Keine automatische Freigabe weiterer Feldklassen ohne
eigene Belegregeln und Regressionstests.

Der erste Testfall ist die vom Nutzer bestimmte Safran Zunft: gespeicherte
Assistant-Recherche, frischer offizieller HTML-Abruf und ein aus Produktion nur
lesend übernommener Profilstand. Im isolierten Writer: zwei neue Socialprofile,
sieben identische Angaben, fünf Prüfvorschläge, zwei offene Socialfelder;
Wiederholung ohne weitere Schreibschritte. Das ist keine Live-Speicherung und
kein Qualitätsbeweis für weitere Restaurants oder für Nuknuk.
