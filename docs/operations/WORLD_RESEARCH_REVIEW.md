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
