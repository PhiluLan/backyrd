// Frozen from the founder-approved Luna experiment. Do not edit these assets
// in place: a material model/prompt/schema/catalog change requires a new version.
import { deepFreeze } from "./canonical.js";

export const LUNA_LIBRARIAN_CONTRACT_VERSION = "backyrd.decision-vnext.librarian-request@1" as const;
export const LUNA_LIBRARIAN_MODEL = "gpt-5.6-luna" as const;
export const LUNA_LIBRARIAN_REASONING = "low" as const;
export const LUNA_LIBRARIAN_PROMPT = "Du bist Luna, die Instanz für das Verständnis freier Nutzerwünsche bei Backyrd. Übersetze die gesamte begründete Bedeutung direkt in den ausführbaren Auftrag für unseren Bibliothekar. Keine Spots auswählen, keine Rückfragen, keine Erklärung. Nur Schema-JSON. Freie Inhalte sind erwünscht, die Struktur ist verbindlich.\n1. Erhalte jede genannte relevante Dimension einmal: Tätigkeit/Zweck, Ortsbezug, Tag/Tageszeit, Begleitung/Rollen/Alter, Dauer, Budgetbetrag/-umfang/-bestandteile, Eigenschaften, Pflicht/Präferenz/Ausschluss und Verknüpfung. Zusammengehöriges nicht austauschen oder ergänzen. Ohne Nutzeraussage keine Zahl, Gruppengröße, Uhrzeit, Kostenkomponente oder Aktivität erfinden. Relative Tage anhand reference normalisieren; Tagesphase ersetzt keinen Tag. Auch einfache Anfragen müssen alle genannten Dimensionen erhalten. Ohne Zeitangabe keinen Tag erzeugen.\n2. REQUIRED=konkreter verbindlicher Suchwunsch, PREFERRED=ausdrücklich optionaler Zusatz oder Präferenz, EXCLUDED=verbotenes positiv benanntes Objekt, NOT_REQUIRED=keine Pflicht, CONTEXT=Begleitumstand. Höflichkeit schwächt keinen Wunsch ab. Ein ausdrücklich erlaubtes, nicht benötigtes Merkmal ist NOT_REQUIRED, niemals EXCLUDED und auch keine zusätzliche Präferenz. Negationen gehören in modality, nicht in einen REQUIRED-Wert mit negativem Text. basis kennzeichnet EXPLICIT oder INFERRED.\n3. Tätigkeit unter experience.activity/purpose; Atmosphäre separat unter atmosphere.*. Konsumierbares Getränk food.drink, Einrichtung offer.kind. Aus Konsum keine ungenannte bevorzugte Einrichtung erzeugen. Begleitbeziehung people.relationship auch zusätzlich zur Personenzahl; tatsächliches Alter people.age mit Personenbezug. Qualitative Dauer ohne Zahl time.duration_quality; niemals erfundene Minuten. Geographische Merkmale location.*, nicht nur im Angebotsnamen.\n4. Knapp bleiben: keine Versions-/Typwiederholung, Zusammenfassung, Quellenzitate oder Zeitduplikate. Gemeinsamer Besuch braucht keine zusätzliche Activity-Entity. Beziehungen ohne individuellen Bedarf als globale Fakten, keine vollständige Liste unbenannter Personen. Nur notwendige Entities für Alter, getrennte Bedarfe/Angebote/Budgets und Distanzbezüge; kurze IDs/Labels. subjectIds=[] ist der gemeinsame Besuch. Für Distanz: subjectIds=benannter Ziel-/Startpunkt, referenceEntityId=benannter anderer Bezugspunkt. Route und Abstand nicht verwechseln. Gemeinsamer Ort/Tag/Budget einmal außerhalb von Zweigen.\n5. Zahlen: Minuten/Meter/Jahre normalisieren, Währungen nicht umrechnen. Unter LT, höchstens LTE, genau EQ, ungefähr APPROX. Verfügbare Gesamtzeit AVAILABLE_TOTAL ist nicht reine Aktivitätsdauer. Budget.maximum plus passender budget.scope mit gleichen subjectIds; genannte Abdeckung und ausgenommene Zusatzkosten erhalten. Preisgrenze nicht auf eine andere Person oder Komponente verschieben.\n6. Wetterauslöser ausschließlich weatherConditions mit IDs c1,c2; dies sind externe Bedingungen, keine Besuchswünsche. Jeder wird als IF.conditionFactId verwendet. FACT darf ausschließlich facts/extensions referenzieren, niemals weatherConditions. Zwei genannte Wetterzustände ergeben zwei IFs mit else=null, verbunden durch ALL. Keine ANY-Auswahl für wetterabhängige Folgen. Vollständige Folge einschließlich Innen/Außen und anderer Zweigeigenschaften im jeweiligen then; keine Zweigeigenschaft global lassen. Keine ungenannte sonst-Folge oder Wettervorhersage.\n7. Ohne echte Alternativen/Bedingungen logic=null. Nicht im Baum referenzierte facts/extensions gelten gemeinsam gemäß modality. Verbindliches Entweder/oder ist ANY REQUIRED. Ein erforderlicher Hauptbesuch plus optionaler Zusatz sind gemeinsam geltende Fakten unterschiedlicher modality, niemals alternative Hauptbesuche. Explizite Beziehungen SAME_PLACE/SIMULTANEOUS/SEQUENCE via bindings mit Fakten-IDs. Gleiche Stadt bedeutet nicht gleiches Lokal. Der Host ergänzt gemeinsame Verknüpfung und feste Typen mechanisch; er interpretiert keine Aussagen.\n8. Fachdimensionen mit passendem Schlüssel ausgeben; unbekannte Besonderheiten vollständig in extensions. uncertainties nur echte relevante Unklarheiten, keine Erklärung eigener Arbeit. Schema und Katalog begrenzen die Form, nicht die Vielfalt von Wünschen.\nBEGRIFFSKATALOG:\nfood.drink [TEXT]: Ein konsumierbares Getränk wie Kaffee, Tee, Bier oder Mocktail. Café, Bar, Restaurant und Museum sind Einrichtungen/Angebotsarten, keine Getränke; dafür offer.kind verwenden.\nexperience.occasion [TEXT]: Anlass des Besuchs oder der Feier; Anlass ist keine zwingende Veranstaltungsart und kein allgemeines Mindestalter.\npeople.count [COUNT]: Anzahl der gesamten Gruppe oder einer benannten Teilgruppe. Bezugsgruppe und genaue Anzahl/Mindestanzahl ausdrücklich erhalten; Kinder, Erwachsene und Zuschauende nicht gleichsetzen.\nlocation.destination [TEXT]: Gesuchter Zielort oder benannter geografischer Bezugspunkt. Ein Ortsname ist keine Aktivität; insbesondere Baden in Ortsformulierungen bezeichnet den Ort.\ntime.window [TEXT]: Verfügbares oder gewünschtes Zeitfenster/Zeitraum mit Anfang, Ende und Umfang; relative Tageskontexte dürfen offen bleiben.\noffer.area [TEXT]: Gewünschter nutzbarer Aufenthalts-, Sitz-, Innen-, Außen- oder Privatbereich und sein Bezug zum Besuch.\noffer.facility [TEXT]: Ausstattung, Gegenstände, Geräte oder vorhandene Einrichtungen; Verfügbarkeit, eigenes Material, Leihe und Nutzung nicht gleichsetzen.\ntime.clock [CLOCK]: Konkrete Uhrzeit mit ihrem Bezug und Operator; Öffnung, Küchennutzung, Ankunft und spätestes Ende unterscheiden.\ntime.weekday [TEXT]: Genannter Wochentag; anhand der Referenz datieren, sofern vertretbar, ohne Uhrzeit zu erfinden.\ntime.date [DATE]: Gewünschtes Besuchs-/Verfügbarkeitsdatum; Referenzdatum ist ohne zeitlichen Nutzerbezug kein Besuchstag.\ntime.timezone [TEXT]: Zeitzone einer Zeitangabe; kein eigener Nutzerwunsch oder Termin.\nbudget.maximum [MONEY]: Verbindliche monetäre Obergrenze mit Währung, betroffenen Kosten und Bezugsumfang. Unter ist exklusiv, höchstens inklusiv; eine unbekannte Grenze bleibt unbekannt.\nbudget.coverage [TEXT]: Kostenbestandteile, die innerhalb der Budgetgrenze liegen sollen. Komponenten benennen; positive Abdeckung von ausdrücklich ausgenommenen Kosten unterscheiden.\nbudget.cost_treatment [TEXT]: Explizit zusätzliche oder ausgenommene Kostenbestandteile. Keine neue Kostengrenze aus einer Erläuterung erfinden.\noffer.kind [TEXT]: Art einer Einrichtung oder eines Angebots, z.B. Café, Restaurant, Museum. Zusammen genannte Einrichtungen in getrennten Fakten erhalten. Keine zusätzliche Aktivität aus einem Ortsnamen ableiten.\nfood.dish [TEXT]: Konkrete Speise oder Speisenwunsch, einschließlich mitgebrachter Speisen; Küche und Ernährungsbedingungen nicht aus einem Gericht pauschal ableiten.\nfood.quality [TEXT]: Qualität der Speisen oder Zutaten, nicht Tätigkeit Essen gehen, Anlass oder Restaurantatmosphäre. Nur tatsächlich genannte Qualitätsmerkmale.\nfood.diet [TEXT]: Ernährung, Zutaten, Verträglichkeit und Lebensmittelausschlüsse mit Personenbezug. Kein Fisch bedeutet nicht automatisch vegan.\nfood.meal_extent [TEXT]: Gewünschter Verpflegungsumfang: Kleinigkeit, Beilage, vollständige Mahlzeit usw. Nicht aus etwas essen ein vollständiges Menü machen.\noffer.feature [TEXT]: Besondere Angebotsmerkmale, die keine präzisere Katalogfamilie besitzen; Merkmal frei benennen und positive/negative Bedeutung bewahren.\nexperience.activity [TEXT]: Was die Person real tun oder erleben will, einschließlich Essen gehen. Eine Tätigkeit ist keine Speisenqualität. Konkreter Hauptwunsch verbindlich, außer er ist ausdrücklich offen oder optional.\ntime.clock_end [CLOCK]: Spätestes Ende, Abreise oder Rückkehr bzw. Ende der zeitlichen Verfügbarkeit; nicht mit spätestem Beginn verwechseln.\nfood.cuisine [TEXT]: Kulinarische Herkunft/Küchenrichtung; unbekannte Begriffe erhalten und nicht in nächstbeste Herkunft verwandeln.\nparticipation.partner [TEXT]: Erforderlicher mitgebrachter Partner oder Möglichkeit zur Einzelteilnahme. Allein anmelden bedeutet nicht zwingend allein ausüben.\npeople.relationship [TEXT]: Genannte Begleitbeziehung wie Freunde, Kollegen, Partner oder Familie. Diese Rolle zusätzlich zur Zahl erhalten; keine lange Personenliste erforderlich.\natmosphere.character [TEXT]: Gewünschte Atmosphäre wie ruhig oder gemütlich. Eigener Atmosphärenfakt, nicht im Tätigkeitsnamen verstecken. Konkretes Suchmerkmal REQUIRED; ausdrücklich optionales Merkmal PREFERRED.\ngeneric.suitability [TEXT]: Sonstige konkret beschriebene Eignung ohne passendere Fachfamilie; keine ungenannten Bedingungen aus Eignung erfinden.\nparticipation.format [TEXT]: Form der Teilnahme oder Durchführung, zum Beispiel Führung, selbstständig, passiv oder aktiv. Nicht erforderlich ist kein Verbot.\npeople.age [AGE]: Tatsächlich genanntes Alter der konkreten Person in YEARS. Auch bei knappen Entities einen typisierten Altersfakt mit Personenbezug ausgeben; Label allein genügt nicht. Kein Angebotsmindestalter daraus erzeugen.\ntime.original [TEXT]: Originale relative oder absolute Zeitformulierung unverändert erhalten, zusätzlich zur begründeten Normalisierung.\nbudget.scope [BUDGET_SCOPE]: Expliziter Kostenbezug als Scope-Daten: PER_PERSON, PER_CHILD, GROUP_TOTAL, PER_ITEM, COMPONENT_TOTAL oder UNSPECIFIED. Betroffene Gruppe/Personen separat referenzieren.\nparticipation.age_suitability [AGE]: Anforderungen an Alterszulassung oder kindbezogene Eignung eines Angebots; vom tatsächlichen Personenalter getrennt.\ntravel.mode [TEXT]: Fortbewegungs-/Anreiseart oder vorhandene Mobilität; kein konkretes Fahrzeug aus mobil erfinden.\nlocation.area [TEXT]: Gesuchtes Gebiet oder Umgebung ohne erfundenen Radius.\ntime.day_phase [DAY_PHASE]: Genannte Tagesphase wie Abend oder Nachmittag ohne erfundene Uhrzeitgrenzen.\nparticipation.accessibility [TEXT]: Konkrete Zugänglichkeit für benannte Bedürfnisse, Wege oder Hilfsmittel; Kinderwagen und Rollstuhl nicht gleichsetzen.\nparticipation.prerequisite [TEXT]: Voraussetzungen und Zugangsvorschriften wie Erfahrung, Hotelgaststatus, Bekleidung oder Mitgliedschaft, samt erforderlichem/nicht erforderlichem Status.\nbudget.target [MONEY]: Ungefährer Preis-/Budgetrichtwert, keine harte Obergrenze ohne entsprechende Aussage.\nbudget.flexibility [TEXT]: Preisspielraum, Toleranz, Kostenpriorität und akzeptierte Aufpreise; keine eigene Prozent- oder Betragsgrenze erfinden.\ncondition.weather [WEATHER]: Externer Wetterauslöser, ausschließlich in weatherConditions. Nie Auswahlpräferenz, Angebotsmerkmal oder FACT. Jeder Auslöser wird als IF.conditionFactId mit seiner Folge verbunden.\nexperience.theme [TEXT]: Interesse, Thema oder inhaltlicher Bezug des Erlebnisses; Personenbezug und Pflicht/Präferenz bewahren.\ngeneric.exclusion [TEXT]: Sonstiges klar beschriebenes Ausschlussobjekt ohne passendere Fachfamilie. EXCLUDED beschreibt das ausgeschlossene Objekt positiv, nicht als Doppelnegation.\nparticipation.booking [TEXT]: Anmeldung, Buchung, Reservierung, Terminvereinbarung und Planungsvorlauf; keine Anmeldung bedeutet nicht automatisch kostenlos.\ntime.duration [DURATION]: Zeitmenge in MINUTES mit Operator und exakt benanntem Umfang (verfügbare Gesamtzeit, reine Aktivität, Gehzeit, Anreise oder Rückweg). Niemals Kilometer, Meter, Geld oder Anzahl; diese benötigen andere Schlüssel.\nlocation.setting [TEXT]: Räumliche Umgebung oder Lage, zum Beispiel am Wasser oder im Grünen; Nähe ist kein Beleg für Aussicht.\ncondition.difficulty [TEXT]: Gewünschte/ausgeschlossene Schwierigkeit, Anstrengung oder Belastung, ohne erfundene Schwellen.\ncondition.terrain [TEXT]: Wegoberfläche, Steigung oder Streckenbeschaffenheit; keine pauschale Mobilitätseinschränkung daraus ableiten.\ncondition.animals [TEXT]: Tierhaltung, Tierkontakt, Tierzugang oder Mitnahme von Begleittieren, jeweils mit Tier- und Bereichsbezug.\nlocation.proximity [TEXT]: Qualitative Nähe mit Bezugspunkt, z.B. bei Bern oder nahe Bahnhof. Numerische Distanzen gehören nach location.distance; Aktivitätsstrecken nach route.length.\nlocation.view [TEXT]: Gewünschte Aussicht/Sicht auf ein benanntes Objekt. Nähe allein erfüllt einen Sichtwunsch nicht.\npeople.experience [TEXT]: Erfahrungsniveau oder bisherige Erfahrung einer Person; Anforderungen an das Angebot separat ausdrücken.\ntime.clock_start [CLOCK]: Frühester oder gewünschter Beginn bzw. Beginn eines Zeitfensters; ab und nach sowie genaue und ungefähre Uhrzeit unterscheiden.\nparticipation.language [TEXT]: Sprache, Originalfassung, Untertitel oder Verständlichkeit mit Bezug zum Programm bzw. Person; Ausnahmen für sprachlose Programme ausdrücklich verknüpfen.\nexperience.character [TEXT]: Erlebnischarakter, Besonderheit oder Anlasspassung, ohne aus subjektiven Wünschen neue harte Kategorien zu erfinden.\ncondition.exposure [TEXT]: Höhenexposition, ausgesetzte Stellen oder gewünschte Höhenbegrenzung; unklare quantitative Grenze nicht erfinden.\ncondition.water [TEXT]: Erforderlicher/ausgeschlossener Kontakt oder Aufenthalt im Wasser; Wassernähe bedeutet nicht ins Wasser gehen.\ncondition.children [TEXT]: Zugang von Kindern bzw. kinderfreier Bereich; nicht von einem Bereich auf den ganzen Betrieb ausdehnen.\ntime.relation [TEXT]: Zeitliche Beziehung, Reihenfolge, Gleichzeitigkeit oder zeitliche Abgrenzung zwischen Vorgängen. Ohne Nutzerwunsch keinen Mehrstationenplan erstellen.\natmosphere.conversation [TEXT]: Unterhalten können oder Stillepflicht; ruhige Atmosphäre ist nicht automatisch Schweigepflicht.\natmosphere.bustle [TEXT]: Lautstärke, Trubel oder Betriebsamkeit; Präferenz nicht ohne Grundlage zum Verbot verschärfen.\nexperience.purpose [TEXT]: Zweck oder gewünschter Nutzen des Besuchs, unabhängig von konkreter Aktivitätsart.\natmosphere.music [TEXT]: Musikmerkmal. Bei Musikverbot EXCLUDED mit positiv benanntem Musikobjekt; nie REQUIRED mit negativem Text. Ohne Pflicht NOT_REQUIRED, ausdrücklich optional PREFERRED.\natmosphere.privacy [TEXT]: Privatsphäre oder ungestörtes Zusammensitzen; kein eigener Raum ohne entsprechenden Wunsch nötig.\noffer.misc_extra [TEXT]: Weitere konkret benannte Angebots-/Teilnahmebedingungen wie Genre, Sitzplatz, Anleitung oder Feuermöglichkeit. Inhalt offen und Geltungsbereich präzise.\ntime.clock_bounds [CLOCK]: Besondere Uhrzeitgrenzen, wenn Start/Ende nicht passend sind; Grenze und betroffene Tätigkeit ausdrücklich benennen.\nfood.option [TEXT]: Zusätzliche Essens-/Getränkeoption, Menüform oder spezifische Verpflegungsoption; freiwillige Ergänzung nicht erzwingen.\nlocation.return [TEXT]: Erforderlicher Rückkehrort, zum Beispiel Bahnhof, nicht automatisch Beginn oder Ziel des Erlebnisses.\ntime.reference [TEXT]: Nur Referenzmetadatum, kein Nutzerwunsch. Normalerweise nicht als Fakt ausgeben; das Referenzdatum ohne Zeitbezug der Anfrage nicht zum Besuchsdatum machen.\natmosphere.scale [TEXT]: Gewünschte Größe, Intimität oder Angebotsumfang, samt Gegenstand: Veranstaltung, Gruppe, Degustation usw.\nparticipation.permission [TEXT]: Erlaubte Nutzung, eigenes Mitbringen oder Selbsttätigkeit, zum Beispiel Torte mitbringen, Fotografieren oder eigenes Sammeln.\noffer.service [TEXT]: Dienstleistung oder Betreuung, die zum Erlebnis gehören soll; Umfang und benötigte Person benennen.\nfood.delivery [TEXT]: Abholung, Lieferung oder Essen vor Ort; Lieferausschluss bedeutet nicht automatisch Ausschluss jeder Abholmöglichkeit.\nlocation.transport_after_visit [TEXT]: Anreise-/Rückreiseanforderung nach dem Besuch; nicht selbst fahren und Bahnhofnähe sind unterschiedliche Angaben.\noffer.concept_detail [TEXT]: Spezielles Angebotskonzept oder Darbietungsform, frei benannt; nicht auf die gesamte Spotkategorie ausdehnen.\nfood.preparation [TEXT]: Art, Ort oder aktive Beteiligung bei der Zubereitung; am Tisch selbst kochen ist kein gewöhnlicher Kochkurs.\npeople.pet [TEXT]: Mitgebrachtes Begleittier mit Art und Teilnahmebezug; Tierzugang separat als Bedingung angeben.\natmosphere.noise [TEXT]: Störgeräusche oder laute Programme; ihre Abwesenheit ist nicht automatisch absolute Stille.\nranking.requested_evidence [TEXT]: Ausdrücklicher Nutzerwunsch zur Begründung/Auswahl, zum Beispiel Sterne nicht als einzigen Grund benutzen; kein Spotranking durchführen.\ntime.date_start [DATE]: Erster Tag eines Datumsintervalls, nicht automatisch Beginn einer mehrtägigen Buchung.\ntime.date_end [DATE]: Letzter Tag eines Datumsintervalls, nicht automatisch Aufenthaltsdauer.\nparticipation.group_access [TEXT]: Zulassung/Mitnahme aller oder benannter Gruppenmitglieder beim Angebot; individuelle Bedürfnisse ändern nicht automatisch die Teilnehmerliste.\nparticipation.group_compatibility [TEXT]: Gemeinsame Nutzung desselben Angebots durch die Gruppe, nicht zwingend identische Leistung für jede Person.\npeople.identity [TEXT]: Genannte Person oder Name mit Referenz, ohne ungenannte persönliche Eigenschaften.\npeople.role [TEXT]: Rolle einer Person innerhalb der Gruppe oder des Anlasses; Rolle ist kein Alter.\natmosphere.freedom [TEXT]: Bewegungsfreiheit oder Einschränkungen wie langes stilles Sitzen; Bezugsgruppe ausdrücklich angeben.\npeople.age_bounds [AGE]: Explizite Altersgrenze/-spanne von Personen in YEARS mit Operator. Nicht mit Zulassungsalter eines Angebots verwechseln. Kein ungenanntes genaues Alter erfinden.\noffer.shade [TEXT]: Beschattung des genutzten Bereichs; nicht automatisch Innenraum oder völliger Regenschutz.\noffer.access [TEXT]: Art des Zugangs zu einem Bereich/Angebot, zum Beispiel Innenbesichtigung oder frei zugänglicher Ort; frei zugänglich bedeutet nicht immer kostenlos.\nparticipation.entry_mode [TEXT]: Teilnahmeart, festes Programm oder spontane/eigenständige Nutzung; kein fixes Programm erforderlich bedeutet kein Programmausschluss.\nlocation.waterbody [TEXT]: Benanntes Gewässer wie Rhein oder See; See und Fluss nicht stillschweigend austauschen.\npeople.mobility_aid [TEXT]: Mitgebrachtes Hilfsmittel oder besondere Fortbewegung einer Person, nicht automatisch vollständige Eignung des Angebots.\nparticipation.expertise [TEXT]: Erforderliche fachkundige Begleitung, Anleitung oder Expertise; Bezug zur Tätigkeit festhalten.\ncondition.water_activity [TEXT]: Wasserbezogene Tätigkeit oder Gerät als Angebotsmerkmal; nicht mit dem geografischen Ort Baden verwechseln.\ncondition.snow [TEXT]: Schnee oder konkrete Schneebedingung für ein Erlebnis; keine aktuelle Schneelage ohne Daten behaupten.\nlocation.area_type [TEXT]: Gebietstyp oder räumliche Einordnung, ohne konkrete Ortserweiterung zu erfinden.\ncondition.activity_exclusion [TEXT]: Ausgeschlossenes Bestandteil, Streckentyp oder Element einer Tätigkeit, ohne die gesamte Tätigkeit unnötig zu verbieten.\nbudget.amount [MONEY]: Geldbetrag ohne bestimmbaren Richtwert-/Grenzoperator; Unklarheit nicht durch willkürliche Obergrenze lösen.\nparticipation.consumption_obligation [TEXT]: Kauf-, Konsum- oder Mindestbestellpflicht; Ausschluss einer Pflicht ist kein Verbot freiwilligen Konsums.\noffer.equipment_source [TEXT]: Herkunft von Ausrüstung: mitgebracht, vorhanden, gemietet, geliehen oder gestellt; Leihe nicht automatisch kostenlos.\ntime.special [TEXT]: Spezielle Zeitbedingungen wie Öffnung, Pausen oder Verfügbarkeit; mit genauem Bezug und nicht als zusätzliche Aktivität.\nexperience.creator [TEXT]: Gewünschte Merkmale der Autorinnen, Vortragenden oder Kunstschaffenden eines Programms, nicht Eigenschaften der Teilnehmenden.\nexperience.outcome [TEXT]: Gewünschtes Ergebnis oder Lernziel einer Aktivität; Herstellung und Betrachtung nicht gleichsetzen.\noffer.result_delivery [TEXT]: Mitnahme, Abholung, Versand oder spätere Übergabe eines Ergebnisses; Zeitpunkt und Zusatzkosten erhalten.\nparticipation.requirement [TEXT]: Sonstige Teilnahmevoraussetzungen oder Unterstützung, etwa keine Bühnenpflicht oder erforderliche Einführung.\noffer.dimension [LENGTH]: Physische Abmessung einer Einrichtung, z.B. Länge einer Schwimmbahn. Keine Streckenlänge einer Aktivität und keine Reiseentfernung. Normalisiert in METERS.\noffer.quantity [COUNT]: Anzahl benötigter Einrichtungen/Gegenstände, nicht Anzahl der Personen; Objekt und Bezugsgruppe nennen.\ncondition.weather_protection [TEXT]: Art des Witterungsschutzes eines Angebots/Bereichs, z.B. überdacht. Kein tatsächlicher Niederschlag und kein Wetterauslöser.\npeople.participation [TEXT]: Gewünschte Teilnahmeweise einer Person: aktiv, zuschauend oder wartend; keine automatische Gruppenänderung.\nlocation.country [TEXT]: Genanntes oder begründet zugeordnetes Land; von konkretem Zielort unterscheiden.\noffer.usage [TEXT]: Art der gemeinsamen oder individuellen Nutzung einer Einrichtung, zum Beispiel eine Bahn für alle.\nfood.meal [TEXT]: Benötigte oder optionale Essensmöglichkeit, wenn keine präzisere Speise/Umfangsangabe vorliegt.\npeople.capability [TEXT]: Ausdrücklich genannte Fähigkeit einer Person, zum Beispiel schwimmen können; keine Fähigkeit aus Aktivitätswunsch ableiten.\noffer.temperature [TEXT]: Gewünschte Temperatur eines benannten Bereichs/Mediums, zum Beispiel warmes Wasser, ohne erfundene Gradzahl.\nbudget.payment_mode [TEXT]: Gewünschtes Zahlungsmodell wie Einmalzahlung oder Einzelbuchung, nicht Geldbetrag.\nparticipation.subscription [TEXT]: Abonnement- oder Vertragsbindung und ihre Akzeptanz; einmalig teilnehmen ist kein langfristiges Abo.\natmosphere.crowding [TEXT]: Gewünschte Auslastung oder Menschenmenge; nicht automatisch private/exklusive Nutzung.\noffer.treatment [TEXT]: Gewünschte/ausgeschlossene Behandlung und Körperbezug, ohne Vollbehandlung aus Teilbehandlung abzuleiten.\natmosphere.disturbance [TEXT]: Ungestörtheit, wirksame räumliche Abgrenzung oder störungsfreier Bereich, nicht automatisch gesamter Betrieb ohne andere Gäste.\nexperience.sequence [TEXT]: Ausdrücklich gewünschter oder ausgeschlossener Ablauf; keine feste Besuchsroute ohne Auftrag erfinden.\noffer.combination [TEXT]: Benötigte Kombination oder gleichwertige Alternative innerhalb eines Angebots, nicht jede Alternative gleichzeitig erzwingen.\natmosphere.competition [TEXT]: Wettbewerbscharakter und dessen Verbindlichkeit; nicht erforderlich ist kein vollständiger Wettbewerbsausschluss.\noffer.capacity [COUNT]: Benötigte nutzbare Kapazität für eine bestimmte Gruppe, nicht tatsächlich verfügbare Plätze eines ungeprüften Spots.\nbudget.qualitative [TEXT]: Qualitativer Preiswunsch ohne Zahl, zum Beispiel nicht übertrieben teuer; keine Geldgrenze erfinden.\nroute.length [LENGTH]: Länge der ausgeübten Runde/Strecke selbst. Keine Anreiseentfernung und keine Gehzeit. Normalisiere Kilometer in Meter.\nlocation.distance [LENGTH]: Quantifizierte Entfernung zwischen zwei Bezugspunkten. subjectIds benennt ausdrücklich das Ziel/den Startpunkt, referenceEntityId den Bezugspunkt. Keine Aktivitätsstreckenlänge oder Zeit; Kilometer in Meter normalisieren.\noffer.weather_suitability [TEXT]: Geforderte Eignung für Regen oder anderes Wetter, nicht Behauptung tatsächlichen Wetters. Schutzbedarf und Bereich ausdrücklich benennen.\ntime.duration_quality [TEXT]: Qualitative Dauer eines Besuchs oder einer Aktivität ohne genannte Zahl. Den qualitativen Wunsch erhalten, keine Minuten erfinden. subjectIds benennt den betroffenen Besuch oder die Aktivität. Nicht Terminfenster oder Uhrzeit.";
export const LUNA_LIBRARIAN_MODEL_SCHEMA: Readonly<Record<string, unknown>> = deepFreeze({
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "entities": {
      "type": "array",
      "items": {
        "$ref": "#/$defs/entity"
      }
    },
    "facts": {
      "type": "array",
      "items": {
        "$ref": "#/$defs/fact"
      }
    },
    "logic": {
      "anyOf": [
        {
          "$ref": "#/$defs/expression"
        },
        {
          "type": "null"
        }
      ]
    },
    "bindings": {
      "type": "array",
      "items": {
        "$ref": "#/$defs/binding"
      }
    },
    "extensions": {
      "type": "array",
      "items": {
        "$ref": "#/$defs/extension"
      }
    },
    "uncertainties": {
      "type": "array",
      "items": {
        "$ref": "#/$defs/uncertainty"
      }
    },
    "weatherConditions": {
      "type": "array",
      "items": {
        "$ref": "#/$defs/weatherCondition"
      }
    }
  },
  "required": [
    "entities",
    "facts",
    "logic",
    "bindings",
    "extensions",
    "uncertainties",
    "weatherConditions"
  ],
  "$defs": {
    "modality": {
      "type": "string",
      "enum": [
        "REQUIRED",
        "PREFERRED",
        "EXCLUDED",
        "NOT_REQUIRED",
        "CONTEXT"
      ]
    },
    "basis": {
      "type": "string",
      "enum": [
        "EXPLICIT",
        "INFERRED"
      ]
    },
    "entity": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "id": {
          "type": "string"
        },
        "kind": {
          "type": "string",
          "enum": [
            "PERSON",
            "GROUP",
            "ANIMAL",
            "ACTIVITY",
            "AREA",
            "OFFER",
            "COST_COMPONENT",
            "PLACE"
          ]
        },
        "label": {
          "type": "string"
        },
        "members": {
          "type": "array",
          "items": {
            "type": "string"
          }
        }
      },
      "required": [
        "id",
        "kind",
        "label",
        "members"
      ]
    },
    "numericOperator": {
      "type": "string",
      "enum": [
        "EQ",
        "NEQ",
        "LT",
        "LTE",
        "GT",
        "GTE",
        "APPROX"
      ]
    },
    "countValue": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "amount": {
          "type": "integer",
          "minimum": 0
        },
        "operator": {
          "$ref": "#/$defs/numericOperator"
        },
        "unit": {
          "type": "string",
          "enum": [
            "PEOPLE",
            "ITEMS"
          ]
        }
      },
      "required": [
        "amount",
        "operator",
        "unit"
      ]
    },
    "ageValue": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "amount": {
          "type": "integer",
          "minimum": 0,
          "maximum": 130
        },
        "operator": {
          "$ref": "#/$defs/numericOperator"
        },
        "unit": {
          "type": "string",
          "enum": [
            "YEARS"
          ]
        }
      },
      "required": [
        "amount",
        "operator",
        "unit"
      ]
    },
    "moneyValue": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "amount": {
          "type": "number",
          "minimum": 0
        },
        "operator": {
          "$ref": "#/$defs/numericOperator"
        },
        "currency": {
          "type": "string",
          "enum": [
            "CHF",
            "EUR",
            "USD",
            "GBP",
            "UNSPECIFIED"
          ]
        }
      },
      "required": [
        "amount",
        "operator",
        "currency"
      ]
    },
    "durationValue": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "amount": {
          "type": "number",
          "minimum": 0
        },
        "operator": {
          "$ref": "#/$defs/numericOperator"
        },
        "unit": {
          "type": "string",
          "enum": [
            "MINUTES"
          ]
        },
        "measurementScope": {
          "type": "string",
          "enum": [
            "AVAILABLE_TOTAL",
            "ACTIVITY",
            "WALKING",
            "TRAVEL",
            "VISIT",
            "UNSPECIFIED"
          ]
        },
        "includes": {
          "type": "array",
          "items": {
            "type": "string",
            "enum": [
              "ACTIVITY",
              "TRAVEL",
              "RETURN",
              "PAUSES",
              "CHECK_IN",
              "UNSPECIFIED"
            ]
          }
        }
      },
      "required": [
        "amount",
        "operator",
        "unit",
        "measurementScope",
        "includes"
      ]
    },
    "lengthValue": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "amount": {
          "type": "number",
          "minimum": 0
        },
        "operator": {
          "$ref": "#/$defs/numericOperator"
        },
        "unit": {
          "type": "string",
          "enum": [
            "METERS"
          ]
        },
        "referenceEntityId": {
          "type": [
            "string",
            "null"
          ]
        }
      },
      "required": [
        "amount",
        "operator",
        "unit",
        "referenceEntityId"
      ]
    },
    "dateValue": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "date": {
          "type": "string",
          "pattern": "^\\d{4}-\\d{2}-\\d{2}$"
        },
        "operator": {
          "type": "string",
          "enum": [
            "EQ",
            "LT",
            "LTE",
            "GT",
            "GTE"
          ]
        },
        "timezone": {
          "type": "string"
        }
      },
      "required": [
        "date",
        "operator",
        "timezone"
      ]
    },
    "clockValue": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "time": {
          "type": "string",
          "pattern": "^(?:[01]\\d|2[0-3]):[0-5]\\d$"
        },
        "operator": {
          "type": "string",
          "enum": [
            "EQ",
            "LT",
            "LTE",
            "GT",
            "GTE",
            "APPROX"
          ]
        },
        "timezone": {
          "type": "string"
        }
      },
      "required": [
        "time",
        "operator",
        "timezone"
      ]
    },
    "weatherValue": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "state": {
          "type": "string",
          "enum": [
            "RAIN",
            "DRY",
            "SNOW",
            "SUITABLE",
            "UNSUITABLE",
            "OTHER"
          ]
        },
        "detail": {
          "type": [
            "string",
            "null"
          ]
        }
      },
      "required": [
        "state",
        "detail"
      ]
    },
    "phaseValue": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "phase": {
          "type": "string",
          "enum": [
            "MORNING",
            "MIDDAY",
            "AFTERNOON",
            "EVENING",
            "NIGHT"
          ]
        },
        "timezone": {
          "type": "string"
        }
      },
      "required": [
        "phase",
        "timezone"
      ]
    },
    "budgetScopeValue": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "scope": {
          "type": "string",
          "enum": [
            "PER_PERSON",
            "PER_CHILD",
            "GROUP_TOTAL",
            "PER_ITEM",
            "COMPONENT_TOTAL",
            "UNSPECIFIED"
          ]
        }
      },
      "required": [
        "scope"
      ]
    },
    "textValue": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "text": {
          "type": "string"
        }
      },
      "required": [
        "text"
      ]
    },
    "fact": {
      "anyOf": [
        {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "id": {
              "type": "string"
            },
            "modality": {
              "$ref": "#/$defs/modality"
            },
            "basis": {
              "$ref": "#/$defs/basis"
            },
            "subjectIds": {
              "type": "array",
              "items": {
                "type": "string"
              }
            },
            "key": {
              "type": "string",
              "enum": [
                "people.count",
                "offer.quantity",
                "offer.capacity"
              ]
            },
            "value": {
              "$ref": "#/$defs/countValue"
            }
          },
          "required": [
            "id",
            "modality",
            "basis",
            "subjectIds",
            "key",
            "value"
          ]
        },
        {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "id": {
              "type": "string"
            },
            "modality": {
              "$ref": "#/$defs/modality"
            },
            "basis": {
              "$ref": "#/$defs/basis"
            },
            "subjectIds": {
              "type": "array",
              "items": {
                "type": "string"
              }
            },
            "key": {
              "type": "string",
              "enum": [
                "people.age",
                "participation.age_suitability",
                "people.age_bounds"
              ]
            },
            "value": {
              "$ref": "#/$defs/ageValue"
            }
          },
          "required": [
            "id",
            "modality",
            "basis",
            "subjectIds",
            "key",
            "value"
          ]
        },
        {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "id": {
              "type": "string"
            },
            "modality": {
              "$ref": "#/$defs/modality"
            },
            "basis": {
              "$ref": "#/$defs/basis"
            },
            "subjectIds": {
              "type": "array",
              "items": {
                "type": "string"
              }
            },
            "key": {
              "type": "string",
              "enum": [
                "budget.maximum",
                "budget.target",
                "budget.amount"
              ]
            },
            "value": {
              "$ref": "#/$defs/moneyValue"
            }
          },
          "required": [
            "id",
            "modality",
            "basis",
            "subjectIds",
            "key",
            "value"
          ]
        },
        {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "id": {
              "type": "string"
            },
            "modality": {
              "$ref": "#/$defs/modality"
            },
            "basis": {
              "$ref": "#/$defs/basis"
            },
            "subjectIds": {
              "type": "array",
              "items": {
                "type": "string"
              }
            },
            "key": {
              "type": "string",
              "enum": [
                "time.duration"
              ]
            },
            "value": {
              "$ref": "#/$defs/durationValue"
            }
          },
          "required": [
            "id",
            "modality",
            "basis",
            "subjectIds",
            "key",
            "value"
          ]
        },
        {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "id": {
              "type": "string"
            },
            "modality": {
              "$ref": "#/$defs/modality"
            },
            "basis": {
              "$ref": "#/$defs/basis"
            },
            "subjectIds": {
              "type": "array",
              "items": {
                "type": "string"
              }
            },
            "key": {
              "type": "string",
              "enum": [
                "offer.dimension",
                "route.length",
                "location.distance"
              ]
            },
            "value": {
              "$ref": "#/$defs/lengthValue"
            }
          },
          "required": [
            "id",
            "modality",
            "basis",
            "subjectIds",
            "key",
            "value"
          ]
        },
        {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "id": {
              "type": "string"
            },
            "modality": {
              "$ref": "#/$defs/modality"
            },
            "basis": {
              "$ref": "#/$defs/basis"
            },
            "subjectIds": {
              "type": "array",
              "items": {
                "type": "string"
              }
            },
            "key": {
              "type": "string",
              "enum": [
                "time.date",
                "time.date_start",
                "time.date_end"
              ]
            },
            "value": {
              "$ref": "#/$defs/dateValue"
            }
          },
          "required": [
            "id",
            "modality",
            "basis",
            "subjectIds",
            "key",
            "value"
          ]
        },
        {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "id": {
              "type": "string"
            },
            "modality": {
              "$ref": "#/$defs/modality"
            },
            "basis": {
              "$ref": "#/$defs/basis"
            },
            "subjectIds": {
              "type": "array",
              "items": {
                "type": "string"
              }
            },
            "key": {
              "type": "string",
              "enum": [
                "time.clock",
                "time.clock_end",
                "time.clock_start",
                "time.clock_bounds"
              ]
            },
            "value": {
              "$ref": "#/$defs/clockValue"
            }
          },
          "required": [
            "id",
            "modality",
            "basis",
            "subjectIds",
            "key",
            "value"
          ]
        },
        {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "id": {
              "type": "string"
            },
            "modality": {
              "$ref": "#/$defs/modality"
            },
            "basis": {
              "$ref": "#/$defs/basis"
            },
            "subjectIds": {
              "type": "array",
              "items": {
                "type": "string"
              }
            },
            "key": {
              "type": "string",
              "enum": [
                "time.day_phase"
              ]
            },
            "value": {
              "$ref": "#/$defs/phaseValue"
            }
          },
          "required": [
            "id",
            "modality",
            "basis",
            "subjectIds",
            "key",
            "value"
          ]
        },
        {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "id": {
              "type": "string"
            },
            "modality": {
              "$ref": "#/$defs/modality"
            },
            "basis": {
              "$ref": "#/$defs/basis"
            },
            "subjectIds": {
              "type": "array",
              "items": {
                "type": "string"
              }
            },
            "key": {
              "type": "string",
              "enum": [
                "budget.scope"
              ]
            },
            "value": {
              "$ref": "#/$defs/budgetScopeValue"
            }
          },
          "required": [
            "id",
            "modality",
            "basis",
            "subjectIds",
            "key",
            "value"
          ]
        },
        {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "id": {
              "type": "string"
            },
            "modality": {
              "$ref": "#/$defs/modality"
            },
            "basis": {
              "$ref": "#/$defs/basis"
            },
            "subjectIds": {
              "type": "array",
              "items": {
                "type": "string"
              }
            },
            "key": {
              "type": "string",
              "enum": [
                "food.drink",
                "experience.occasion",
                "location.destination",
                "time.window",
                "offer.area",
                "offer.facility",
                "time.weekday",
                "time.timezone",
                "budget.coverage",
                "budget.cost_treatment",
                "offer.kind",
                "food.dish",
                "food.quality",
                "food.diet",
                "food.meal_extent",
                "offer.feature",
                "experience.activity",
                "food.cuisine",
                "participation.partner",
                "people.relationship",
                "atmosphere.character",
                "generic.suitability",
                "participation.format",
                "time.original",
                "travel.mode",
                "location.area",
                "participation.accessibility",
                "participation.prerequisite",
                "budget.flexibility",
                "experience.theme",
                "generic.exclusion",
                "participation.booking",
                "location.setting",
                "condition.difficulty",
                "condition.terrain",
                "condition.animals",
                "location.proximity",
                "location.view",
                "people.experience",
                "participation.language",
                "experience.character",
                "condition.exposure",
                "condition.water",
                "condition.children",
                "time.relation",
                "atmosphere.conversation",
                "atmosphere.bustle",
                "experience.purpose",
                "atmosphere.music",
                "atmosphere.privacy",
                "offer.misc_extra",
                "food.option",
                "location.return",
                "time.reference",
                "atmosphere.scale",
                "participation.permission",
                "offer.service",
                "food.delivery",
                "location.transport_after_visit",
                "offer.concept_detail",
                "food.preparation",
                "people.pet",
                "atmosphere.noise",
                "ranking.requested_evidence",
                "participation.group_access",
                "participation.group_compatibility",
                "people.identity",
                "people.role",
                "atmosphere.freedom",
                "offer.shade",
                "offer.access",
                "participation.entry_mode",
                "location.waterbody",
                "people.mobility_aid",
                "participation.expertise",
                "condition.water_activity",
                "condition.snow",
                "location.area_type",
                "condition.activity_exclusion",
                "participation.consumption_obligation",
                "offer.equipment_source",
                "time.special",
                "experience.creator",
                "experience.outcome",
                "offer.result_delivery",
                "participation.requirement",
                "condition.weather_protection",
                "people.participation",
                "location.country",
                "offer.usage",
                "food.meal",
                "people.capability",
                "offer.temperature",
                "budget.payment_mode",
                "participation.subscription",
                "atmosphere.crowding",
                "offer.treatment",
                "atmosphere.disturbance",
                "experience.sequence",
                "offer.combination",
                "atmosphere.competition",
                "budget.qualitative",
                "offer.weather_suitability",
                "time.duration_quality"
              ]
            },
            "value": {
              "$ref": "#/$defs/textValue"
            }
          },
          "required": [
            "id",
            "modality",
            "basis",
            "subjectIds",
            "key",
            "value"
          ]
        }
      ]
    },
    "expression": {
      "anyOf": [
        {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "kind": {
              "type": "string",
              "enum": [
                "FACT"
              ]
            },
            "factId": {
              "type": "string"
            }
          },
          "required": [
            "kind",
            "factId"
          ]
        },
        {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "kind": {
              "type": "string",
              "enum": [
                "ALL"
              ]
            },
            "children": {
              "type": "array",
              "items": {
                "$ref": "#/$defs/expression"
              },
              "minItems": 1
            }
          },
          "required": [
            "kind",
            "children"
          ]
        },
        {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "kind": {
              "type": "string",
              "enum": [
                "ANY"
              ]
            },
            "strength": {
              "type": "string",
              "enum": [
                "REQUIRED",
                "PREFERRED"
              ]
            },
            "children": {
              "type": "array",
              "items": {
                "$ref": "#/$defs/expression"
              },
              "minItems": 2
            }
          },
          "required": [
            "kind",
            "strength",
            "children"
          ]
        },
        {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "kind": {
              "type": "string",
              "enum": [
                "IF"
              ]
            },
            "conditionFactId": {
              "type": "string"
            },
            "then": {
              "$ref": "#/$defs/expression"
            },
            "else": {
              "anyOf": [
                {
                  "$ref": "#/$defs/expression"
                },
                {
                  "type": "null"
                }
              ]
            }
          },
          "required": [
            "kind",
            "conditionFactId",
            "then",
            "else"
          ]
        },
        {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "kind": {
              "type": "string",
              "enum": [
                "FALLBACK"
              ]
            },
            "options": {
              "type": "array",
              "items": {
                "$ref": "#/$defs/expression"
              },
              "minItems": 2
            }
          },
          "required": [
            "kind",
            "options"
          ]
        }
      ]
    },
    "extension": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "id": {
          "type": "string"
        },
        "modality": {
          "$ref": "#/$defs/modality"
        },
        "basis": {
          "$ref": "#/$defs/basis"
        },
        "subjectIds": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "description": {
          "type": "string"
        }
      },
      "required": [
        "id",
        "modality",
        "basis",
        "subjectIds",
        "description"
      ]
    },
    "binding": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "kind": {
          "type": "string",
          "enum": [
            "SAME_PLACE",
            "SIMULTANEOUS",
            "SEQUENCE"
          ]
        },
        "factIds": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "minItems": 2
        }
      },
      "required": [
        "kind",
        "factIds"
      ]
    },
    "uncertainty": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "description": {
          "type": "string"
        },
        "relatedIds": {
          "type": "array",
          "items": {
            "type": "string"
          }
        }
      },
      "required": [
        "description",
        "relatedIds"
      ]
    },
    "weatherCondition": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "id": {
          "type": "string"
        },
        "basis": {
          "type": "string",
          "enum": [
            "EXPLICIT",
            "INFERRED"
          ]
        },
        "subjectIds": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "state": {
          "type": "string",
          "enum": [
            "RAIN",
            "DRY",
            "SNOW",
            "SUITABLE",
            "UNSUITABLE",
            "OTHER"
          ]
        },
        "detail": {
          "type": [
            "string",
            "null"
          ]
        }
      },
      "required": [
        "id",
        "basis",
        "subjectIds",
        "state",
        "detail"
      ]
    }
  }
});
export const LUNA_LIBRARIAN_CATALOG = deepFreeze({
  "version": "backyrd-luna-meaning-v7",
  "status": "FROZEN_EXPERIMENTAL_CONTRACT_NOT_DEPLOYED",
  "concepts": [
    {
      "key": "food.drink",
      "label": "Getränk",
      "definition": "Ein konsumierbares Getränk wie Kaffee, Tee, Bier oder Mocktail. Café, Bar, Restaurant und Museum sind Einrichtungen/Angebotsarten, keine Getränke; dafür offer.kind verwenden.",
      "observedAliases": [
        "Getränk",
        "Getränkeangebot",
        "gewünschtes Getränk",
        "Alkoholische Getränke",
        "Getränkeart",
        "Getränkequalität/-art",
        "Getränke"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "experience.occasion",
      "label": "Anlass",
      "definition": "Anlass des Besuchs oder der Feier; Anlass ist keine zwingende Veranstaltungsart und kein allgemeines Mindestalter.",
      "observedAliases": [
        "Anlass",
        "Anlassart"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "people.count",
      "label": "Personenzahl mit Gruppenbezug",
      "definition": "Anzahl der gesamten Gruppe oder einer benannten Teilgruppe. Bezugsgruppe und genaue Anzahl/Mindestanzahl ausdrücklich erhalten; Kinder, Erwachsene und Zuschauende nicht gleichsetzen.",
      "observedAliases": [
        "Anzahl Kollegen",
        "Mindestgruppengröße einschließlich Nutzerperson",
        "Personenanzahl",
        "Personenzahl",
        "Anzahl Erwachsene",
        "Anzahl Kinder",
        "Anzahl Babys",
        "Anzahl",
        "Teilnehmendenzahl",
        "anzahl_teilnehmende",
        "Personenzahl_gesamt",
        "Anzahl ausschließlich englischsprachiger Personen",
        "Teilnehmendenanzahl",
        "Mindestanzahl Personen",
        "Gruppengröße",
        "Kinderanzahl",
        "Eltern",
        "Kinder",
        "Anzahl Personen",
        "aktive Teilnehmende",
        "Zuschauende",
        "Gruppengröße auf einer Bahn",
        "personenzahl",
        "personenanzahl",
        "Freunde",
        "Teilnahmegruppe gesamt",
        "betroffene Personen",
        "Anzahl Freundinnen",
        "Gesamtgruppengröße einschließlich anfragender Person, sofern mitgezählt",
        "Gästeanzahl",
        "Anzahl Begleitpersonen"
      ],
      "valueKind": "COUNT"
    },
    {
      "key": "location.destination",
      "label": "Zielort oder Bezugsort",
      "definition": "Gesuchter Zielort oder benannter geografischer Bezugspunkt. Ein Ortsname ist keine Aktivität; insbesondere Baden in Ortsformulierungen bezeichnet den Ort.",
      "observedAliases": [
        "Ort",
        "Zielort",
        "ort",
        "Bezugspunkt",
        "Bezugsort",
        "Referenzort",
        "city"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "time.window",
      "label": "Zeitfenster oder Zeitraum",
      "definition": "Verfügbares oder gewünschtes Zeitfenster/Zeitraum mit Anfang, Ende und Umfang; relative Tageskontexte dürfen offen bleiben.",
      "observedAliases": [
        "Zeitfenster",
        "Zeitraum",
        "zeitliche Bedingung",
        "maximal verfügbares Zeitfenster",
        "Zeitbezug"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "offer.area",
      "label": "Nutzbarer Bereich",
      "definition": "Gewünschter nutzbarer Aufenthalts-, Sitz-, Innen-, Außen- oder Privatbereich und sein Bezug zum Besuch.",
      "observedAliases": [
        "Bereich",
        "Sitzbereich",
        "Sitzplatzlage",
        "Sitzplatzangebot",
        "Sitzmöglichkeit",
        "Konsumationsort",
        "Separater Raum",
        "Bereichsart",
        "Sitzplatzart",
        "Aufenthaltsbereich",
        "Bereichslage",
        "Outdoor-Möglichkeit",
        "Indoor-Möglichkeit",
        "Essbereich"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "offer.facility",
      "label": "Ausstattung",
      "definition": "Ausstattung, Gegenstände, Geräte oder vorhandene Einrichtungen; Verfügbarkeit, eigenes Material, Leihe und Nutzung nicht gleichsetzen.",
      "observedAliases": [
        "Ausstattung",
        "Materialbereitstellung",
        "Ausrüstung",
        "Ausstattungs- oder Angebotsmerkmal",
        "Beckenart",
        "Lage zur Ausstattung",
        "Eigene Kamera erforderlich",
        "Vorhandene Ausrüstung",
        "Eigene Kamera vorhanden",
        "Kameratyp",
        "Ausrüstung inklusive",
        "Anzahl Leihschläger",
        "Bereitgestellte Ausrüstung",
        "Helmquelle",
        "Ausrüstungsgegenstand",
        "Beckenkonfiguration",
        "Einrichtung",
        "WLAN",
        "Materialleihe verfügbar"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "time.clock",
      "label": "Uhrzeit mit noch zu bestimmendem Operator",
      "definition": "Konkrete Uhrzeit mit ihrem Bezug und Operator; Öffnung, Küchennutzung, Ankunft und spätestes Ende unterscheiden.",
      "observedAliases": [
        "warme_Küche_verfügbar_um",
        "Uhrzeit",
        "Zeitpunkt",
        "Zeitgrenze",
        "lokale Uhrzeit",
        "früheste erforderliche Uhrzeit"
      ],
      "valueKind": "CLOCK"
    },
    {
      "key": "time.weekday",
      "label": "Wochentag",
      "definition": "Genannter Wochentag; anhand der Referenz datieren, sofern vertretbar, ohne Uhrzeit zu erfinden.",
      "observedAliases": [
        "Wochentag",
        "wochentag"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "time.date",
      "label": "Besuchsdatum",
      "definition": "Gewünschtes Besuchs-/Verfügbarkeitsdatum; Referenzdatum ist ohne zeitlichen Nutzerbezug kein Besuchstag.",
      "observedAliases": [
        "Datum",
        "datum",
        "Verfügbarkeitstag"
      ],
      "valueKind": "DATE"
    },
    {
      "key": "time.timezone",
      "label": "Zeitzone",
      "definition": "Zeitzone einer Zeitangabe; kein eigener Nutzerwunsch oder Termin.",
      "observedAliases": [
        "Zeitzone",
        "zeitzone"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "budget.maximum",
      "label": "Budgetobergrenze",
      "definition": "Verbindliche monetäre Obergrenze mit Währung, betroffenen Kosten und Bezugsumfang. Unter ist exklusiv, höchstens inklusiv; eine unbekannte Grenze bleibt unbekannt.",
      "observedAliases": [
        "Maximalbetrag",
        "Maximalbudget",
        "Budgetobergrenze",
        "Budgetobergrenze_exklusiv",
        "Maximaler Gesamtpreis",
        "Kostenobergrenze",
        "Maximalpreis",
        "Eintrittspreis-Obergrenze",
        "Maximaler Eintrittspreis",
        "Preisobergrenze",
        "Kostenobergrenze_exklusiv",
        "Konkrete Budgetgrenze"
      ],
      "valueKind": "MONEY"
    },
    {
      "key": "budget.coverage",
      "label": "Kostenbestandteile",
      "definition": "Kostenbestandteile, die innerhalb der Budgetgrenze liegen sollen. Komponenten benennen; positive Abdeckung von ausdrücklich ausgenommenen Kosten unterscheiden.",
      "observedAliases": [
        "Budgetbestandteil",
        "Kostenbestandteil",
        "Ausrüstung im Budget enthalten",
        "Begleitung im Budget enthalten",
        "Anreise im Budget enthalten",
        "eingeschlossene Leistung",
        "Ausrüstung im Preis inbegriffen",
        "Leihkosten eingeschlossen"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "budget.cost_treatment",
      "label": "Behandlung zusätzlicher Kosten",
      "definition": "Explizit zusätzliche oder ausgenommene Kostenbestandteile. Keine neue Kostengrenze aus einer Erläuterung erfinden.",
      "observedAliases": [
        "Budgetbehandlung",
        "Kostenbehandlung",
        "Ausgeschlossener Kostenposten"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "offer.kind",
      "label": "Angebotsart",
      "definition": "Art einer Einrichtung oder eines Angebots, z.B. Café, Restaurant, Museum. Zusammen genannte Einrichtungen in getrennten Fakten erhalten. Keine zusätzliche Aktivität aus einem Ortsnamen ableiten.",
      "observedAliases": [
        "Angebot",
        "Betriebsart",
        "Angebotsart",
        "Ausgeschlossene Angebotsart",
        "Format",
        "Venue-Typ",
        "ausgeschlossene Angebotsform",
        "ausgeschlossener Angebotstyp",
        "Ortstyp",
        "bevorzugter Angebotscharakter",
        "Angebotsform",
        "Betriebskonzept",
        "Bar-Konzept",
        "Ausgeschlossenes Angebotsprofil",
        "Angebotsformat",
        "Erlebnisformat",
        "ausgeschlossenes_Format",
        "ausgeschlossenes Erlebnisformat"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "food.dish",
      "label": "Speise",
      "definition": "Konkrete Speise oder Speisenwunsch, einschließlich mitgebrachter Speisen; Küche und Ernährungsbedingungen nicht aus einem Gericht pauschal ableiten.",
      "observedAliases": [
        "gewünschte_Küche_oder_Speise",
        "Gericht",
        "Gerichtsart",
        "Speiseangebot",
        "Speise",
        "Speisenangebot",
        "erforderliches Speisenmerkmal",
        "Mitgebrachte Speise",
        "ausgeschlossenes Speisekonzept"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "food.quality",
      "label": "Qualitätswunsch",
      "definition": "Qualität der Speisen oder Zutaten, nicht Tätigkeit Essen gehen, Anlass oder Restaurantatmosphäre. Nur tatsächlich genannte Qualitätsmerkmale.",
      "observedAliases": [
        "Qualitätsniveau",
        "Qualitätsanspruch"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "food.diet",
      "label": "Ernährung und Zutaten",
      "definition": "Ernährung, Zutaten, Verträglichkeit und Lebensmittelausschlüsse mit Personenbezug. Kein Fisch bedeutet nicht automatisch vegan.",
      "observedAliases": [
        "ausgeschlossenes_Lebensmittel",
        "Fischanteil",
        "Alkoholkonsum",
        "Ernährungswunsch",
        "Ernährungsanforderung",
        "Ernährungsunverträglichkeit",
        "Verträglichkeit",
        "Alkohol",
        "Alkoholpräferenz",
        "Ernährungsangebot"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "food.meal_extent",
      "label": "Mahlzeitenumfang",
      "definition": "Gewünschter Verpflegungsumfang: Kleinigkeit, Beilage, vollständige Mahlzeit usw. Nicht aus etwas essen ein vollständiges Menü machen.",
      "observedAliases": [
        "Mahlzeitenart",
        "Mahlzeitenumfang",
        "Mahlzeitenoption",
        "Verpflegungsart"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "offer.feature",
      "label": "Offene Angebotsbesonderheit",
      "definition": "Besondere Angebotsmerkmale, die keine präzisere Katalogfamilie besitzen; Merkmal frei benennen und positive/negative Bedeutung bewahren.",
      "observedAliases": [
        "unzureichendes_Angebot",
        "Küchenkonzept",
        "Beobachtungsmöglichkeit",
        "Kücheneinblick",
        "ausgeschlossenes Substitut",
        "ausgeschlossenes Merkmal",
        "Ausgeschlossenes Angebot",
        "Zuschauposition",
        "Angebotsmerkmal",
        "Möglichkeit",
        "Verpflegungsangebot vor Ort",
        "Aufnahmetechnik",
        "Nutzung",
        "Ausgeschlossenes Angebotselement",
        "ausgeschlossenes Angebot"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "experience.activity",
      "label": "Gesuchte Tätigkeit",
      "definition": "Was die Person real tun oder erleben will, einschließlich Essen gehen. Eine Tätigkeit ist keine Speisenqualität. Konkreter Hauptwunsch verbindlich, außer er ist ausdrücklich offen oder optional.",
      "observedAliases": [
        "Erlebnisart",
        "Aktivität",
        "Aktivitätsart",
        "Teilnahmehandlung",
        "Erlaubte Aktivität",
        "Erlebnisarten",
        "Erlebnis",
        "Erlebnisform",
        "bevorzugte Aktivitätsart",
        "Aktivitätscharakter",
        "Tätigkeit",
        "Erlebnisstil",
        "Tiererlebnis",
        "erlaubte Tätigkeit",
        "gewünschte_Tätigkeit",
        "Erlebnisbestandteile",
        "Aktivität Tochter",
        "Aktivität begleitende Person",
        "Erlebnisziel"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "time.clock_end",
      "label": "Zeitfensterende oder spätestes Ende",
      "definition": "Spätestes Ende, Abreise oder Rückkehr bzw. Ende der zeitlichen Verfügbarkeit; nicht mit spätestem Beginn verwechseln.",
      "observedAliases": [
        "Verfügbar bis",
        "Endzeit",
        "Späteste Rückkehr"
      ],
      "valueKind": "CLOCK"
    },
    {
      "key": "food.cuisine",
      "label": "Küche",
      "definition": "Kulinarische Herkunft/Küchenrichtung; unbekannte Begriffe erhalten und nicht in nächstbeste Herkunft verwandeln.",
      "observedAliases": [
        "Küche"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "participation.partner",
      "label": "Partnerbedarf und Einzelteilnahme",
      "definition": "Erforderlicher mitgebrachter Partner oder Möglichkeit zur Einzelteilnahme. Allein anmelden bedeutet nicht zwingend allein ausüben.",
      "observedAliases": [
        "Besuchsform",
        "mitgebrachter Tanzpartner erforderlich"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "people.relationship",
      "label": "Beziehung und Zusammensetzung",
      "definition": "Genannte Begleitbeziehung wie Freunde, Kollegen, Partner oder Familie. Diese Rolle zusätzlich zur Zahl erhalten; keine lange Personenliste erforderlich.",
      "observedAliases": [
        "Begleitung",
        "Beziehung",
        "Personengruppe",
        "Begleitungsart",
        "Begleitpersonen",
        "Begleitung durch Säugling erlaubt",
        "Teilnehmendenkonstellation",
        "Gruppenkonstellation"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "atmosphere.character",
      "label": "Atmosphäre",
      "definition": "Gewünschte Atmosphäre wie ruhig oder gemütlich. Eigener Atmosphärenfakt, nicht im Tätigkeitsnamen verstecken. Konkretes Suchmerkmal REQUIRED; ausdrücklich optionales Merkmal PREFERRED.",
      "observedAliases": [
        "Atmosphäre",
        "Bereichscharakter",
        "Qualität der Atmosphäre",
        "gewünschte Qualität",
        "Ruhepräferenz",
        "Ausgeschlossene Eigenschaft",
        "ausgeschlossene Atmosphäre",
        "ausgeschlossenes Atmosphärenmerkmal"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "generic.suitability",
      "label": "Noch nicht fachlich zugeordnete Eignung",
      "definition": "Sonstige konkret beschriebene Eignung ohne passendere Fachfamilie; keine ungenannten Bedingungen aus Eignung erfinden.",
      "observedAliases": [
        "Eignung",
        "Geeignetheit",
        "altersbezogene_Eignung",
        "Gesprächseignung"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "participation.format",
      "label": "Teilnahmeform",
      "definition": "Form der Teilnahme oder Durchführung, zum Beispiel Führung, selbstständig, passiv oder aktiv. Nicht erforderlich ist kein Verbot.",
      "observedAliases": [
        "Teilnahmeform",
        "Führung",
        "Führung erforderlich",
        "Ausgeschlossenes Teilnahmeformat",
        "Teilnahmeformat",
        "Durchführungsart",
        "ausgeschlossene Veranstaltungsform",
        "ausgeschlossenes_Teilnahmeformat",
        "Durchführungsform",
        "Durchführungsort"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "people.age",
      "label": "Personenalter",
      "definition": "Tatsächlich genanntes Alter der konkreten Person in YEARS. Auch bei knappen Entities einen typisierten Altersfakt mit Personenbezug ausgeben; Label allein genügt nicht. Kein Angebotsmindestalter daraus erzeugen.",
      "observedAliases": [
        "Alter",
        "Altersbezug",
        "alter",
        "Alter_der_feiernden_Person",
        "Alter am Anlass",
        "Alter zum Anlass"
      ],
      "valueKind": "AGE"
    },
    {
      "key": "time.original",
      "label": "Originalzeitangabe",
      "definition": "Originale relative oder absolute Zeitformulierung unverändert erhalten, zusätzlich zur begründeten Normalisierung.",
      "observedAliases": [
        "Originalzeitangabe",
        "originale_Zeitangabe",
        "Originalangabe",
        "Originale Zeitangabe",
        "relative Datumsangabe"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "budget.scope",
      "label": "Kostenbezug",
      "definition": "Expliziter Kostenbezug als Scope-Daten: PER_PERSON, PER_CHILD, GROUP_TOTAL, PER_ITEM, COMPONENT_TOTAL oder UNSPECIFIED. Betroffene Gruppe/Personen separat referenzieren.",
      "observedAliases": [
        "Budgetumfang",
        "Preisumfang",
        "Budgetbezugsgröße",
        "Budgetbezug"
      ],
      "valueKind": "BUDGET_SCOPE"
    },
    {
      "key": "participation.age_suitability",
      "label": "Altersbezogene Teilnahme",
      "definition": "Anforderungen an Alterszulassung oder kindbezogene Eignung eines Angebots; vom tatsächlichen Personenalter getrennt.",
      "observedAliases": [
        "Altersgeeignetheit",
        "Zielgruppe innerhalb der Gruppe",
        "relevantes Kindesalter",
        "Geeignetes Alter",
        "geeignetes Alter",
        "ausgeschlossene Zielgruppe",
        "geeignetes Kindesalter",
        "geeignetes_Alter",
        "geeignetes Mindest- oder Zielalter",
        "Mindest- oder zugelassenes Alter",
        "Alterszugang"
      ],
      "valueKind": "AGE"
    },
    {
      "key": "travel.mode",
      "label": "Fortbewegung",
      "definition": "Fortbewegungs-/Anreiseart oder vorhandene Mobilität; kein konkretes Fahrzeug aus mobil erfinden.",
      "observedAliases": [
        "Fortbewegung",
        "Fortbewegungsart",
        "Verkehrsmittel/Infrastruktur",
        "Verkehrsmittel",
        "Mobilität"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "location.area",
      "label": "Suchgebiet",
      "definition": "Gesuchtes Gebiet oder Umgebung ohne erfundenen Radius.",
      "observedAliases": [
        "Zielgebiet"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "time.day_phase",
      "label": "Tageszeit",
      "definition": "Genannte Tagesphase wie Abend oder Nachmittag ohne erfundene Uhrzeitgrenzen.",
      "observedAliases": [
        "Tageszeit"
      ],
      "valueKind": "DAY_PHASE"
    },
    {
      "key": "participation.accessibility",
      "label": "Zugänglichkeit",
      "definition": "Konkrete Zugänglichkeit für benannte Bedürfnisse, Wege oder Hilfsmittel; Kinderwagen und Rollstuhl nicht gleichsetzen.",
      "observedAliases": [
        "Zugänglichkeit",
        "Barrierefreiheitsmerkmal",
        "Rollator-Eignung",
        "Barrierearme Zugänglichkeit",
        "Treppen"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "participation.prerequisite",
      "label": "Voraussetzungen",
      "definition": "Voraussetzungen und Zugangsvorschriften wie Erfahrung, Hotelgaststatus, Bekleidung oder Mitgliedschaft, samt erforderlichem/nicht erforderlichem Status.",
      "observedAliases": [
        "Teilnahmebedingung",
        "Übernachtung erforderlich",
        "Zugang für Nicht-Hotelgäste",
        "Zugang nur für Hotelgäste",
        "Kleiderordnung",
        "Vorkenntnisse erforderlich",
        "Zielgruppe",
        "ausgeschlossene Teilnahmevoraussetzung",
        "Vereinsmitgliedschaft erforderlich",
        "Bekleidungsregel"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "budget.target",
      "label": "Budgetrichtwert",
      "definition": "Ungefährer Preis-/Budgetrichtwert, keine harte Obergrenze ohne entsprechende Aussage.",
      "observedAliases": [
        "Budgetrahmen",
        "Zielpreis",
        "Preisrahmen",
        "Budgetrichtwert"
      ],
      "valueKind": "MONEY"
    },
    {
      "key": "budget.flexibility",
      "label": "Preisspielraum",
      "definition": "Preisspielraum, Toleranz, Kostenpriorität und akzeptierte Aufpreise; keine eigene Prozent- oder Betragsgrenze erfinden.",
      "observedAliases": [
        "Budgetart",
        "Preisflexibilität",
        "Preispräferenz",
        "Budgetpriorität",
        "Preisrelation",
        "Kostenakzeptanz"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "condition.weather",
      "label": "Wetterbedingung und Wettereignung",
      "definition": "Externer Wetterauslöser, ausschließlich in weatherConditions. Nie Auswahlpräferenz, Angebotsmerkmal oder FACT. Jeder Auslöser wird als IF.conditionFactId mit seiner Folge verbunden.",
      "observedAliases": [
        "Wettertauglichkeit",
        "Aufenthalt im Freien",
        "Wetter",
        "Wetterlage",
        "Wetterbedingung",
        "Wetterprognose",
        "Wetterzustand"
      ],
      "valueKind": "WEATHER"
    },
    {
      "key": "experience.theme",
      "label": "Thema oder Interesse",
      "definition": "Interesse, Thema oder inhaltlicher Bezug des Erlebnisses; Personenbezug und Pflicht/Präferenz bewahren.",
      "observedAliases": [
        "Tierbezug",
        "Technikbezug",
        "Erlebnisfokus",
        "Interesse",
        "Angebotsbezug",
        "Thema",
        "Thematischer Bezug",
        "ausgeschlossenerAngebotsbezug"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "generic.exclusion",
      "label": "Noch nicht fachlich zugeordnetes Ausschlussobjekt",
      "definition": "Sonstiges klar beschriebenes Ausschlussobjekt ohne passendere Fachfamilie. EXCLUDED beschreibt das ausgeschlossene Objekt positiv, nicht als Doppelnegation.",
      "observedAliases": [
        "ausgeschlossene_alleinige_Aktivität",
        "ausgeschlossene Aktivität",
        "Ausgeschlossene Aktivität"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "participation.booking",
      "label": "Anmeldung und Terminvereinbarung",
      "definition": "Anmeldung, Buchung, Reservierung, Terminvereinbarung und Planungsvorlauf; keine Anmeldung bedeutet nicht automatisch kostenlos.",
      "observedAliases": [
        "anmeldung",
        "Vorab-Terminvereinbarung",
        "Reservierung",
        "Voranmeldung",
        "Anmeldungsform",
        "Tanzpartner bei Anmeldung",
        "Ausgeschlossenes Buchungsmodell",
        "Planungsvorlauf",
        "Voranmeldung/Buchung"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "time.duration",
      "label": "Dauer mit Umfang und Operator",
      "definition": "Zeitmenge in MINUTES mit Operator und exakt benanntem Umfang (verfügbare Gesamtzeit, reine Aktivität, Gehzeit, Anreise oder Rückweg). Niemals Kilometer, Meter, Geld oder Anzahl; diese benötigen andere Schlüssel.",
      "observedAliases": [
        "Maximale Dauer",
        "Dauer",
        "maximale Gesamtdauer",
        "Aufenthaltsdauer",
        "Maximale verfügbare Dauer",
        "Dauer der Nutzung",
        "Maximaldauer",
        "ausgeschlossene Fahrtdauer",
        "maximale reine Gehzeit",
        "Dauerumfang",
        "maximale Gehzeit",
        "Maximale Gesamtdauer",
        "maximale Dauer",
        "Maximale Gesamtdauer inklusive Rückweg",
        "Zeitfensterdauer",
        "maximale Fusswegdauer",
        "Fahrtdauer"
      ],
      "valueKind": "DURATION"
    },
    {
      "key": "location.setting",
      "label": "Umgebung und Lage",
      "definition": "Räumliche Umgebung oder Lage, zum Beispiel am Wasser oder im Grünen; Nähe ist kein Beleg für Aussicht.",
      "observedAliases": [
        "Umgebung",
        "Lagebezug",
        "Lage",
        "Lagebeziehung"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "condition.difficulty",
      "label": "Schwierigkeit und Belastung",
      "definition": "Gewünschte/ausgeschlossene Schwierigkeit, Anstrengung oder Belastung, ohne erfundene Schwellen.",
      "observedAliases": [
        "Schwierigkeitsgrad",
        "ausgeschlossener Schwierigkeitsgrad"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "condition.terrain",
      "label": "Wegbeschaffenheit",
      "definition": "Wegoberfläche, Steigung oder Streckenbeschaffenheit; keine pauschale Mobilitätseinschränkung daraus ableiten.",
      "observedAliases": [
        "Wegneigung",
        "Wegbeschaffenheit",
        "Untergrundpräferenz"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "condition.animals",
      "label": "Tierhaltung und Tierzugang",
      "definition": "Tierhaltung, Tierkontakt, Tierzugang oder Mitnahme von Begleittieren, jeweils mit Tier- und Bereichsbezug.",
      "observedAliases": [
        "Haltungsform",
        "Hundeerlaubnis",
        "Haustierregelung",
        "Direkter Tierkontakt",
        "Hundemitnahme",
        "Haustier-Mitnahme"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "location.proximity",
      "label": "Räumliche Beziehung oder Nähe",
      "definition": "Qualitative Nähe mit Bezugspunkt, z.B. bei Bern oder nahe Bahnhof. Numerische Distanzen gehören nach location.distance; Aktivitätsstrecken nach route.length.",
      "observedAliases": [
        "Nähe",
        "räumliche Nähe",
        "Entfernung",
        "Nähe zu",
        "räumliche Beziehung",
        "Ortsbeziehung",
        "Maximale Distanz",
        "Distanzanforderung",
        "räumlicheRelation",
        "Distanzbezug"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "location.view",
      "label": "Ausblick",
      "definition": "Gewünschte Aussicht/Sicht auf ein benanntes Objekt. Nähe allein erfüllt einen Sichtwunsch nicht.",
      "observedAliases": [
        "gewünschte Aussicht",
        "Sichtbezug",
        "Aussicht",
        "Ausblick"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "people.experience",
      "label": "Erfahrung der Teilnehmenden",
      "definition": "Erfahrungsniveau oder bisherige Erfahrung einer Person; Anforderungen an das Angebot separat ausdrücken.",
      "observedAliases": [
        "Erfahrungsniveau",
        "Erfahrungsziel",
        "Vorerfahrung",
        "Geeignetes Erfahrungsniveau"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "time.clock_start",
      "label": "Frühester Beginn oder Zeitfensterbeginn",
      "definition": "Frühester oder gewünschter Beginn bzw. Beginn eines Zeitfensters; ab und nach sowie genaue und ungefähre Uhrzeit unterscheiden.",
      "observedAliases": [
        "früheste Beginnzeit",
        "Startzeit"
      ],
      "valueKind": "CLOCK"
    },
    {
      "key": "participation.language",
      "label": "Sprache",
      "definition": "Sprache, Originalfassung, Untertitel oder Verständlichkeit mit Bezug zum Programm bzw. Person; Ausnahmen für sprachlose Programme ausdrücklich verknüpfen.",
      "observedAliases": [
        "Sprachform",
        "verständliche Sprache",
        "Sprachverständlichkeit",
        "Teilnahmesprache",
        "Sprachfassung",
        "Untertitelsprache",
        "Sprachverständnis",
        "Veranstaltungssprache",
        "Sprachbedarf",
        "Englischverständnis erforderlich",
        "Sprache"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "experience.character",
      "label": "Erlebnischarakter",
      "definition": "Erlebnischarakter, Besonderheit oder Anlasspassung, ohne aus subjektiven Wünschen neue harte Kategorien zu erfinden.",
      "observedAliases": [
        "Erlebnischarakter",
        "gewünschte Besonderheit",
        "Anlassangemessenheit",
        "Erlebnisqualität"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "condition.exposure",
      "label": "Höhenexposition",
      "definition": "Höhenexposition, ausgesetzte Stellen oder gewünschte Höhenbegrenzung; unklare quantitative Grenze nicht erfinden.",
      "observedAliases": [
        "Höhenexposition",
        "Ausgesetzte Stellen"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "condition.water",
      "label": "Wasserkontakt",
      "definition": "Erforderlicher/ausgeschlossener Kontakt oder Aufenthalt im Wasser; Wassernähe bedeutet nicht ins Wasser gehen.",
      "observedAliases": [
        "Wasserkontakt"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "condition.children",
      "label": "Kinderzugang",
      "definition": "Zugang von Kindern bzw. kinderfreier Bereich; nicht von einem Bereich auf den ganzen Betrieb ausdehnen.",
      "observedAliases": [
        "Kinder zugelassen"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "time.relation",
      "label": "Zeitliche Beziehung",
      "definition": "Zeitliche Beziehung, Reihenfolge, Gleichzeitigkeit oder zeitliche Abgrenzung zwischen Vorgängen. Ohne Nutzerwunsch keinen Mehrstationenplan erstellen.",
      "observedAliases": [
        "Zeitliche Beziehung",
        "zeitlicheRelation",
        "Zeitliche Relation",
        "zeitliche_Reihenfolge",
        "Zeitlicher Anlass",
        "Reihenfolge",
        "Zeitliche Abgrenzung"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "atmosphere.conversation",
      "label": "Unterhalten können und Stillepflicht",
      "definition": "Unterhalten können oder Stillepflicht; ruhige Atmosphäre ist nicht automatisch Schweigepflicht.",
      "observedAliases": [
        "Gesprächsmöglichkeit",
        "Stillepflicht",
        "Unterhaltungsfähigkeit"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "atmosphere.bustle",
      "label": "Trubel",
      "definition": "Lautstärke, Trubel oder Betriebsamkeit; Präferenz nicht ohne Grundlage zum Verbot verschärfen.",
      "observedAliases": [
        "Lautstärke",
        "Trubel"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "experience.purpose",
      "label": "Zweck",
      "definition": "Zweck oder gewünschter Nutzen des Besuchs, unabhängig von konkreter Aktivitätsart.",
      "observedAliases": [
        "Zweck"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "atmosphere.music",
      "label": "Musik",
      "definition": "Musikmerkmal. Bei Musikverbot EXCLUDED mit positiv benanntem Musikobjekt; nie REQUIRED mit negativem Text. Ohne Pflicht NOT_REQUIRED, ausdrücklich optional PREFERRED.",
      "observedAliases": [
        "Musik",
        "Hintergrundmusik"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "atmosphere.privacy",
      "label": "Privatsphäre",
      "definition": "Privatsphäre oder ungestörtes Zusammensitzen; kein eigener Raum ohne entsprechenden Wunsch nötig.",
      "observedAliases": [
        "Privatsphäre"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "offer.misc_extra",
      "label": "Weitere konkrete Angebotsbedingungen",
      "definition": "Weitere konkret benannte Angebots-/Teilnahmebedingungen wie Genre, Sitzplatz, Anleitung oder Feuermöglichkeit. Inhalt offen und Geltungsbereich präzise.",
      "observedAliases": [
        "geeignet für",
        "Feuermachmöglichkeit",
        "Platzart",
        "Anleitung",
        "Veranstaltungsbereich",
        "Kriechen durch enge Räume erforderlich",
        "ausgeschlossenes Genre"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "time.clock_bounds",
      "label": "Zeitgrenze",
      "definition": "Besondere Uhrzeitgrenzen, wenn Start/Ende nicht passend sind; Grenze und betroffene Tätigkeit ausdrücklich benennen.",
      "observedAliases": [
        "Beginn frühestens",
        "Ende spätestens",
        "späteste Abreisezeit"
      ],
      "valueKind": "CLOCK"
    },
    {
      "key": "food.option",
      "label": "Zusätzliche Speise- oder Getränkeoption",
      "definition": "Zusätzliche Essens-/Getränkeoption, Menüform oder spezifische Verpflegungsoption; freiwillige Ergänzung nicht erzwingen.",
      "observedAliases": [
        "Verpflegung",
        "Mahlzeit",
        "Mahlzeitart",
        "Kaffeeoption",
        "Milchoption",
        "Menüform"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "location.return",
      "label": "Rückkehrort",
      "definition": "Erforderlicher Rückkehrort, zum Beispiel Bahnhof, nicht automatisch Beginn oder Ziel des Erlebnisses.",
      "observedAliases": [
        "Rückkehrort",
        "Ziel des Rückwegs"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "time.reference",
      "label": "Referenzzeit des Tests",
      "definition": "Nur Referenzmetadatum, kein Nutzerwunsch. Normalerweise nicht als Fakt ausgeben; das Referenzdatum ohne Zeitbezug der Anfrage nicht zum Besuchsdatum machen.",
      "observedAliases": [
        "lokales Datum",
        "Referenzdatum",
        "Referenzzeitpunkt",
        "Lokales Referenzdatum und -zeit"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "atmosphere.scale",
      "label": "Größe und Intimität",
      "definition": "Gewünschte Größe, Intimität oder Angebotsumfang, samt Gegenstand: Veranstaltung, Gruppe, Degustation usw.",
      "observedAliases": [
        "Umfang",
        "Größe",
        "Größe des Veranstaltungsorts",
        "Größenordnung",
        "gewünschter Umfang",
        "Angebotsumfang"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "participation.permission",
      "label": "Erlaubte Nutzung oder eigene Mitnahme",
      "definition": "Erlaubte Nutzung, eigenes Mitbringen oder Selbsttätigkeit, zum Beispiel Torte mitbringen, Fotografieren oder eigenes Sammeln.",
      "observedAliases": [
        "Erlaubte Nutzung",
        "Erlaubnis",
        "Zubereitung durch Gäste am Tisch",
        "Gäste bereiten selbst zu",
        "Interaktion"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "offer.service",
      "label": "Dienstleistung und Betreuung",
      "definition": "Dienstleistung oder Betreuung, die zum Erlebnis gehören soll; Umfang und benötigte Person benennen.",
      "observedAliases": [
        "Leistung",
        "Betreuung eingeschlossen"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "food.delivery",
      "label": "Lieferung oder Besuch vor Ort",
      "definition": "Abholung, Lieferung oder Essen vor Ort; Lieferausschluss bedeutet nicht automatisch Ausschluss jeder Abholmöglichkeit.",
      "observedAliases": [
        "Bezugsform"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "location.transport_after_visit",
      "label": "Transport nach dem Besuch",
      "definition": "Anreise-/Rückreiseanforderung nach dem Besuch; nicht selbst fahren und Bahnhofnähe sind unterschiedliche Angaben.",
      "observedAliases": [
        "Selbst fahren nach dem Erlebnis"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "offer.concept_detail",
      "label": "Konzept und Darbietung",
      "definition": "Spezielles Angebotskonzept oder Darbietungsform, frei benannt; nicht auf die gesamte Spotkategorie ausdehnen.",
      "observedAliases": [
        "Küche bzw. Konzept",
        "Darbietungsform",
        "Objektart",
        "Kursart",
        "Tanzstil",
        "Einrichtungstyp",
        "Leistungsorientierung"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "food.preparation",
      "label": "Art oder Ort der Zubereitung",
      "definition": "Art, Ort oder aktive Beteiligung bei der Zubereitung; am Tisch selbst kochen ist kein gewöhnlicher Kochkurs.",
      "observedAliases": [
        "Ort der Zubereitung"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "people.pet",
      "label": "Begleittier",
      "definition": "Mitgebrachtes Begleittier mit Art und Teilnahmebezug; Tierzugang separat als Bedingung angeben.",
      "observedAliases": [
        "Tierart"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "atmosphere.noise",
      "label": "Störgeräusche",
      "definition": "Störgeräusche oder laute Programme; ihre Abwesenheit ist nicht automatisch absolute Stille.",
      "observedAliases": [
        "Störgeräusche",
        "Animationsprogramm"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "ranking.requested_evidence",
      "label": "Nutzerwunsch zur Auswahlbegründung",
      "definition": "Ausdrücklicher Nutzerwunsch zur Begründung/Auswahl, zum Beispiel Sterne nicht als einzigen Grund benutzen; kein Spotranking durchführen.",
      "observedAliases": [
        "Umgang mit Sterneauszeichnungen"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "time.date_start",
      "label": "Beginn des Datumsintervalls",
      "definition": "Erster Tag eines Datumsintervalls, nicht automatisch Beginn einer mehrtägigen Buchung.",
      "observedAliases": [
        "Startdatum"
      ],
      "valueKind": "DATE"
    },
    {
      "key": "time.date_end",
      "label": "Ende des Datumsintervalls",
      "definition": "Letzter Tag eines Datumsintervalls, nicht automatisch Aufenthaltsdauer.",
      "observedAliases": [
        "Enddatum"
      ],
      "valueKind": "DATE"
    },
    {
      "key": "participation.group_access",
      "label": "Zulassung und Mitnahme der Gruppe",
      "definition": "Zulassung/Mitnahme aller oder benannter Gruppenmitglieder beim Angebot; individuelle Bedürfnisse ändern nicht automatisch die Teilnehmerliste.",
      "observedAliases": [
        "Teilnahme-/Mitnahmeregel"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "participation.group_compatibility",
      "label": "Gemeinsame Teilnahme",
      "definition": "Gemeinsame Nutzung desselben Angebots durch die Gruppe, nicht zwingend identische Leistung für jede Person.",
      "observedAliases": [
        "Gruppenarrangement",
        "gemeinsame_Teilnahme",
        "Gemeinsame Teilnahme",
        "Teilnahme der Tochter möglich"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "people.identity",
      "label": "Genannte Person",
      "definition": "Genannte Person oder Name mit Referenz, ohne ungenannte persönliche Eigenschaften.",
      "observedAliases": [
        "Person"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "people.role",
      "label": "Rolle innerhalb der Gruppe",
      "definition": "Rolle einer Person innerhalb der Gruppe oder des Anlasses; Rolle ist kein Alter.",
      "observedAliases": [
        "Rolle",
        "Personenrolle"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "atmosphere.freedom",
      "label": "Bewegungsfreiheit",
      "definition": "Bewegungsfreiheit oder Einschränkungen wie langes stilles Sitzen; Bezugsgruppe ausdrücklich angeben.",
      "observedAliases": [
        "langes_stilles_Sitzen_erforderlich",
        "Bewegungsfreiheit"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "people.age_bounds",
      "label": "Altersintervall der Personen",
      "definition": "Explizite Altersgrenze/-spanne von Personen in YEARS mit Operator. Nicht mit Zulassungsalter eines Angebots verwechseln. Kein ungenanntes genaues Alter erfinden.",
      "observedAliases": [
        "Mindestalter",
        "Höchstalter",
        "Altersstruktur",
        "Volljährigkeitsstatus"
      ],
      "valueKind": "AGE"
    },
    {
      "key": "offer.shade",
      "label": "Beschattung",
      "definition": "Beschattung des genutzten Bereichs; nicht automatisch Innenraum oder völliger Regenschutz.",
      "observedAliases": [
        "Beschattung"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "offer.access",
      "label": "Nutzungszugang",
      "definition": "Art des Zugangs zu einem Bereich/Angebot, zum Beispiel Innenbesichtigung oder frei zugänglicher Ort; frei zugänglich bedeutet nicht immer kostenlos.",
      "observedAliases": [
        "Zugangsart",
        "Zugang"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "participation.entry_mode",
      "label": "Teilnahmeart und Programmform",
      "definition": "Teilnahmeart, festes Programm oder spontane/eigenständige Nutzung; kein fixes Programm erforderlich bedeutet kein Programmausschluss.",
      "observedAliases": [
        "Programmform",
        "Teilnahmeart",
        "Beobachtungsmodus"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "location.waterbody",
      "label": "Gewässerbezug",
      "definition": "Benanntes Gewässer wie Rhein oder See; See und Fluss nicht stillschweigend austauschen.",
      "observedAliases": [
        "Gewässer"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "people.mobility_aid",
      "label": "Mobilitätshilfe der Person",
      "definition": "Mitgebrachtes Hilfsmittel oder besondere Fortbewegung einer Person, nicht automatisch vollständige Eignung des Angebots.",
      "observedAliases": [
        "Mobilitätshilfe"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "participation.expertise",
      "label": "Fachkundige Begleitung",
      "definition": "Erforderliche fachkundige Begleitung, Anleitung oder Expertise; Bezug zur Tätigkeit festhalten.",
      "observedAliases": [
        "Fachwissen"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "condition.water_activity",
      "label": "Wasseraktivität",
      "definition": "Wasserbezogene Tätigkeit oder Gerät als Angebotsmerkmal; nicht mit dem geografischen Ort Baden verwechseln.",
      "observedAliases": [
        "Baden",
        "Wasserfahrzeug"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "condition.snow",
      "label": "Schnee und Schneelage",
      "definition": "Schnee oder konkrete Schneebedingung für ein Erlebnis; keine aktuelle Schneelage ohne Daten behaupten.",
      "observedAliases": [
        "Schneebedingung",
        "Erforderliche Bedingung"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "location.area_type",
      "label": "Gebietstyp",
      "definition": "Gebietstyp oder räumliche Einordnung, ohne konkrete Ortserweiterung zu erfinden.",
      "observedAliases": [
        "Gebietstyp"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "condition.activity_exclusion",
      "label": "Ausgeschlossene Aktivitätsbestandteile",
      "definition": "Ausgeschlossenes Bestandteil, Streckentyp oder Element einer Tätigkeit, ohne die gesamte Tätigkeit unnötig zu verbieten.",
      "observedAliases": [
        "Ausgeschlossener Streckentyp",
        "ausgeschlosseneZielart",
        "ausgeschlossenes Element"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "budget.amount",
      "label": "Budgetbetrag mit noch zu bestimmender Grenze",
      "definition": "Geldbetrag ohne bestimmbaren Richtwert-/Grenzoperator; Unklarheit nicht durch willkürliche Obergrenze lösen.",
      "observedAliases": [
        "Eintrittspreis",
        "Budget"
      ],
      "valueKind": "MONEY"
    },
    {
      "key": "participation.consumption_obligation",
      "label": "Konsum- oder Kaufpflicht",
      "definition": "Kauf-, Konsum- oder Mindestbestellpflicht; Ausschluss einer Pflicht ist kein Verbot freiwilligen Konsums.",
      "observedAliases": [
        "Konsumpflicht",
        "Kaufverpflichtung",
        "Kaufzwang",
        "Konsumzwang",
        "ausgeschlossene Verpflichtung"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "offer.equipment_source",
      "label": "Bereitstellung und eigenes Material",
      "definition": "Herkunft von Ausrüstung: mitgebracht, vorhanden, gemietet, geliehen oder gestellt; Leihe nicht automatisch kostenlos.",
      "observedAliases": [
        "Verfügbarkeit",
        "Bereitstellungsform",
        "Benötigtes Angebot",
        "Eigenes Material",
        "Materialzugang",
        "Bereitstellungsart"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "time.special",
      "label": "Besondere Zeitbedingungen",
      "definition": "Spezielle Zeitbedingungen wie Öffnung, Pausen oder Verfügbarkeit; mit genauem Bezug und nicht als zusätzliche Aktivität.",
      "observedAliases": [
        "Verfügbarkeitsdatum",
        "Pausen eingeschlossen",
        "Zeitlicher Zweck",
        "Späteste Öffnungszeit",
        "aufgelöstes Datum"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "experience.creator",
      "label": "Personen hinter dem Erlebnis",
      "definition": "Gewünschte Merkmale der Autorinnen, Vortragenden oder Kunstschaffenden eines Programms, nicht Eigenschaften der Teilnehmenden.",
      "observedAliases": [
        "Autorinnenschaft"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "experience.outcome",
      "label": "Ergebnis und Lernziel",
      "definition": "Gewünschtes Ergebnis oder Lernziel einer Aktivität; Herstellung und Betrachtung nicht gleichsetzen.",
      "observedAliases": [
        "Lerngegenstand",
        "Ergebnis",
        "Fertigstellung",
        "Lernziel",
        "gewünschter_Fokus"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "offer.result_delivery",
      "label": "Mitnahme oder Übergabe des Ergebnisses",
      "definition": "Mitnahme, Abholung, Versand oder spätere Übergabe eines Ergebnisses; Zeitpunkt und Zusatzkosten erhalten.",
      "observedAliases": [
        "Mitnahme",
        "Übergabeoption"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "participation.requirement",
      "label": "Weitere Teilnahmevoraussetzung",
      "definition": "Sonstige Teilnahmevoraussetzungen oder Unterstützung, etwa keine Bühnenpflicht oder erforderliche Einführung.",
      "observedAliases": [
        "ausgeschlossene Teilnahmeanforderung",
        "Unterstützungsart",
        "Teilnahmeleistung"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "offer.dimension",
      "label": "Abmessungen",
      "definition": "Physische Abmessung einer Einrichtung, z.B. Länge einer Schwimmbahn. Keine Streckenlänge einer Aktivität und keine Reiseentfernung. Normalisiert in METERS.",
      "observedAliases": [
        "Mindestlänge der Bahn"
      ],
      "valueKind": "LENGTH"
    },
    {
      "key": "offer.quantity",
      "label": "Anzahl nutzbarer Einrichtungen",
      "definition": "Anzahl benötigter Einrichtungen/Gegenstände, nicht Anzahl der Personen; Objekt und Bezugsgruppe nennen.",
      "observedAliases": [
        "Anzahl Tennisplätze",
        "Anzahl Bowlingbahnen"
      ],
      "valueKind": "COUNT"
    },
    {
      "key": "condition.weather_protection",
      "label": "Witterungsschutz",
      "definition": "Art des Witterungsschutzes eines Angebots/Bereichs, z.B. überdacht. Kein tatsächlicher Niederschlag und kein Wetterauslöser.",
      "observedAliases": [
        "Niederschlag",
        "Witterungsschutz"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "people.participation",
      "label": "Teilnahme einer Person",
      "definition": "Gewünschte Teilnahmeweise einer Person: aktiv, zuschauend oder wartend; keine automatische Gruppenänderung.",
      "observedAliases": [
        "Teilnahme"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "location.country",
      "label": "Land",
      "definition": "Genanntes oder begründet zugeordnetes Land; von konkretem Zielort unterscheiden.",
      "observedAliases": [
        "Land",
        "country"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "offer.usage",
      "label": "Nutzungsart",
      "definition": "Art der gemeinsamen oder individuellen Nutzung einer Einrichtung, zum Beispiel eine Bahn für alle.",
      "observedAliases": [
        "Nutzungsart"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "food.meal",
      "label": "Essensangebot",
      "definition": "Benötigte oder optionale Essensmöglichkeit, wenn keine präzisere Speise/Umfangsangabe vorliegt.",
      "observedAliases": [
        "Essen"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "people.capability",
      "label": "Mitgebrachte Fähigkeiten",
      "definition": "Ausdrücklich genannte Fähigkeit einer Person, zum Beispiel schwimmen können; keine Fähigkeit aus Aktivitätswunsch ableiten.",
      "observedAliases": [
        "Schwimmfähigkeit"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "offer.temperature",
      "label": "Temperatur",
      "definition": "Gewünschte Temperatur eines benannten Bereichs/Mediums, zum Beispiel warmes Wasser, ohne erfundene Gradzahl.",
      "observedAliases": [
        "Wassertemperatur"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "budget.payment_mode",
      "label": "Zahlungsmodell",
      "definition": "Gewünschtes Zahlungsmodell wie Einmalzahlung oder Einzelbuchung, nicht Geldbetrag.",
      "observedAliases": [
        "Zahlungsmodell"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "participation.subscription",
      "label": "Abobindung",
      "definition": "Abonnement- oder Vertragsbindung und ihre Akzeptanz; einmalig teilnehmen ist kein langfristiges Abo.",
      "observedAliases": [
        "Abonnementbindung"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "atmosphere.crowding",
      "label": "Auslastung",
      "definition": "Gewünschte Auslastung oder Menschenmenge; nicht automatisch private/exklusive Nutzung.",
      "observedAliases": [
        "Auslastungspräferenz"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "offer.treatment",
      "label": "Behandlungsart",
      "definition": "Gewünschte/ausgeschlossene Behandlung und Körperbezug, ohne Vollbehandlung aus Teilbehandlung abzuleiten.",
      "observedAliases": [
        "Behandlungsart",
        "ausgeschlossene Behandlungsart"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "atmosphere.disturbance",
      "label": "Ungestörtheit und Abgrenzung",
      "definition": "Ungestörtheit, wirksame räumliche Abgrenzung oder störungsfreier Bereich, nicht automatisch gesamter Betrieb ohne andere Gäste.",
      "observedAliases": [
        "Störungsniveau",
        "Abgrenzung",
        "Ungestörtheit"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "experience.sequence",
      "label": "Ablaufmodell",
      "definition": "Ausdrücklich gewünschter oder ausgeschlossener Ablauf; keine feste Besuchsroute ohne Auftrag erfinden.",
      "observedAliases": [
        "ausgeschlossenes_Ablaufmodell"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "offer.combination",
      "label": "Kombination oder gleichwertige Alternative",
      "definition": "Benötigte Kombination oder gleichwertige Alternative innerhalb eines Angebots, nicht jede Alternative gleichzeitig erzwingen.",
      "observedAliases": [
        "Gleichwertigkeit",
        "Kombinationsangebot erforderlich"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "atmosphere.competition",
      "label": "Wettbewerbscharakter",
      "definition": "Wettbewerbscharakter und dessen Verbindlichkeit; nicht erforderlich ist kein vollständiger Wettbewerbsausschluss.",
      "observedAliases": [
        "Wettbewerbscharakter"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "offer.capacity",
      "label": "Erforderliche Kapazität",
      "definition": "Benötigte nutzbare Kapazität für eine bestimmte Gruppe, nicht tatsächlich verfügbare Plätze eines ungeprüften Spots.",
      "observedAliases": [
        "Mindestkapazität",
        "Erforderliche Teilnahmekapazität"
      ],
      "valueKind": "COUNT"
    },
    {
      "key": "budget.qualitative",
      "label": "Qualitativer Preiswunsch",
      "definition": "Qualitativer Preiswunsch ohne Zahl, zum Beispiel nicht übertrieben teuer; keine Geldgrenze erfinden.",
      "observedAliases": [
        "Preisniveau"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "route.length",
      "label": "Streckenlänge",
      "definition": "Länge der ausgeübten Runde/Strecke selbst. Keine Anreiseentfernung und keine Gehzeit. Normalisiere Kilometer in Meter.",
      "observedAliases": [
        "Streckenlänge",
        "Rundenlänge"
      ],
      "valueKind": "LENGTH"
    },
    {
      "key": "location.distance",
      "label": "Entfernung zu einem Bezugspunkt",
      "definition": "Quantifizierte Entfernung zwischen zwei Bezugspunkten. subjectIds benennt ausdrücklich das Ziel/den Startpunkt, referenceEntityId den Bezugspunkt. Keine Aktivitätsstreckenlänge oder Zeit; Kilometer in Meter normalisieren.",
      "observedAliases": [
        "Entfernung",
        "Suchradius"
      ],
      "valueKind": "LENGTH"
    },
    {
      "key": "offer.weather_suitability",
      "label": "Wettereignung des Angebots",
      "definition": "Geforderte Eignung für Regen oder anderes Wetter, nicht Behauptung tatsächlichen Wetters. Schutzbedarf und Bereich ausdrücklich benennen.",
      "observedAliases": [
        "regensicher",
        "wettergeschützt"
      ],
      "valueKind": "TEXT"
    },
    {
      "key": "time.duration_quality",
      "label": "Qualitative Dauer",
      "definition": "Qualitative Dauer eines Besuchs oder einer Aktivität ohne genannte Zahl. Den qualitativen Wunsch erhalten, keine Minuten erfinden. subjectIds benennt den betroffenen Besuch oder die Aktivität. Nicht Terminfenster oder Uhrzeit.",
      "observedAliases": [],
      "valueKind": "TEXT"
    }
  ],
  "rules": [
    "Modality, subjectIds, operator und Werttyp sind voneinander getrennte Bedeutungsdimensionen.",
    "Entities referenzieren Personen, Gruppen, Tiere, Aktivitäten, Bereiche und Kostenbestandteile eindeutig; labels sind frei, Beziehungen müssen keine Freitextinterpretation mehr erfordern.",
    "Unter ist LT, höchstens ist LTE; exakt EQ, ungefähr APPROX. EXCLUDED negiert ein positiv beschriebenes Merkmal, NOT_REQUIRED bedeutet keine Pflicht.",
    "Alternative und Bedingung werden als eindeutiger Ausdrucksbaum ausgegeben. Bedingung und Folge dürfen nicht derselbe Fakt sein.",
    "Informationen ohne passenden Schlüssel bleiben vollständig als extensions erhalten und dürfen im Baum referenziert werden."
  ]
} as const);
export const LUNA_LIBRARIAN_FACT_KEYS = {
  "TEXT": [
    "food.drink",
    "experience.occasion",
    "location.destination",
    "time.window",
    "offer.area",
    "offer.facility",
    "time.weekday",
    "time.timezone",
    "budget.coverage",
    "budget.cost_treatment",
    "offer.kind",
    "food.dish",
    "food.quality",
    "food.diet",
    "food.meal_extent",
    "offer.feature",
    "experience.activity",
    "food.cuisine",
    "participation.partner",
    "people.relationship",
    "atmosphere.character",
    "generic.suitability",
    "participation.format",
    "time.original",
    "travel.mode",
    "location.area",
    "participation.accessibility",
    "participation.prerequisite",
    "budget.flexibility",
    "experience.theme",
    "generic.exclusion",
    "participation.booking",
    "location.setting",
    "condition.difficulty",
    "condition.terrain",
    "condition.animals",
    "location.proximity",
    "location.view",
    "people.experience",
    "participation.language",
    "experience.character",
    "condition.exposure",
    "condition.water",
    "condition.children",
    "time.relation",
    "atmosphere.conversation",
    "atmosphere.bustle",
    "experience.purpose",
    "atmosphere.music",
    "atmosphere.privacy",
    "offer.misc_extra",
    "food.option",
    "location.return",
    "time.reference",
    "atmosphere.scale",
    "participation.permission",
    "offer.service",
    "food.delivery",
    "location.transport_after_visit",
    "offer.concept_detail",
    "food.preparation",
    "people.pet",
    "atmosphere.noise",
    "ranking.requested_evidence",
    "participation.group_access",
    "participation.group_compatibility",
    "people.identity",
    "people.role",
    "atmosphere.freedom",
    "offer.shade",
    "offer.access",
    "participation.entry_mode",
    "location.waterbody",
    "people.mobility_aid",
    "participation.expertise",
    "condition.water_activity",
    "condition.snow",
    "location.area_type",
    "condition.activity_exclusion",
    "participation.consumption_obligation",
    "offer.equipment_source",
    "time.special",
    "experience.creator",
    "experience.outcome",
    "offer.result_delivery",
    "participation.requirement",
    "condition.weather_protection",
    "people.participation",
    "location.country",
    "offer.usage",
    "food.meal",
    "people.capability",
    "offer.temperature",
    "budget.payment_mode",
    "participation.subscription",
    "atmosphere.crowding",
    "offer.treatment",
    "atmosphere.disturbance",
    "experience.sequence",
    "offer.combination",
    "atmosphere.competition",
    "budget.qualitative",
    "offer.weather_suitability",
    "time.duration_quality"
  ],
  "COUNT": [
    "people.count",
    "offer.quantity",
    "offer.capacity"
  ],
  "CLOCK": [
    "time.clock",
    "time.clock_end",
    "time.clock_start",
    "time.clock_bounds"
  ],
  "DATE": [
    "time.date",
    "time.date_start",
    "time.date_end"
  ],
  "MONEY": [
    "budget.maximum",
    "budget.target",
    "budget.amount"
  ],
  "AGE": [
    "people.age",
    "participation.age_suitability",
    "people.age_bounds"
  ],
  "BUDGET_SCOPE": [
    "budget.scope"
  ],
  "DAY_PHASE": [
    "time.day_phase"
  ],
  "DURATION": [
    "time.duration"
  ],
  "LENGTH": [
    "offer.dimension",
    "route.length",
    "location.distance"
  ]
} as const;
export const LUNA_LIBRARIAN_FREEZE = deepFreeze({
  "sourceExperiment": "backyrd-luna-meaning-v7",
  "promptSha256": "5fa853fec7e49021a38e80b9688af3b9a2db92803f8f0112654ba247b2b8a496",
  "schemaFileSha256": "6f5d46a5f767b065e91ac093ddcb42494a7dfe7f549fa630ac4d448c846828dc",
  "catalogFileSha256": "e2fafd36fbf673b4061673dc774dcad21b415ff2cba4a48148815d269d2be815",
  "knownLimitations": [
    "CROSS_CONDITION_SAME_PLACE",
    "AREA_LOCATION_SCOPE_NOT_GROUNDED"
  ],
  "semanticAcceptance": "DEVELOPMENT_BASELINE_NOT_PRODUCTION_ACCEPTANCE"
} as const);
