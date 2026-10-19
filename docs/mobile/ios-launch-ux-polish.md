# iOS launch UX polish — 19 October 2026

Status: implemented for review; this design change has not been published. The separate authenticated Decision rollout and approved public Mood threshold migration are independent releases.

## Scope

The Home, Wohin, place list, map, filters, place detail and Moment creation use the existing dark/pink foundation. Mood compression, top-Mood structure, selection limits, meanings, aggregation and Decision ranking are unchanged. Only the explicitly requested empty-state wording replaces a known zero with “Noch keine Eindrücke”; unknown counts remain unknown.

- Home shows the complete first name in a smaller wrapping greeting. “Wohin heute?” and “Passenden Ort finden” establish the main action. An empty wish opens Wohin; existing nonempty submission behavior is retained.
- The central Moment action is a quieter outlined control, with a descriptive accessibility label.
- Route and Moment actions remain accessible in a safe-area-aware fixed footer in place detail, retaining the original authorization, navigation and analytics handlers.
- Long place names wrap and the detail hero grows with its content. List/map sheet names and addresses no longer lose their essential information through fixed line limits.
- All image fallback paths retain canonical image resolution and loading/error handling. Missing photographs use one dark image-outline treatment with an explicit accessibility description.
- Closed, closing-soon, open and unknown opening states use a shared badge backed by the existing canonical opening-hours calculation. List hours are loaded from the existing relationship. Retrieval, filtering and ranking are unchanged.
- iOS uses its native Apple map rather than requiring an unavailable Google Maps native module; Android retains Google Maps. Dark appearance is explicit.
- Consumer copy consistently says Ort and Moment in the touched flow. Internal API names, moderation, Owner self-review prevention, consent and submission atomicity are preserved.
- Loading, error and empty presentations reuse the foundation StateView with appropriate live-region behavior.

## Typography and controls

| Purpose | Canonical style |
| --- | --- |
| Large editorial introductions and place names | DM Serif display roles |
| Screen, section and card headings | Libre Franklin bold title roles |
| Body, labels and supporting information | Libre Franklin body/meta/label/caption roles |
| Standard controls | Existing 52 pt minimum, token padding and pill radius; can grow with text |
| Compact controls | Existing 44 pt minimum and descriptive labels |

Body text scales up to 2×, heading roles up to 1.8×, editorial display up to 1.4×. The compact tab labels scale to 1.1× and retain explicit VoiceOver labels. The place-detail action labels scale to 1.5× and icons do not scale as text. Home section links and filter footer actions adapt their arrangement for larger system text.

## Validation

Native iOS 18.3 development clients were used at 375 pt and 430 pt width, with normal text and Accessibility Large. Data was synthetic and identical between the Git baseline and updated UI: a very long first name, a very long restaurant name, a closed place, no photo, known zero impressions, missing address/hours and empty events. The isolated data adapter rejects writes and is outside the repository. No production account, location, photo or Moment was fabricated.

Home, Wohin, list, map, filters, detail and the Moment form were opened at both sizes and with enlarged text. The large iPhone has a complete before/after screenshot set. Smaller-screen enlarged-text evidence includes the adapted filter actions. Screenshots are actual native UI, not mockups. The baseline is Git 96cd8fb; the updated branch includes current Main's separate AI data notice.

Automated checks passed:

- Mobile TypeScript typecheck.
- Mobile product, registration, Wohin, environment isolation, canonical photo, Moment presentation, media upload and native-routing contracts.
- Map-discovery/deadline and carousel geometry tests, including 320–430 pt geometry.
- Production-source iOS bundle export, with synthetic public configuration and no QA module substitution.
- Targeted ESLint: zero errors, three existing warnings (map normalization helper, intentional Mood retry dependency, existing Array type notation).
- Git whitespace check.

## Remaining acceptance checks

- The automation could open the Moment form and inspect its native accessibility children, but did not reliably execute scroll gestures to its final submit action. Full keyboard/scroll-to-submit verification on a physical iPhone remains outstanding; no successful submission or complete end-to-end accessibility pass is claimed.
- Real photo upload, route handoff and live Decision invocation were not submitted from the synthetic UI harness. Existing contract tests cover their preserved handlers; real-device critical-path acceptance remains necessary.
- Exceptionally long German compound names may wrap within a word at Accessibility Large. Text is retained, but this case deserves a visual check on the launch device.
- Showing open places first would change selection/ranking and requires a separate product decision. This change only makes the current status visible.
- No Mood redesign has been included.
