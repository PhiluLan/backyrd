# D2/D3 v21 — Gate-7 operations-truth re-certification

## Evidence change

Founder/CTO authorized the exact Gate-7 application-schema fingerprint
`90c8b5f88b8d5ede0a86822e42558f8186ba0f8b5d33a78d035afc25e7807083`
after production forensics proved two observability defects in the existing
Founder operations snapshot. The embedding queue uses the canonical lowercase
`failed` state, while the prior snapshot queried uppercase `FAILED`. Historical
Safety dead-letter jobs whose cases are already decided or closed are retained
as audit evidence but are not current actionable queue failures.

The forward migration changes only the service-role operations snapshot. It
does not alter queue processing, moderation, Decision, Product, Auth, Mood,
Trust, Safety, data ownership, or consumer-visible semantics. The Admin view
now treats actionable queue failures as critical and reports the independently
verified AWS daily Storage and weekly database backup state.

## Production identity

The active `decision-v13` runtime remains version 124 with `verify_jwt=true`.
Its 41 deployed sources remain byte-identical to canonical Decision source at
`c1fcb4ad76e21b52c0d064192e129abe6f554e8e`, with bundle SHA-256
`a920d38405534f8fdd02e13934988b97fcd4dec12e9c93d8f8dd8bed8d4dac13`.
No Decision source or configuration is changed by this re-certification.

## Fail-closed conclusion

The v21 contract supersedes v20 only for the newly proven operations evidence.
It jointly binds the unchanged Engine and Production identity, the complete
protected source set, the updated evidence set, the exact application-schema
fingerprint, and all dependent D2.1/D2.2/D3.1 freezes. Engine drift, a new
source, Production identity drift, or later un-recertified evidence drift
continues to block.
