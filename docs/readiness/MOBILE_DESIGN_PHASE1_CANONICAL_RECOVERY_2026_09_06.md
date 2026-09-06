# Mobile Design Phase 1 canonical recovery

Founder authorization on 2026-09-06 permits the previously reviewed Phase 1
Mobile design to be integrated into canonical `main` and released as a
Runtime-1.1.0 Production OTA for physical iPhone acceptance.

## Source identity

- Original reviewed design commit: `00e8904f89b894200f938752df1827ca2060aa36`
- Current canonical baseline: `fbaca4422eba56cb337e4565b90b8612b732ef9a`
- Semantically integrated design source: `0e6930dfd3b8547bef4813a8f5fa8bfd18688472`
- Exact Mobile tree: `7c47ad192c4d2b776ba6c932c0c9cca9d612e24d`
- Runtime: `1.1.0`

The sole integration conflict was the Home surface. The recovered visual
hierarchy and the current Events V1 section were retained together. No file
outside the thirteen explicitly authorized Mobile presentation/dependency
paths changed in the Product source commit.

## Frozen contracts

The source diff contains no database migration, Edge Function, Decision
runtime, ranking, Auth, Push, Deep Link, learning, or shared Product-contract
change. Events V1 remains present. Production verification remains false until
the new EAS Production update group is registered and read back.

## Pre-deployment evidence

- Mobile TypeScript: PASS
- Mobile lint: PASS
- Mobile Product contracts: PASS
- Native intent/navigation/deep-link/push contracts: 24/24 PASS
- Map discovery scale: PASS
- Canonical Spot images: PASS
- Carousel geometry at 320/375/390/393/430: PASS
- Canonical Product Mood V1: PASS
- Decision Lab deterministic smoke: PASS
- Expo Doctor: 18/18 PASS
- Production release validator: PASS
- iOS Production export: PASS

Native screenshot review was intentionally omitted by direct Founder release
instruction. Physical iPhone acceptance is the authorized post-release visual
validation step.
