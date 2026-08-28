# Mobile image pipeline validation

## Root cause

Build 50 Home queried `spots.header_photo_path` directly and sorted by newest records. Many recent approved rows have no header path even though an approved `spot_photos` image exists. Mobile therefore received `null` and correctly rendered its old dark placeholder. Supabase Storage, iOS ATS, and `expo-image` were not the primary failure.

## Canonical display contract

Mobile now reuses `distribution_trust_spot_catalog_v1` for Product-visible discovery and applies one deterministic display precedence:

1. canonical projected header URL;
2. selected/approved photo URL;
3. legacy header path;
4. explicit branded fallback.

Home no longer reconstructs Product visibility in the client. Decision, Map, nearby cards, and Spot Detail use the shared resolver/renderer. Spot Detail also recognizes a valid header path when no gallery row exists.

The renderer uses HTTPS URLs, URI encoding, `expo-image` memory/disk caching, cover crop, stable recycling identities, loading feedback, and privacy-safe failure context. It does not weaken ATS, expose tokens, or use a privileged Storage key.

## Production read-only proof — 25 August 2026

The automated gate called the canonical Production discovery RPC and fetched the first bytes of five real Product images:

| Spot | Spot ID | Result |
|---|---|---|
| B1 Rooftop Bar | `1e71239c-acf3-4939-b51c-22681a2674aa` | 206 PNG |
| Baragraph | `7355270f-6207-4790-bc49-b9d53df5701d` | 206 PNG |
| VinOptimum Vinothek | `541e5e09-e8ac-4d1a-abba-af689591184d` | 206 PNG |
| Weinbar Invino | `d9755d46-535d-40fa-9d22-090831781b11` | 206 PNG |
| Bäckerei Kult Volta | `75ba6852-8bea-4be7-90fa-5c3438cc3a51` | 206 JPEG |

The exported Mobile Home rendered these Product URLs through `SpotArtwork`; the visual DOM exposed real `img` elements and the capture showed photographic pixels.

## Curated control audit

| Spot | Production state |
|---|---|
| Naturhistorisches Museum Basel | canonical photo renderable |
| Zoo Basel | canonical photo renderable |
| Volta Bräu | canonical photo renderable, including encoded path |
| KaBar | canonical photo renderable |
| ELYS Boulderloft | row exists, underlying object unreachable |
| Tierpark Lange Erlen | no canonical stored photo |
| Galizi | no canonical stored photo |

No Spot data was changed. Missing or stale media remains visible as an intentional fallback and is not disguised as pipeline success.

## Gates

- `npm run test:production-images`: five renderable real Product photos required
- shared Product-visibility and image-precedence contract tests
- TypeScript, Expo lint, static Product contracts, and production export
- 320/390/430 px visual captures

