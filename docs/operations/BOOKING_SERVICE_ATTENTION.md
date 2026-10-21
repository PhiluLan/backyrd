# Service attention: planned time exceeded

Web candidate, not a production activation or proof of Aleno parity.

## Restaurant workflow

On the current operating day, the Console shows “Geplante Zeit vorbei” when
visits remain saved as seated after their planned physical allocation ends.
Expand the count, inspect a guest and verify the actual situation on site.
The existing reservation panel supplies explicit “Besuch beenden” and “Status
speichern” actions. No timer writes a status, releases inventory, sends a message
or invents current presence. A Viewer can inspect but cannot change a visit.

The review covers the whole restaurant regardless of workspace filters. Earlier
operating days retain their separate unclosed queue. Table combinations count
once; a seated transfer uses its effective allocation end. The next saved active
reservation on any member table is contextual planning information, not proof
that a party has arrived. Zurich times include their UTC offset to distinguish
the repeated hour at the autumn clock change.

A local 30-second clock, focus and visibility return refresh attention only.
Existing authorized snapshot refresh and permission revocation remain canonical.
Offline/stale data stays labelled by the workspace data-status region. Clock/date
disagreement with the backend operating day suppresses this same-day queue.
Closing details restores keyboard focus to the opener, or the workspace refresh
control when that opener disappeared; an already opened dialog retains focus.

## Validation and remaining acceptance

Seven deterministic boundary cases cover deadline equality, current-day and
capability fences, status exclusions, prior-day separation, effective transfer
windows, physical combinations, successor ordering and repeated local times.
Browser acceptance covers phone review and explicit save, clock progression
while details are open, retained filters/prior visits, Viewer inspection,
offline saved state, revoked access and focus after completion. Accessibility
and phone rendering are checked with synthetic guests only.

A physical iPhone and a real restaurant shift are still required, including
clock mismatch, long running visits, mixed rooms and simultaneous staff edits.
This queue does not provide reminders, cross-day reports or an operational
activity feed. Existing backend seating/overlap invariants remain unchanged.

Local validation on 2026-10-21: Web contracts 119/119; Console, guest-link and
checkout browser regression 173/173; new review region axe without violations;
320px phone capture visually inspected. Web production build and its TypeScript
check passed using `npm --workspace web run build -- --webpack`. Lint has no
errors and 13 existing warnings outside this change. The default Turbopack build
could not bind its subprocess port in this environment (`Operation not permitted`),
so this run certifies the Webpack production build only. These are synthetic
local checks, not a device, production or restaurant-shift acceptance.
