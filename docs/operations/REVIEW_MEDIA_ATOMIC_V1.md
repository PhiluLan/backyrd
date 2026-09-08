# Review Media Atomic V1

This candidate introduces one reservation-bound private Review-media contract for Standard, Smart, and Quick Reviews.

The authenticated client first reserves an exact Review ID, Spot ID, `review-photos` object path, content type, maximum byte size, and short expiry. Storage accepts only the reserved object with `upsert: false`. One transactional finalization function then validates the reservation and stored object and publishes the Review, its media reference, and Smart Review evidence when applicable. Failed upload or binding leaves no published Review or Smart Review evidence. Exact retries are idempotent.

The contract does not grant direct client insertion into `review_photos`, does not expose a public upload route, and does not place service-role authority in Mobile. Foreign users, Reviews, paths, buckets, MIME types, missing, expired, or consumed reservations remain fail-closed.

Candidate schema and Public ACL fingerprints and rollback-only reconstruction are versioned under `review-media-atomic-v1`. Historical fingerprints and reconstruction files remain unchanged.
