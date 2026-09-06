# D2/D3 Events V1 Admin Navigation Re-certification v27 — 2026-09-06

## Authorization and scope

The Founder explicitly authorized an additive Decision-v27 evidence re-certification for the Events V1 Admin navigation scope of PR #212. The authorized product change exposes the already-existing Events Admin routes through the active Admin sidebar and adds contract verification for navigation, creation, management capabilities, and the existing Admin authorization boundary.

This re-certification changes only evidence/freeze metadata, the associated verification tests, and the affected CI scope guard. It does not authorize or introduce a Decision Engine, ranking, mood, taste, Event semantic, Consumer, Spot, Venue, database, RLS, RPC, Edge Function, or runtime deployment change.

## Preserved production identity

- Decision Engine source hash: `cad2c4ea94817d2facbd54db92f55f3286acecf4d1e8a71dda414431b76cf000`
- Protected semantic source-set hash: `e7e30ac69f03fca479e75cb9e17def687e58635f7549760c3fbcdbda78d88909`
- Production function: `decision-v13`, version `124`, JWT verification enabled
- Production bundle hash: `a920d38405534f8fdd02e13934988b97fcd4dec12e9c93d8f8dd8bed8d4dac13`
- Authorized semantic source commit: `e1043603cba0f6880d74a19d52701510dfc97d48`

## Evidence delta

- Active Admin Events navigation entry in the existing Intelligence sidebar
- Existing Events overview and clear `Neues Event` creation route
- Contract tests covering list/search/filter, create/edit/preview/publish/cancel, recurrence and occurrence administration, image upload, Spot/Venue selection, and the existing AdminGuard boundary
- Admin contract-test execution in the existing quality workflow
- Canonical product-lineage binding for the Admin candidate
- Fail-closed Decision D2 scope guard updated to require the complete v27 source/evidence/freeze chain

## Re-certification outcome

The D2 hard-gate constitution, Decision semantics, Event semantics, protected source set, and Production runtime identity remain unchanged. D2/D2.1/D2.2/D3.1 are re-bound only to the additive evidence set. This re-certification itself requires no runtime deployment.
