# Founder Live Authoring compatibility matrix

This slice extends the existing canonical Admin and Owner surfaces. It does not create a demo tool, a second ledger, a Mobile runtime, or a Decision integration.

| Existing component | Decision | Result |
|---|---|---|
| Registry 2.1 definitions and runtime parsers | KEEP | They remain the only field/type/value boundary. |
| `world_owner_submit_claim_v1` / `world_admin_submit_claim_v1` | KEEP | Server authority, entitlement, verification and append-only correction remain unchanged. |
| Admin `/world-knowledge` | ADAPT | Uses the shared German authoring product and now completes write → rebuild → validated read. |
| Owner `/owner/world-knowledge` | ADAPT | Uses the same product with server-derived Basic/Pro scope. |
| Manual Spot JSON transfer in the normal UI | DEPRECATE | It is not part of the Founder workflow; technical transfer remains opt-in in Expert view only. |
| Current projection and `WorldKnowledgeReaderPort` | ADAPT | The existing contracts are unchanged; every successful authoring write is followed by the canonical rebuild and a runtime-validated read. |
| Legacy Spot DTOs and direct Spot writes | PROHIBITED | They cannot become World truth or bypass Claims. |
| Mobile and Decision consumers | KEEP / NO WIRING | This slice changes neither semantics nor runtime activation. |

## Product boundary

The normal view uses German labels, grouped controls and explicit knowledge states. Stable keys, hashes, raw JSON, claim identities and authority details are visible only after opening Expert view. Primary purpose, on-site offerings, conditional visit situations, conditional atmosphere and typical dayparts stay distinct. Typical dayparts never replace opening hours.

Corrections create a new Claim with `supersedes_claim_id`; no history is overwritten. A successful write is not presented as complete until the server rebuild succeeds and the result passes the canonical reader contract.
