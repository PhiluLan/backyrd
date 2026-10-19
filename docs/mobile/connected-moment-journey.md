# Connected discovery, atmosphere and Moments

Published to iOS production OTA on 19 October 2026 from Main `5c4aefd5ced633a2f3fad09fdd304e6e6039a03c` (PR #531). Exact Main certification `39312725149` and public launch-byte verification passed. Update `01a155b2-779c-7213-a403-779e8d04472f`, runtime `1.1.0`. Installation on a physical device remains unobserved.

Task class: PRODUCT_RELEASE (existing Mobile Decision presentation and journey).
Owned surfaces: iOS Home, Wohin, place detail, shared Moment card and review composers. No schema, engine matching, recommendation ranking, consent or moderation change.

- Home uses “Dein nächster Moment” and “Worauf hast du Lust?”. Its existing mood entry starts an editable atmosphere wish. The location stays explicit.
- A bounded six-post Home rail uses the same canonical feed RPC, post/review/profile safety filtering and signed-media hydration as the Moments feed. Hidden content fails closed; unknown authors are masked. Guests do not call the authenticated feed. Empty, failed and loading states are explicit; a stalled Home request releases after eight seconds. Focus, city/actor changes and pull-to-refresh reload the preview.
- Moments link to their place and “Ähnliche Orte finden”. Only the actual selected impressions, readable category and known city start a fresh wish. Occasions are not silently turned into atmosphere. Guests use ordinary mood-filtered discovery. No similarity or factual fit is claimed before the server assesses the new wish.
- A place opened from a current Wohin result shows the existing grounded recommendation and availability/uncertainty notes, with further notes progressively disclosed. There is no new model call. The context is memory-only, actor/venue/origin-bound, expires after 30 minutes and clears on a new search or authenticated identity change. A direct visit or app restart cannot recover a personalized explanation. Event results keep their existing event route.
- Place Moments are presented as “Hier erlebt”. Their impressions can start a new atmosphere search. Aggregate Moods retain their existing data, thresholds, ordering and design; individual impressions are never an aggregate rating.
- Both photo-first and place-first composers use the same calm confirmation after successful finalization. The selected impressions remain visible, with actions back to the place or Home. Existing image validation, atomic media finalization, safety snapshots, Owner self-review enforcement and achievement bookkeeping remain intact. Selecting Moods never publishes automatically.

Validation: Mobile types, affected lint, full Mobile contract suite; regression cases for atmosphere wishes, actor/venue/origin isolation, expiry and memory clearing. The existing exported-app browser journey additionally covers safety-filtered Home Moments, Moment-to-search, grounded result-to-place context, direct-place absence of that context and explicit synthetic sharing/confirmation. Synthetic transport never contacts Production or creates live content.

Release: consume only the protected exact-Main certified iOS OTA artifact. Installation and hardware photo/upload timing on a physical phone require separate observation; exported browser/simulator evidence must not be represented as physical-device proof.

Native visual inspection of this iteration could not be completed because macOS was locked. The browser evidence covers 320, 390 and 430 pt widths; a successful iOS export is not physical-device acceptance.
