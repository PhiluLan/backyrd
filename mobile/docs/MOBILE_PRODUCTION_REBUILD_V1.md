# Mobile Production Rebuild V1

## Product boundary

Mobile now has one active authenticated Product path. Server Product-entry status controls onboarding; Home free text and the Decision tab invoke `decision-v13`; a response is renderable only when North-Star is explicitly active. There is no client ranking, client AI reason generation, legacy Decision fallback, legacy Taste write, or local onboarding authority.

Decision events are distinct: a visible card records one exposure; Weiter/swipe records no feedback; Passt and Nicht passend are explicit canonical moment feedback; Route records navigation intent. Continuation stays bound to the server Decision.

## Startup and releases

Startup is ordered as runtime configuration, one Supabase client, one Auth provider, font readiness, safety/consent guards, then routing. Recoverable configuration, auth, network, and rendering failures show Product states instead of crashing the tree.

Expo Updates no longer reloads JavaScript from a mounted tab. Native Expo launch selection applies a compatible update on clean launch. Runtime `1.1.0` intentionally requires a new native TestFlight build; it is not pushed into the installed `1.0.0` runtime.

The Production build fails if Supabase, Maps, OAuth, update channel, runtime, contracts, TypeScript, lint, or the forbidden-path scan fails. Internal Release Status shows native version/build, runtime, channel, update ID/group, embedded-versus-OTA source, emergency launch state, and recent update errors without credentials.

## Visual system

The shared mobile theme is near-black with off-white editorial type, Backyrd pink for interaction, and acid for editorial emphasis. Home, Decision, navigation, auth/onboarding, Spot, Map, Moments, Profile, Settings, review, safety, loading, empty, and error surfaces use the same token direction. Home asks “WOHIN GEHT’S HEUTE?” and sends free text directly to Decision.

No externally supplied reference images were present in the task context, so visual validation targets the written brand direction rather than pixel comparison.

## Removed active debt

- Client OpenAI implementation and EAS client-key path
- V3/V9 Decision debug and old Decision renderer dependencies
- tab-mounted `Updates.reloadAsync()`
- direct profile repair writes during auth hydration
- copied service-role Edge Functions and seed script under Mobile
- repository backup/before files
- client-side direct achievement insert, replaced by an authenticated idempotent RPC

Historical backend records and frozen Decision/User-Intelligence semantics are unchanged.
