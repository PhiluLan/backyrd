# Provider Constraints V1

## Google Places

Nearby Search (New) is called server-side with an explicit minimal field mask and bounded query plan. Returned names, addresses, coordinates, types, and other Google content are session-ephemeral in this pipeline. Only Google Place IDs are retained, because Google documents Place IDs as exempt from caching restrictions. Unmatched Place IDs remain identifiers only and cannot create Product Spots until a retainable official/open source establishes identity.

Google is a discovery and identity signal, not canonical Backyrd Product truth. It is not the sole source. No Google payload, rating, review, opening-hours record, photo, or category taxonomy is copied into Product truth. Google display attribution requirements remain applicable wherever Google content is shown. This workstream does not enable the public photo proxy; `google_photo_enabled` is false for imported Spot identities.

References:

- <https://developers.google.com/maps/documentation/places/web-service/nearby-search>
- <https://developers.google.com/maps/documentation/places/web-service/place-id>
- <https://developers.google.com/maps/documentation/places/web-service/policies>

## OpenStreetMap

OSM is the retainable systematic discovery source. Basel uses the named administrative area at `admin_level=8`, not a generic text query or rectangle labeled as Basel. The manifest records ODbL 1.0 and `© OpenStreetMap contributors`. Only normalized fields required for identity/relevance are retained; the raw Overpass payload is not committed.

## Official websites

Official web pages are evidence only. Fetching is HTTPS-only, rejects credentials in URLs, local/internal/metadata hosts, literal private IPs, and DNS resolutions to private networks. The default transport pins the validated public IP to prevent DNS-rebinding between validation and connection. Redirects are revalidated. MIME, byte size, redirect count, and timeout are bounded.

External content has `NONE` for instruction, tool, and canonical-write authority. Malformed or instruction-bearing content is never executed. Copyright-safe extraction stores bounded structured evidence and fingerprints rather than wholesale page copies.

## Secrets and personal data

Provider and Supabase privileged secrets are server-only. Browser/mobile keys are not reused for the pipeline. Supabase RLS is enabled on all operational tables and grants are service-role-only. The pipeline collects venue identity and public business contact information only; it does not collect unnecessary personal data.

References:

- <https://supabase.com/docs/guides/functions/secrets>
- <https://supabase.com/docs/guides/database/secure-data>
