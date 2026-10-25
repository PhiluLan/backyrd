# Reviewed World research import

Task class: DATABASE_PR (Admin + World). No Decision, Mobile, Auth or runtime
policy change. Production rollout: exact forward migration, then Admin version;
until the RPC exists the new importer fails closed. No production Spot writes are
part of deployment.

## Export and external research

New exports use `backyrd.world-research-batch@1.1`. Every field includes its JSON
value shape, allowed values and semantic rules. Weekly opening and kitchen
schedules are distinct arrays of `{day, intervals:[{start,end}]}`. A missing day
is unknown, not closed. `24:00` is represented as an end of `00:00` on the next
day. Examples are format guidance, never assertions about the exported Spot.
The old 1.0 format remains accepted with its original hash-bound field catalog.

After a partial import, export again: the new manifest/current values become the
base and the researcher only supplements remaining fields. Never edit a bound
manifest/hash to make an old document appear current.

## Nuknuk reports and current profile comparison

The Admin page reads local Nuknuk `report.json` files as proposals, never as
canonical knowledge. Search and status filters separate proposals from unresolved
fields; schedules, offers and rooms are rendered as readable values. Saving a
report does not save its facts into the Spot profile.

An Admin explicitly selects the facts and evidence they have reviewed, then
chooses **Auswahl mit Spotprofil abgleichen**. This read-only step binds the
report to a fresh export of the same real Spot and enters the existing preview
and commit flow. No checkbox is selected automatically. Current values, new
proposals and unresolved fields remain distinct; replacements need a separate
choice. The final import is a separate action.

Partial experience profiles supplement the current profile: existing entities,
properties, area links, prices and schedules remain intact. Ambiguous entity
matches and incompatible values are held for editor review. Missing weekdays
preserve existing schedules and never imply closed. Preview and commit both
repeat this merge against current values so a refreshed partial report cannot
erase newer additions.

Each citation retains its URL, evidence and observation time. Additional sources
are carried as `supportingSources` and stored with the immutable claim evidence.
Missing observation times and sources outside the confirmed website host are
held. Older saved reports that lost these times must be reloaded from their
original file. The source trust level is determined from the confirmed website,
not accepted from the report. Credential text is rejected; email literals are
allowed only for the exact proposed public venue email field.

Migration `20261024113000_world_research_current_profile_import_v3.sql` upgrades
the existing v2 import RPC to the current v6 writer and adds supporting evidence.
Explicit supersession does not create a concurrent-conflict note for its own
ancestor; unrelated contradictory assertions still do. Existing historical
conflict notes are not automatically removed. Decision behavior is unchanged.

Confirmed country CH permits the deterministic proposal Europe/Zurich, visibly
labelled as a geographic derivation with IANA provenance. It is not inferred
from a city name, does not replace a known timezone, and a stored UNKNOWN still
requires explicit review. Unresolved fields are otherwise never written.
Temporary operational states remain in the editor, where validity is required.

## Review and atomic import

Existing different values (including UNKNOWN) show current value, proposed
value, evidence and source. The Admin must confirm the exact previous claim and
run preview again. No confirmation means no replacement. Category-dependent
place types wait for a compatible confirmed category.

The v2 RPC accepts at most 60 distinct claims for one approved Spot. It checks
the Admin session, authoring control, exact manifest and exact previous claim,
then delegates to the existing canonical append-only writer. Category is written
first regardless of input order. The entire Spot transaction rolls back on an
error; other Spots in the batch have independent outcomes. A row lock on the
Spot serializes against the FK locks taken by claim inserts. No global lock,
new table, direct client insert or deletion of existing history is introduced.
Private immutable research evidence remains bound to each claim.

After committed claims, the existing service-authorized rebuild is run and its
manifest is checked against the authoring reader. A rebuild error is reported,
never called success. It is distinct from a transaction rollback. If the manifest
has already advanced, obtain a fresh export rather than bypassing drift checks.

## Nomad regression / acceptance

- UNKNOWN category + proposed EAT requires deliberate confirmation.
- RESTAURANT/BAR waits for that category; no partial category dependency failure.
- Existing identical facts are skipped; conflicting purpose is reviewed.
- Basel alone does not set timezone; confirmed CH yields Europe/Zurich proposal.
- Published venue and kitchen schedules can be expressed without schema guessing.
- A later invalid field rolls back earlier writes in the same Spot batch.
- Non-Admin, stale manifest/claim, missing source, credentials in URL, duplicate
  fields, invalid values and Emergency-OFF are rejected.

Local fixtures validate behavior; they are not a live import of Nomad facts.
The Founder performs research and reviews/imports the actual fresh JSON.

Nuknuk-Research-Berichte können im Admin als reine Prüfentwürfe gespeichert werden.
Der Admin-geschützte Entwurfsweg speichert nur die angezeigten Vorschläge,
Belege und offenen Punkte in der bestehenden service-role-only-Tabelle für
Recherchevorschläge; rohe Modelltraces bleiben lokal. Gespeicherte Entwürfe
sind für Admins geräteübergreifend sichtbar. Der Entwurfsspeicher schreibt
keine Profilangaben. Ausgewählte und ausdrücklich geprüfte Inhalte gelangen
über den Profilabgleich in den bestehenden World-Research-Prüf- und Importweg.


## Rechercheentwurf bearbeiten und fehlende Abrufzeitpunkte ergänzen

In der Nuknuk-Übersicht lassen sich Vorschläge über **Angabe bearbeiten** und offene Felder über **Angabe selbst ergänzen** öffnen. Der Editor lädt zuerst den aktuellen, freigegebenen Profilstand. Teilprofile werden vor der Bearbeitung mit vorhandenen Angeboten und Bereichen zusammengeführt; bei Widersprüchen startet die Bearbeitung vom gespeicherten Stand. Die ursprünglichen Recherchewerte und Belege bleiben unverändert sichtbar.

Die Formularaktion merkt den eigenen Wert zunächst vor. **Eigene Angabe im Profil speichern** bestätigt ihn über `world_product_admin_submit_claim_v1` als menschliche Admin-Angabe. Es werden keine offiziellen Quellenbelege für geänderte Werte erfunden. Der Abrufzeitpunkt einer Webseite wird dabei nicht durch das aktuelle Datum ersetzt: Der neue Claim erhält den Zeitpunkt der menschlichen Bestätigung. Der aktuelle Claim wird vor dem Schreiben abgeglichen. Nach dem Schreiben werden Projektion und tatsächlicher Rücklesewert geprüft. Ein Fehler beim Rebuild wird ausdrücklich als bereits gespeicherte Angabe mit noch nicht bestätigter Ansicht gemeldet; der unveränderte Wiederholungsversuch erzeugt keinen doppelten Claim.

Historische Entwürfe ohne `citation.observedAt` bleiben lesbar, sind aber vor dem Profilabgleich erkennbar gesperrt. **Originalbericht laden** ergänzt ausschliesslich fehlende Zeitpunkte aus einem inhaltlich identischen Bericht: Spot-ID, Aussagen, Werte, Quellen-URLs und Belegtexte müssen übereinstimmen. Bereits vorhandene Zeitpunkte dürfen nicht verändert werden. Name und das früher nicht erhaltene `partialHours`-Metadatum werden beim Identitätsvergleich ignoriert; sie werden nicht überschrieben. Die Admin-API sichert die Wiederherstellung mit einem Vergleich des Änderungsstands und dokumentiert Actor, Reparaturzeitpunkt sowie Hashes des vorherigen und hochgeladenen Berichts. Die Wiederherstellung selbst schreibt keine Profilangaben.


### Rückmeldungen beim Speichern

Die Bestätigung einzelner Angaben zeigt zunächst einen laufenden Speicherstatus. Erst eine Antwort mit passendem öffentlichem Claim, Wissenszustand und Wert löst die fokussierte Erfolgsmeldung aus. Diese steht ausserhalb der Filterliste und bleibt daher auch sichtbar, wenn ein ergänztes Feld aus „Offen“ verschwindet. Statusmeldungen verwenden `role=status`, Fehler und Warnungen `role=alert`; Farbe ist nie der einzige Hinweis.

Fehler erhalten den Formularentwurf und die Speicherkennung für einen sicheren Wiederholungsversuch. Nach erfolgreichem Claim-Schreiben meldet ein fehlgeschlagener Neuaufbau oder Rücklesevorgang ausdrücklich `saveState=SAVED_UNVERIFIED`: Die Oberfläche zeigt „Gespeichert · Profilansicht noch nicht bestätigt“. Ein Netzwerkfehler behauptet dagegen weder Erfolg noch einen sicher fehlgeschlagenen Schreibvorgang. Reine Vormerkungen sind als „noch nicht gespeichert“ bezeichnet.

### Admin review completion and archive (2026-10-25)

Task class: FAST_PR. Owned surface: Admin research review, existing authenticated
Admin API, contract tests. No schema, grant, RLS, model, Decision or public profile
policy changes. Existing reviewed_at/reviewed_by/review_outcome columns and the
private draft export metadata hold the completion receipt; reports are not deleted.

The KEEP control previously sent an empty confirmation that the backend treated
as unanswered. Research review now treats an explicit KEEP as a declined incoming
proposal while retaining the current profile. Unanswered fields remain conflicts.
After a partial commit the UI refreshes the current export and preview, allowing
remaining choices instead of leaving disabled COMMIT-state controls. The result
shows imported/already-present/pending/blocked/error counts; final successful
counts include verified earlier partial steps in the current review session.

Saved NukNuk drafts are checked against the public, current profile. Partial
profiles count as covered only if merging adds/changes nothing; primitive catalog
arrays may be a subset of a larger saved array. Missing/unresolved data is never
silently treated as a rejection or a negative fact. A different proposal needs
an explicit claim-ID-bound KEEP (or explicit decline when no public claim exists).
Completion rechecks the manifest and every proposed field on the server. Metadata
updates compare updated_at, fail honestly on storage/concurrency errors, and
retain actor/time, verified manifest, field outcomes and observed claim IDs.
A partial selection cannot close the rest of the report. Automatic completion
after import uses the same check; manual completion handles older already-edited
reports. This closes the review, not a claim of profile completeness.

Completed reports leave the open list and remain readable in the archive. Admins
can reopen them without changing profile values or losing the original report and
completion receipt. Both active and archived routes retain existing Admin auth;
private answers are not exposed in coverage results. Report creation and ordinary
profile imports keep their existing authorization and canonical writer paths.

Validation: 129 Admin contract tests, including real route handlers with isolated
metadata storage, allow/deny authorization, partial coverage, stale claim/manifest,
write/CAS failures, archive visibility and restoration. Browser QA uses actual
components and synthetic data with no Production connection: partial write,
still-enabled decision, KEEP, zero-write completion, disappearance from open
list, archive read and restoration; direct completion of an older edited report
also passes. Admin TypeScript, affected-file lint and production build pass.
The full pre-existing repository ESLint baseline has unrelated failures; it is not
represented as passing. No existing Production report is automatically closed
without a fresh profile comparison and any necessary explicit KEEP decisions.
