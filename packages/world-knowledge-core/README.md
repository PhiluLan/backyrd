# @backyrd/world-knowledge-core

Pure TypeScript foundation for versioned Spot knowledge, append-only claims, deterministic resolution, qualitative trust, temporal state, bounded derived knowledge, governed registry/source policies, record-bound verification, and the sanitized `WorldKnowledgePort`.

This package is not connected to a Production or Decision consumer. Slice 3B adds accepted server-authoring contracts and a separate, unactivated persistence migration. Architecture and contract documentation starts at [`docs/world-knowledge/README.md`](../../docs/world-knowledge/README.md).

Slice 2 governance, audit, policy and the isolated read-only compatibility adapter are documented at [`docs/world-knowledge/slice-2/README.md`](../../docs/world-knowledge/slice-2/README.md).

Slice 3B authority, entitlement, persistence, shadow-resolution and retention boundaries are documented at [`docs/world-knowledge/slice-3b/README.md`](../../docs/world-knowledge/slice-3b/README.md).

```bash
npm run world-knowledge:typecheck
npm run world-knowledge:test
```
