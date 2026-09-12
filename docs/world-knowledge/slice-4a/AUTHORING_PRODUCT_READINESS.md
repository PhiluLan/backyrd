# Authoring product-readiness closure

## Audited evidence

The audit compared Registry 1.1, the legacy category contract, Admin/Mobile labels, the Slice-4A mapping matrix, and the minimized local export from the already authorized rehearsal. No new Production query was made.

The retained export contains 447 identities: 410 active/published and 37 archived. Its category vocabulary is: Restaurant 210, Bar 63, Café 58, Unterkunft/Hotel 35, Museum 28, Besonderes Erlebnis 27, Aktivität 24, Aussichtspunkt 1, Nachtleben 1. The 4,282 transform results contain 447 direct identity bindings, 327 allow-listed normalizations, 3,202 missing-provenance prefills, 269 ambiguous results, and 37 lifecycle-only exclusions. The counts describe technical presence, not confirmation or completeness.

## Compatibility findings

| Legacy/current concept | Treatment | Reason |
| --- | --- | --- |
| Restaurant, Bar, Café, Museum, Nachtleben | NORMALIZED | Explicit legacy-to-primary-category mapping already exists. Founder/Admin confirmation remains required. |
| Unterkunft/Hotel, Aktivität | NEEDS_PRODUCT_DECISION | The broad legacy term can span several World place types; it remains a visible manual choice. |
| Besonderes Erlebnis, Aussichtspunkt | NEEDS_PRODUCT_DECISION | More than one canonical primary category can be defensible; no automatic mapping is invented. |
| Restaurant, Brasserie, Bistro, Café, Bar, Pub, Imbiss, Take-away, Fast Food | CANONICAL | Existing Registry 1.1 place types. |
| Wider non-gastronomic place-type catalog | NOT_CONFIGURED | Grouped, category-specific choices can be saved append-only in the private local candidate ledger. They do not become Claims, Verification, resolution input or World facts until a governed Registry release approves exact keys. |
| Existing seven cuisines; Pizza, Burger, Sushi; existing offering groups | CANONICAL | Registry 1.1 values remain saveable and are displayed in separate concepts. |
| Wider cuisine, speciality, meal, drinks and amenity catalog | NOT_CONFIGURED | Audited vocabulary is visible/searchable and can be retained in the private local candidate ledger. It cannot bypass the canonical Registry or enter Claims, verification, resolution or snapshots. |
| Mood, suitability, popularity and quality labels | PROHIBITED | Subjective/contextual statements are not objective World facts. |
| Numeric N4 confidence | PROHIBITED | It is not World Trust. |
| Legacy email | AMBIGUOUS | Public-contact semantics are unproven. |
| Legacy ordinal price | AMBIGUOUS | It cannot be silently reinterpreted as the five-level category-relative price contract. |

## Category → place type → section matrix

The machine-readable source is `AUTHORING_TAXONOMY_VERSION = backyrd.world-knowledge.authoring-taxonomy@4a.2` in `packages/world-knowledge-core/src/authoring-taxonomy.ts`; its SHA-256 binds the complete matrix and option states.

| Main category | Place-type families shown | Dependent authoring |
| --- | --- | --- |
| Eat | Restaurant, brasserie, bistro, food-led bar/pub, takeaway formats | Cuisine, specialities, offerings, meals, service, kitchen hours |
| Drinks | Bar, pub, brewery, taproom, wine/cocktail bar, lounge | Drinks/offerings, service, kitchen hours where applicable |
| Coffee & daytime | Café, bakery, patisserie, bistro | Cuisine/specialities, breakfast/brunch/lunch, service |
| Nightlife | Nightclub, music club, bar/pub/lounge, concert venue | Drinks/offerings, service, age/current-state rules |
| Culture & arts | Museum, gallery, theatre, cinema, concert venue, cultural centre, library | Place type, hours, price, objective amenities/accessibility |
| Entertainment | Cinema, theatre, concert/comedy venue, arcade, escape room, bowling | Place type, hours, price, capacity, rules and amenities |
| Activities & play | Arcade, escape room, bowling, mini golf, workshop, amusement park | Place type, hours, price, capacity, rules and amenities |
| Sport & movement | Gym, sports centre, climbing, pool, rink, court, stadium, yoga | Place type, hours, price, capacity, rules and amenities |
| Outdoor & nature | Park, trail, viewpoint, waterfront, botanical garden, reserve | Place type, hours when applicable, accessibility and facilities |
| Wellness & relaxation | Spa, sauna, thermal bath, massage, yoga, pool | Place type, hours, price, access rules and facilities |
| Shopping & markets | Shop, market, shopping centre, concept store, seasonal market | Place type, hours, price/payment, accessibility |
| Stay | Hotel, hostel, guesthouse, campground, holiday apartment | Place type plus food/service only when actually offered |
| Community & social | Community/coworking/club/youth/cultural centre | Place type, hours, capacity, access rules and facilities |
| Attractions & landmarks | Landmark, viewpoint, zoo, aquarium, amusement park, visitor centre | Place type, hours, price, access and facilities |
| Temporary places | Event venue, pop-up, festival site, seasonal market | Date-bound operation plus offerings only when applicable |
| Other | Other place (`NOT_CONFIGURED`) | The Founder can preserve an explicit review candidate; no canonical place-type meaning is invented. |

Switching the category changes the visible place-type allowlist immediately. A previously stored incompatible type is not deleted: the UI exposes a conflict and requires an intentional replacement. The server rejects a new incompatible Registry-1.1 combination.

## Time authoring truth

Weekly venue and kitchen schedules use the same canonical `{ day, intervals: [{ start, end }] }` representation. A missing weekday is not answered; a weekday with an empty interval list is explicitly closed; a non-empty list is open and can contain up to eight intervals, including overnight intervals. Special dates use `{ date, status, intervals }`, remain separate, and require intervals only when open. Runtime validation happens before the RPC and at the database boundary.

## Remaining Product/CTO decision

Registry 1.1 intentionally remains historically unchanged. The broader non-gastronomic place types, cuisines, specialties, meals, drinks and amenities in the authoring audit are `NOT_CONFIGURED`, not fake canonical facts. These choices can nevertheless be retained as local, review-only authoring candidates so the Founder does not lose work. Candidate submission is server-authorized, category-aware, allowlisted, append-only and private; it never creates a Claim or enters a World snapshot. A governed Registry release must decide exact stable keys, English/German labels, category applicability and legacy normalization before any candidate may become World truth.
