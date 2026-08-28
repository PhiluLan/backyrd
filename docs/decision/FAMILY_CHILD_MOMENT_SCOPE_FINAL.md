# Family / Child Moment-Scope Final Closure

## Boundary

The canonical Decision already produced `socialContext=family_with_kids`,
`familyContext=FAMILY_WITH_CHILD`, and explicit `childAge`. The temporal
envelope adapter rejected `family_with_kids` because its learning-audience
allowlist contained only `family`; it also omitted child age entirely.

## Contract

- Canonical requested context retains `socialContext=family_with_kids`.
- The frozen N5.6 scope vocabulary receives `audience=family`, producing
  `CONTEXT:audience.family`.
- Explicit child age is retained as bounded numeric `requested_context`
  metadata. It is not copied into Taste concepts or scope keys.
- Explicit requested daypart is retained in the learning signature. Ambient
  execution daypart remains separate and cannot create a requested-time scope.
- Group remains reconstructable as canonical requested context but maps to
  `other`, because the frozen User Card has no `audience.group` scope.

Historical envelopes are immutable and are not repaired or reinterpreted.
The v2 envelope applies only to prospective Decisions.

## Verification

Controlled Family, Friends, Date, Solo, Work, and Group mappings use the one
shared adapter. Family evidence creates Global, Place-Type, and
`audience.family` samples from one independent outcome. Child age creates no
node. Current-N4 replacement leaves the resulting Card hash unchanged.
