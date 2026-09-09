# Decision semantic releases

This directory contains identity records only for genuine Decision, Mood,
Ranking, Taste, Learning or Trust semantic changes. The generator derives the
protected source hash and changed paths from Git; CI independently recomputes
them and runs the fixed D2/D3 evaluation set. A record does not declare itself
successful and is never required for presentation, ordinary Product, database,
Storage or release-evidence changes.

Create a record only under an authorized semantic work order:

```sh
node scripts/ci/generate-decision-release.mjs \
  --base-sha origin/main \
  --head-sha HEAD \
  --id <semantic-release-id> \
  --authorization <work-order-or-decision-reference> \
  --output decision-lab/releases/<semantic-release-id>.json
```
