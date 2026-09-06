# D2/D3 Event Admin Form Reliability Re-certification v28 — 2026-09-06

## Authorization and scope

The Founder accepted the local Event Admin form remediation and explicitly authorized its normal pull request, complete required checks, canonical-main merge, and Admin Production release. The product change hardens only the existing manual Events Admin editor: structured error presentation, client-side validation, Spot autocomplete, and free unmatched venue authoring through the existing contract.

This additive re-certification changes only evidence/freeze metadata, associated verification tests, the affected CI scope guard, and canonical product-lineage metadata. It does not change the Decision Engine, ranking, mood, taste, Event semantics, Consumer surfaces, Spot data, Admin authorization, database schema, RLS, RPCs, Edge Functions, or Supabase runtime deployment.

## Preserved production identity

- Decision Engine source hash: `cad2c4ea94817d2facbd54db92f55f3286acecf4d1e8a71dda414431b76cf000`
- Protected semantic source-set hash: `e7e30ac69f03fca479e75cb9e17def687e58635f7549760c3fbcdbda78d88909`
- Production function: `decision-v13`, version `124`, JWT verification enabled
- Production bundle hash: `a920d38405534f8fdd02e13934988b97fcd4dec12e9c93d8f8dd8bed8d4dac13`
- Authorized semantic source commit: `e1043603cba0f6880d74a19d52701510dfc97d48`

## Evidence delta

- Existing Event editor now formats Supabase/API errors centrally and never renders an object through string coercion.
- Active Production constraints for title, description, categories, age, and price are checked before a draft or publish write.
- Spot selection is an accessible, bounded, accent-tolerant autocomplete; changing its text clears the previous Spot identity.
- Free venues use the existing `event_venues_v1` unmatched contract and never create a Spot.
- Admin reliability tests cover search, address matching, free venue payloads, stale Spot clearing, validation, and object-error rendering.
- Canonical product lineage binds the exact Admin candidate tree with Production verification false until the canonical-main deployment completes.

## Re-certification outcome

The D2 hard-gate constitution, Decision semantics, Event semantics, protected semantic source set, and Production Decision runtime identity remain unchanged. D2/D2.1/D2.2/D3.1 are re-bound only to the additive evidence set. This re-certification itself requires no Supabase runtime deployment.
