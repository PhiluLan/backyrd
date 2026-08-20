# User Card Schema

`backyrd_user_card_snapshots_v1` stores one hashable, user-isolated card per user. It contains engine version, source watermark/count and ordered nodes. A node has concept, scope, polarity, knowledge state, affinity, confidence, HIGH eligibility audit, evidence composition/depth, contradictions, time range and a deterministic node hash.

`backyrd_user_intelligence_change_ledger_v1` records the derived node state, triggering chain identities, reason code and engine version. It intentionally excludes raw text and photos.

The tables are background-only in Sprint 2. Decision v13 continues to use its legacy taste path and no UI reads this snapshot.
