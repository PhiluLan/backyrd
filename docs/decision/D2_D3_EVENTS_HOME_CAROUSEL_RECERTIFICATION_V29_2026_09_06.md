# D2/D3 Events Home Carousel Re-certification v29 — 2026-09-06

## Authorization and scope

The Founder explicitly authorized the Events Home horizontal carousel, normal pull request, canonical-main merge, Production release, and additive v29 Evidence re-certification. The product change is presentation-only: Mobile and Consumer Web now show several upcoming published Events as a manually scrollable horizontal row while preserving the existing card, detail route, single-card fallback, empty state, and chronological discovery contract.

This additive re-certification changes only evidence/freeze metadata, associated verification tests, the affected CI scope guard, and canonical product-lineage metadata. It does not change the Decision Engine, ranking, recommendation, mood, taste, Event semantics, Spot data, Admin authorization, database schema, RLS, RPCs, Edge Functions, or Supabase runtime deployment.

## Preserved production identity

- Decision Engine source hash: `cad2c4ea94817d2facbd54db92f55f3286acecf4d1e8a71dda414431b76cf000`
- Protected semantic source-set hash: `e7e30ac69f03fca479e75cb9e17def687e58635f7549760c3fbcdbda78d88909`
- Production function: `decision-v13`, version `124`, JWT verification enabled
- Production bundle hash: `a920d38405534f8fdd02e13934988b97fcd4dec12e9c93d8f8dd8bed8d4dac13`
- Authorized semantic source commit: `e1043603cba0f6880d74a19d52701510dfc97d48`

## Evidence delta

- Mobile and Consumer Web request several rows from the existing published Event discovery contract.
- The source query remains upcoming-first and ordered by `start_at`; no ranking or personalization is introduced.
- Multiple Events use manual horizontal scrolling without autoplay, forced snapping, pagination, or new Event fields.
- A 390 px visual probe confirms one 302 px card plus a 36 px preview of the next card.
- Single-event and zero-event states remain explicitly covered by Mobile and Web regression contracts.
- Canonical product lineage binds the exact Mobile and Consumer Web candidate trees with Production verification false until canonical-main deployment completes.

## Re-certification outcome

The D2 hard-gate constitution, Decision semantics, Event semantics, protected semantic source set, and Production Decision runtime identity remain unchanged. D2/D2.1/D2.2/D3.1 are re-bound only to the additive evidence set. This re-certification itself requires no Supabase runtime deployment.
