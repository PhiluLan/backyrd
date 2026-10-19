# Booking public preview

Task class: FAST_PR. Owned paths: `web/app/booking/`, the existing Consumer
shell and Home entry, sitemap, and Booking browser smoke tests.

`/booking` is a public product preview for the restaurant pilot. It uses its
own header without the Consumer tab bar. Home links to it in the operator
section. It does not require an account, display live reservations, or enable
restaurant setup. Sample guests are explicitly fictional. The primary action
opens an email draft to hello@backyrd.ch; no request is sent automatically.

Acceptance: HTTP 200, visible Booking heading, labelled sample data, an honest
pilot action, one page header, and no horizontal overflow at 320px. The existing
Owner entry and its authentication boundary must continue to pass their smoke.

Release impact: Web only. No database migration, backend booking RPC, Mobile
release, or Decision activation is part of this change. Production remains a
separate explicitly approved release of a canonical Main commit. After release,
verify the apex-to-www redirect and HTTP 200 at `/booking`, then the same mobile
smoke. Revert this PR if the new route breaks the Consumer or Owner shell.
