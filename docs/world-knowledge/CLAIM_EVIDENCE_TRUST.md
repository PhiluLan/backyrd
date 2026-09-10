# Claim, Evidence, and Trust model

## Append-only claim

Each claim binds:

- claim and contract identity
- attribute key and registry version
- Spot and area scope
- typed value and knowledge state
- actor type and source type
- optional source reference
- optional session provenance
- verification state
- observation and validity timestamps
- stance and visibility
- optional superseded claim
- canonical SHA-256 content hash

Correction is a new claim referencing one prior claim for the same attribute and scope. The prior claim remains in history. Duplicate claim IDs, foreign correction targets, unknown fields, invalid values, unknown versions, and hash mismatches fail closed.

## Separate dimensions

Resolution:

- `KNOWN_TRUE`
- `KNOWN_FALSE`
- `KNOWN_VALUE`
- `UNKNOWN`
- `DISPUTED`

Freshness:

- `CURRENT`
- `STALE`
- `EXPIRED`

Trust:

- `ASSERTED`: an authenticated actor made the claim
- `REFERENCED`: a source reference is bound
- `VERIFIED`: a defined verification state succeeded
- `CONFLICTING`: active evidence conflicts

Admin, verified Owner, payment, subscription, advertising, and sponsorship never upgrade trust. AI inference cannot be marked verified. No numerical confidence exists.

`provenanceSessionId` answers where an assertion was entered. It does not make that assertion `REFERENCED`. Private source IDs and URLs are never emitted in the World Knowledge port.
