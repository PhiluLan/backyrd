# Entitlement and price contract

The entitlement release uses stable attribute keys. UI labels and step numbers are not authority.

## Basic

Basic covers public identity/location/contact, primary category/place types, description, the new price level, payment methods, takeaway, service model/format, cuisines, food specialities, offering groups, regular/special/kitchen hours, and current state. Public email is deliberate `contact.public_email`; ambiguous legacy `spots.email`, account, login, and billing email have no mapping.

## Pro and Admin

Pro adds objective laptop/stay rules, concrete capacity/group range, reservation/external-consumption rules, amenity components, pet/age rules, and concrete Accessibility components. Admin has the same attribute-key scope across spots, derived from server-side `profiles.is_admin`; it is not read from JWT user metadata.

`research.subjective_fits` is excluded from objective Owner/Admin authority. Text description is explanation-only and may be shadow-held for moderation without hiding the rest of the spot.

## Commercial neutrality

Subscription selects only Basic versus Pro authoring scope. It is absent from claims, source policy, resolution inputs, snapshots and projections. Counterfactual tests prove that identical facts under Basic/Pro contexts produce byte-identical claim receipts. Pro without extra facts changes nothing; an extra confirmed Pro fact changes only that knowledge.

## Price

`operation.price_level` is the versioned five-level category-relative value: `VERY_LOW`, `LOW`, `MEDIUM`, `HIGH`, `PREMIUM`. Labels are maintained separately in German and English. No currency conversion or cross-category numeric equivalence exists. The published `operation.price_range` definition remains historically valid but is not silently migrated and is not writable through the 3B entitlement release.
