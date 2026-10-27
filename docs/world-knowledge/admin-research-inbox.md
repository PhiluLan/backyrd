# Admin research inbox

`/world-knowledge` opens the Admin task inbox. Research creation and file import are secondary actions. Each spot appears once; distinct pending proposals remain independently reviewable. Identical repeated proposals are grouped. Research-supplied unknowns are optional additions; generated “not researched” catalog placeholders remain in the original audit report rather than becoming tasks.

The Admin-authenticated `research-tasks` route reads only the acting Admin's research jobs. Every pending field is compared with the current approved, public authoring profile. Read failures remain visible and never produce an “all done” state. No source, moderation, RLS or profile authorization rules change.

Manual commits now persist terminal `ADMIN_RESEARCH_FOLLOWUP` records in the existing service-only `world_research_automation_jobs_v1` table. The research worker does not claim them. Stable actor/batch/spot IDs make retries idempotent. The explicit recovery upload records unresolved questions from an original validated batch without writing any profile claims. A storage failure after a profile commit is reported separately; it must not be presented as complete success.

A decision to retain the profile or leave a fact unknown is recorded with actor, timestamp, exact proposal fingerprint and current public claim ID. Optimistic row-version checks protect concurrent decisions. Such a decision does not manufacture a known fact. A changed claim invalidates the previous decision's binding. Profile edits continue through the existing Admin field writer and its validation, moderation, rebuild and read-back verification.

“Erledigt” means there are no pending research decisions or additions for those reports. It does not assert that every possible spot property is filled in. Original reports and source evidence remain stored. Legacy report archival remains available through the secondary import tools.

The inbox refreshes on opening, window focus, returning to the visible tab, after a decision, and every 30 seconds while visible. Background refresh pauses while a field editor is open. Explicit loading, stale-data errors and save confirmations are shown. At most 1,000 job rows are scanned; exceeding that bound produces an explicit error rather than a silently incomplete count.

Regression tests: `admin-dashboard/test/research-inbox.test.mjs`. Manual validation covers current data, duplicate runs, recovery of prior file-import gaps, desktop/mobile layout, existing field editing and authentication denial.
