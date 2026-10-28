# Admin spot category filter

The `/spots` list filters by current `classification.primary_category`, using the same canonical catalogue labels as the profile editor. It combines with the existing name/city search and publication-status filter. Filtering and category counts operate on the full loaded list before its 25-item display pages. Backend pages are exhausted with requests of up to 2,000 rows (one request for the current catalogue), so choosing a category never searches only the visible page. Changing or clearing filters resets the page. `kategorie=EAT` (or `unassigned`) is preserved alongside `suche`, `status` and `zeitraum` in the URL.

The existing authenticated, Admin-only `admin_spots_intelligence_v1` RPC receives an additive JSON response: `categorySource: WORLD_AUTHORING_CURRENT_V1` and nullable `spots[].primary_category`. No caller signature, analytics fields, summary, profile data, grants or RLS change. No new per-spot request is added for filtering. Missing, duplicated or inconsistent catalogue pages fail visibly instead of producing incomplete category counts; a 100,000-row safety bound avoids unbounded client loading.

For approved spots the category comes from the latest SPOT-scope category claim, ordered like the authoring editor. It must be public, supporting, known, currently valid, and present in that claim's canonical registry. The latest claim is selected before validating it: an unknown/held/private/expired/future/invalid successor produces null instead of reviving an older category. Other lifecycle statuses have no available authoring category and return null. Legacy category IDs and spot names are never used to guess a current World category.

The UI only enables category filtering when the response marker and all row categories are present and recognized. An older backend or failed capability is distinct from a real null category. A direct category URL with unavailable metadata displays an actionable message rather than “no matches”. “Filter löschen” restores all categories. Category counts respect the current text and status filter, but ignore the selected category itself.

Required forward migration: `20261028200651_admin_spots_primary_category_v1.sql`. This updates only a read function; it does not write or delete spot data or touch Decision. Deployment must apply this exact migration through the approved migration release process before enabling the new UI. Until then the previous list still works and category filtering remains unavailable.

Validation: `supabase/tests/admin_spots_primary_category_v1.sql` exercises the real canonical writer and actual Admin/non-Admin authorization against the full schema; executable filtering/rendering tests; TypeScript; targeted ESLint; production build. The actual SQL is also tested with synthetic fixtures in a temporary local PostgreSQL database: whole-catalogue/later-page categories, unsafe successors, byte-equivalent existing metrics/summary, preserved anonymous denial, authenticated Admin success, ordinary/missing-identity denial. Run that opt-in integration test with:

```
BACKYRD_ADMIN_CATEGORY_DB_CONTAINER=<local-supabase-db-container> node --test admin-dashboard/test/spot-category-filter-db.test.mjs
```

The integration runner creates and removes only its own randomly named synthetic database. It never targets the production database.
