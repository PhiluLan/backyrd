# Registry Governance Contract and Change Policy

`backyrd.world-knowledge.registry-governance@1.0` binds registry version/hash, predecessor, change class, timestamp, role-based approval record, machine-readable summary, compatibility status, deprecations, directed aliases, and its own SHA-256 hash.

Change classes are `LABEL_ONLY`, `ADDITIVE_DEFINITION`, `ADDITIVE_ALLOWED_VALUE`, `SEMANTIC_CHANGE`, `DEPRECATION`, `REMOVAL`, and `KEY_REPLACEMENT`.

Rules enforced by `validateRegistryTransition`:

- labels may change without changing keys or semantics;
- definitions use new stable keys; existing keys cannot silently acquire new meaning;
- enum additions must retain every prior value and every other semantic property;
- semantic change requires a major registry version;
- deprecation retains the key and supplies a compatibility plan;
- removal requires explicit deprecation metadata and compatibility plan;
- replacement needs a directed alias. `NAVIGATION_ONLY` is not semantic equality; equality must be explicitly reviewed and recorded;
- unknown governance/registry identities and mismatched hashes fail closed.

Historical snapshots keep their original registry version and hash. A new runtime must retain the old registry artifact or use an explicit compatibility adapter; it must not reinterpret a historical key using a newer definition.
