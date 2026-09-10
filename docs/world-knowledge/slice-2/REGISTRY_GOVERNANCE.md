# Registry Governance Contract and Change Policy

`backyrd.world-knowledge.registry-governance@1.0` binds registry version/hash, predecessor, change class, timestamp, a separately accepted approval record and authority, machine-readable summary, compatibility status, deprecations, directed aliases, and its own SHA-256 hash. An inline role or approval identifier is audit metadata, not authority.

Change classes are `LABEL_ONLY`, `ADDITIVE_DEFINITION`, `ADDITIVE_ALLOWED_VALUE`, `SEMANTIC_CHANGE`, `DEPRECATION`, `REMOVAL`, and `KEY_REPLACEMENT`.

Rules enforced by `validateRegistryTransition`:

- labels may change without changing keys or semantics;
- definitions use new stable keys; existing keys cannot silently acquire new meaning;
- enum additions must retain every prior value and every other semantic property;
- semantic change requires a major registry version;
- deprecation retains the key, supplies a compatibility plan, and declares the earliest compatible removal version;
- removal is allowed only when an immutable, validated earlier registry artifact already deprecated the key and the target version satisfies that historical plan; deprecating and removing in one release fails closed;
- replacement needs a directed alias whose source is replaced/deprecated and whose target exists. Duplicate targets, dangling targets, self-links and cycles fail closed. `NAVIGATION_ONLY` never means semantic equality; `SEMANTICALLY_EQUIVALENT` also requires matching definition semantics and an accepted authority permitted to approve equivalence;
- every transition moves forward according to its change class: compatible changes advance the minor version while semantic changes, removal and replacement advance the major version;
- unknown governance/registry identities and mismatched hashes fail closed.

Both previous and next registry shapes are parsed and content-hash checked before comparison. Historical releases, shapes and approval bindings used as deprecation proof are validated again; a known-looking version string cannot mask modified definitions.

Historical snapshots keep their original registry version and hash. A new runtime must retain the old registry artifact or use an explicit compatibility adapter; it must not reinterpret a historical key using a newer definition. Slice 2 proves the injectable authority boundary with synthetic accepted records; production identity, credential, revocation and approval workflow integration is intentionally absent.
