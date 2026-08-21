# Backyrd Canonical Semantic Contract Audit

Status: read-only architecture/product audit

Proposed contract: `backyrd-canonical-semantics-v1`

Audit date: 2026-08-21
Production mutations: none

## Executive conclusion

Backyrd does not yet speak one semantic language. The frozen Decision Engine provides a strong canonical core—45 shared Taste concepts, a frozen 60-dimension N4 registry, a versioned N3 Current Moment, N5 projection rules and bounded N6 reason authorization—but Product producers still surround it with at least eight other languages: unrestricted profile text, favorite-spot onboarding, legacy mood tokens/clusters/concepts, an editable taxonomy graph, free-form legacy Spot Intelligence, v13 intent flags, Gold typed facts, and canonical Memory events.

The target is feasible without redesigning the engine. The correct move is a shared, versioned boundary contract plus adapters. It must preserve three distinct things:

1. what happened or was claimed;
2. what that input canonically means;
3. what Backyrd later infers.

The proposed machine-readable registry is [BACKYRD_CANONICAL_SEMANTICS_V1.proposed.json](./BACKYRD_CANONICAL_SEMANTICS_V1.proposed.json). It reuses the frozen 45-concept Taste registry and the frozen 60-dimension N4 registry. It does not propose new N4 dimensions.

## 1. Scope and evidence inspected

The audit traced current implementations in:

- Mobile profile, profile onboarding, Decision onboarding, Explore/Search, Review, Smart Review, Decision and Spot interaction flows;
- Public/Owner web profile, taxonomy, legacy Spot Intelligence and Gold authoring surfaces;
- Admin Review, Mood, Taxonomy, Spot, legacy Intelligence and Gold authoring surfaces;
- shared review contracts;
- N2 Memory bridge, User Intelligence worker, N3/N4/N5 Decision package, deterministic orchestrator and N6 Shadow runtime;
- canonical migrations for profiles, reviews, Memory, Taste, N4, Product moods, Basel Gold and Gold authoring;
- the linked project's non-private semantic catalogs: 14 categories, 118 currently valid legacy mood-token rows, 16 legacy mood concepts, 11 mood clusters, 48 active taxonomy nodes, 45 Taste concepts and 60 N4 dimensions.

The linked project read confirms schema/runtime drift: for example `categories.id` is UUID in the linked project although the early repository migration declares `bigserial`, and the current branch's Gold fact catalog is not present in the linked REST schema. This audit therefore distinguishes **repository target** from **currently deployed catalog**. No private User, Review or Spot content was read for this audit.

## 2. The mandatory three-layer model

| Layer | Meaning | Valid examples | Must never contain |
|---|---|---|---|
| A — OBSERVED / RAW | attributable action, selection, utterance or source claim | raw request text; selected Review mood; owner proposal; save; review text | affinity, inferred confidence, “User likes X” |
| B — CANONICAL SEMANTICS | versioned normalized event, fact, context or concept | `spot_opened`; `vibe.cozy`; `social_context=family_with_kids`; `suitability.rain=SUITABLE` | ranking score; unqualified owner truth |
| C — DERIVED INTELLIGENCE | reproducible inference over canonical sources | N4 presence/confidence; User Card node; contradiction; N5 projection; authorized reason | raw private history; direct client writes |

### Current layer violations

| Path | Present behavior | Violation | Required boundary |
|---|---|---|---|
| `mobile/lib/ai/userProfile.ts` | turns searches and any Review mood directly into preferred/disliked moods | A → C in client code; Review existence/mood becomes preference | block from canonical engine; use User Card read only |
| `mobile/lib/ai/buildUserPreferences.ts` | weights Reviews=3, Reservations=2, Searches=1, Spot moods=1 | Interest/intent/experience collapsed into signed preference | deprecate/block; N2 → shared runtime only |
| Decision onboarding | selected favorite Spots write favorites, ML `decision_like`, Place-Type preference | self-declared anchors become several legacy behavioral stores | canonical `onboarding_preference` with explicit source and N4-at-event-time |
| Profile `interests/personality` | arbitrary comma-separated text displayed as Taste | raw display text looks like knowledge | display-only until controlled self-declaration adapter exists |
| legacy `spot_intelligence_v1` | admin/owner free tags + `is_verified` | claims, facts and interpretation share one row | block from canonical N4; migrate only provenance-known facts |
| legacy `spot_mood_concepts` | manually editable concept strength/source | direct derived concept editing | legacy/display-only; canonical N4 remains evidence-derived |
| v13 intent | free text creates flags, categories, audiences and occasions in a private vocabulary | B is duplicated outside N3 | emit canonical Current Moment input and hard/soft intent explicitly |
| Gold authoring | typed facts are accepted correctly, but several `N4_EVIDENCE` fields never map to N4/read package | B exists but disappears downstream | complete deterministic adapters; do not invent concepts |
| `laut` Review mood | mapped to negative `vibe.lively` | noise observation and lively atmosphere are coupled by frozen semantics | retain versioned behavior; future change requires explicit contract version |

## 3. Producer audit

| Producer | Raw store/input | Current normalized language | Engine use | Assessment |
|---|---|---|---|---|
| Profile | `profiles.interests`, `profiles.personality` text | none | not canonical User Card input | UNMAPPED / DISPLAY_ONLY |
| Profile onboarding | identity, city, age | profile fields | city used independently; age is identity, not preference | PARTIAL |
| Decision onboarding | 3–8 selected approved Spots | favorites, ML event, legacy Place-Type preference | not canonical `onboarding_preference` | LEGACY / WRONG_MODEL |
| Standard Review | text + two mood strings/IDs | Product Mood validation on new REAL/IMPORT rows | only Smart Review produces N2 Experience today | PARTIAL |
| Smart Review | spot, user, moods, optional text, photo, Decision link | `verified_visit` plus source-bound Review facts | shared runtime qualifies text/moods | ALIGNED with one origin gap noted below |
| Review moods | 12 Product moods | 8 mapped, 4 display-only | frozen N5.8 supports mapped tokens only when sentiment direction is known | PARTIAL |
| Review text | raw text | deterministic frozen lexical rules | concept-specific direct evidence; unsupported text = UNKNOWN | ALIGNED |
| “Moments” community surface | Reviews/social posts shown as Moments | content vocabulary, not N3 | should not become current intent or durable Taste merely by display | LEGACY NAMING COLLISION |
| Decision Request | `decision_sessions` + handoff/ML context | N3 adapter plus separate v13 intent | N3/N5 consume adapter | PARTIAL |
| Search | `user_searches.query`, taxonomy search, semantic embeddings | multiple token/embedding paths | legacy helpers infer Taste from search; canonical N2 does not | FRAGMENTED |
| N3 | frozen Current Moment schema | 21 typed fields with provenance/confidence/UNKNOWN | N5 and Decision package | CANONICAL |
| Opens | server RPC product action | `spot_opened` | Interest only | CANONICAL |
| Saves | favorites trigger | `saved` / `save_removed` | deliberate Interest only | CANONICAL |
| Navigation/Reservation | product action/reservation source | `navigation_intent` / `reservation_intent` | Intent only | CANONICAL |
| Visit | qualified Smart Review + owned photo | `verified_visit` | Experience only | CANONICAL |
| User Card | immutable N2 + canonical N4 + qualified Review facts | frozen N5.7/N5.8/N5.8.2/N5.8.4 | N5 projection | CANONICAL |
| Categories | 14 live data rows | ad-hoc name → 10 Place Types in multiple files | v13 and Decision repository | MAPPABLE, DUPLICATED ADAPTERS |
| Taxonomy | 48 active live nodes; feature/service/offering/subcategory | independent graph with synonyms/weights | mobile discovery/embeddings, not canonical N4 | LEGACY_ONLY / MAPPABLE BY POLICY |
| Gold Spot Facts | 32 typed proposed fields | accepted facts + sources | partial qualification to N4 | PARTIAL |
| Admin/Owner legacy Spot Intelligence | arrays/free text | private vocabulary | v13/embedding legacy consumption | LEGACY / BLOCK_FROM_CANONICAL |
| Owner Basic/Pro Gold | same typed fact/proposal contract | canonical fact model | partial N4 mapping | PARTIAL; no separate Pro language |
| N4 | 8 facts + 45 shared concepts + 7 frozen extensions | evidence-bound snapshot | User Intelligence and Decision package | CANONICAL core |
| v13 retrieval | embeddings + categories + legacy fields + intent flags | private retrieval semantics | produces candidate universe | PARTIAL; retrieval may remain legacy, truth may not |
| N5 | frozen projection of canonical User Card for Current Moment | shared concept keys/scopes | deterministic/N6 input | CANONICAL |
| N6 reasons | four positive reason codes + two uncertainty codes | candidate-specific authorization | validated structured output only | CANONICAL but narrow |

### Smart Review origin detail

The bridge requires `reviews.product_evidence_origin='smart_review_v1'` plus a user-owned photo before producing `verified_visit`. The newer Review provenance columns separately use `review_origin='SMART_REVIEW'`. Two origin fields currently express adjacent meanings and need one explicit adapter rule; neither may be guessed for historical reviews.

## 4. Vocabulary inventory

### 4.1 Canonical engine core

`backyrd_taste_concepts_v1` contains 45 concepts:

- VIBE (11): cozy, relaxed, romantic, lively, quiet, social, inspiring, playful, elegant, authentic, urban;
- ENERGY (3): calm, balanced, energetic;
- SOCIAL_STYLE (5): solo-, conversation-, group-, family-, romantic-friendly;
- OCCASION (5): work-, celebration-, morning-, afternoon-, evening-friendly;
- PRICE (3): budget, balanced price, premium;
- DISCOVERY (3): mainstream, hidden gem, novel;
- CHARACTER (3): design-led, authentic character, distinctive;
- ENVIRONMENT (2): indoor, outdoor;
- PLACE_TYPE (10): cafe, bar, restaurant, nightlife, culture, outing, activity, experience, hotel, other.

The frozen N4 registry adds eight factual dimensions (`category`, `place_type`, `city`, `price_level`, `accessibility`, `environment`, `reservation_character`, `duration_character`) and seven interpretation dimensions (`planning.low_friction`, `planning.high_commitment`, `occasion.kids_friendly`, `occasion.group_friendly`, `context.night_friendly`, `context.weekday_friendly`, `context.weekend_friendly`) for a total of 60. The linked project confirms exactly 60.

### 4.2 Product Review moods

| Product mood | Canonical meaning | Authority/status |
|---|---|---|
| gemütlich | `vibe.cozy` | CANONICAL/MAPPABLE |
| lebendig | `vibe.lively` | CANONICAL/MAPPABLE |
| romantisch | `vibe.romantic` | CANONICAL/MAPPABLE |
| laut | `vibe.lively`, negative tendency | CANONICAL under frozen N5.8; semantically coarse |
| leise (`ruhig`, `quiet`) | `vibe.quiet` | CANONICAL/MAPPABLE |
| authentisch | `character.authentic_character` | CANONICAL/MAPPABLE |
| versteckt | `discovery.hidden_gem` | CANONICAL/MAPPABLE |
| modern | `character.design_led` | CANONICAL/MAPPABLE |
| urban | none | DISPLAY_ONLY despite canonical `vibe.urban`; mapping decision missing |
| chillig | none | DISPLAY_ONLY although N3 interprets it as relaxed; mapping decision missing |
| rustikal | none | DISPLAY_ONLY; no frozen concept |
| instagrammable | none | DISPLAY_ONLY; should not become Taste automatically |

The frozen N5.8 mood registry also recognizes `ruhig`, `hektisch` and `katastrophal`. `ruhig` is an alias of Product `leise`; `hektisch` is not selectable in the controlled Product vocabulary; `katastrophal` supplies outcome valence but deliberately no concept.

### 4.3 Legacy live mood language

The linked `mood_tokens` table still marks 118 rows valid. It mixes:

- canonical-looking moods (`gemütlich`, `ruhig`, `lebendig`, `romantisch`);
- place/product facts (`coffee`, `burger`, `pizza`, `craft beer`);
- audiences/occasions (`family`, `kids`, `afterwork`, `sonntag abend`);
- marketing/style terms (`instagrammable`, `trendy`, `Gault Millau`);
- malformed/test tokens (`test`, `test1`, `test2`, `a`, `b`, `s`, `i`, `v`, `l`, `test a`, `test b`, typo `Frindly`).

These rows are not the controlled Product Mood registry. New Review validation correctly consults `backyrd_product_mood_vocabulary_v1`; legacy token validity must never itself authorize canonical Evidence.

The 16 live legacy `mood_concepts` (`Cozy`, `Chic`, `Urban`, `Intimate`, `Industrial`, `Minimal`, `Warm`, `Hidden Gem`, `Lively`, `Creative`, `Nature`, `Family-friendly`, `Foodie`, `Party`, `Romantic`, `Outdoor`) and 11 clusters (`misc`, `chillig`, `gemütlich`, `stylish`, `lokal`, `romantisch`, `party`, `kreativ`, `family`, `foodie`, `outdoor`) form a separate ontology. Some map cleanly, some are facts/place types, and some have no frozen concept. Status: LEGACY; adapter-required; blocked from canonical inference by default.

Exact classification of every currently valid live `mood_tokens.token_norm` value against the actual Product resolver:

- **MAPPABLE to a canonical concept (16):** `authentic`, `authentisch`, `belebt`, `cozy`, `gemütlich`, `hidden`, `laut`, `lebendig`, `lebhaft`, `leise`, `lively`, `modern`, `quiet`, `romantisch`, `ruhig`, `versteckt`.
- **Accepted Product mood but deliberately no concept (4):** `chillig`, `instagrammable`, `rustikal`, `urban`.
- **INVALID/test (11):** `a`, `b`, `i`, `l`, `s`, `test`, `test a`, `test b`, `test1`, `test2`, `v`.
- **LEGACY/UNMAPPED (87):** `afterwork`, `alternativ`, `ambiente`, `apero`, `art`, `aussicht`, `bier`, `bierhalle`, `brewery`, `brewpub`, `burger`, `chic`, `cocktails`, `coffee`, `cool`, `craft beer`, `date`, `date night`, `datenight`, `entspannt`, `familie`, `family`, `fancy`, `fine dining`, `friendly`, `frindly`, `für familien`, `gault millau`, `geheimtipp`, `globetrotter`, `gourmet`, `green`, `gross`, `grosse gruppen`, `grün`, `günstig`, `gute cocktails`, `happy`, `hazy`, `hidden gems`, `hipp`, `historisch`, `hohe`, `homeoffice`, `hyperlocal`, `industrial`, `interessant`, `italienisch`, `kaffee`, `kids`, `klassisch`, `klassisch französisch`, `klassische cocktails`, `klettern`, `kultur`, `kunst`, `kunstvoll`, `lässig`, `local`, `locker`, `lokal`, `mit kindern`, `pizza`, `preiswert`, `pubfood`, `relaxed`, `retro`, `rooftop`, `rugby`, `samstag-abend`, `sanft`, `smart`, `sonnig`, `sonntag abend`, `sportlich`, `stylish`, `sunday vibes`, `sunny`, `sunsety`, `tanzen`, `touristen-spot`, `trendy`, `typisch schweizerisch`, `urig`, `viel`, `view`, `weinbar`.

“Unmapped” means only that the current canonical Product resolver has no authority for the value. Some are good candidates for an explicit future fact/concept adapter; none may be inferred from spelling alone.

### 4.4 Categories, Place Types and taxonomy

The 14 live categories are Aktivität, Aussichtspunkt, Bar, Besonderes Erlebnis, Café, Event, Kino, Museum, Nachtleben, Restaurant, Spaziergang, Unterkunft/Hotel, Weinbar and Wellness & Spa. Current adapters only explicitly recognize a subset. `Event`, `Kino`, `Spaziergang`, `Weinbar`, and `Wellness & Spa` fall to `other` in at least one current adapter even though another v13 text path may interpret them differently. Category-to-Place-Type mapping is duplicated in v13 and the Decision repository.

The 48 active taxonomy nodes cover subcategories, features, services and offerings: `art-museum`, `bakery`, `boutique-hotel`, `bowling`, `breakfast`, `brunch`, `brunch-cafe`, `burger`, `casual-dining`, `cocktail-bar`, `cocktails`, `craft-beer`, `craft-beer-bar`, `delivery`, `dog-friendly`, `escape-room`, `event-booking`, `family-friendly`, `fine-dining`, `garden`, `gluten-free-options`, `house-brewed-beer`, `live-music`, `local-products`, `natural-wine`, `nightclub`, `outdoor-seating`, `parking`, `pizza`, `private-room`, `pub`, `reservation`, `rooftop`, `rooftop-bar`, `specialty-coffee`, `sports-screening`, `steakhouse`, `sushi`, `table-service`, `takeaway`, `terrace`, `vegan-options`, `vegan-restaurant`, `vegetarian-options`, `waterfront`, `wheelchair-access`, `wifi`, `wine-bar`. This taxonomy is useful Product structure, but it is not equivalent to N4. Each node requires an explicit relation of `RAW_FACT`, `DISPLAY_ONLY`, or evidence mapping. The current generic `ml_weight` is not canonical concept confidence.

### 4.5 N3 Current Moment

N3 has 21 fields: social context, occasion, activity intent, vibe, energy, budget orientation, spontaneity, planning tolerance, duration, distance willingness, environment, orientation, novelty appetite, social intensity, city, calendar, weekday, daypart, local time, explicit constraints and other needs. It correctly distinguishes explicit, observed, inferred, memory-supported and unknown sources and explicitly forbids writing User Intelligence.

Product mapping is narrower than the schema. The adapter maps five social labels plus group, 10 vibe spellings, nine occasions, category constraints and time/city. Free-text N3 understands additional deterministic phrases, but currently lacks structured weather/rain and child-age dimensions. `Regentag` and `4-jährige Tochter` therefore cannot be fully represented in canonical N3 V1 even though v13 has private `wantsRainyDay`, `wantsKids` and occasion flags.

### 4.6 Gold facts and suitability

The repository target defines 32 typed fields. Its strongest canonical facts are Family/Kids tri-state, Age object, Environment enum, Rain enum, Activity multi-select, Conversation enum, Noise enum, Social suitability map, Accessibility capabilities, Reservation and Duration character, Time/daypart, and Atmosphere descriptors.

Only a subset currently has an end-to-end mapper:

- Family/Kids → `occasion.kids_friendly` + `social_style.family_friendly`;
- Environment → `environment` fact + indoor/outdoor concepts;
- Conversation → `social_style.conversation_friendly`;
- Noise QUIET/LOUD → `vibe.quiet`/`vibe.lively`;
- Place Type, Accessibility, Reservation, Duration → factual N4 dimensions.

Age, Rain and Activity remain suitability facts (correctly not invented as concepts). Atmosphere descriptors, Social suitability, Occasion suitability and Time/daypart are labeled `N4_EVIDENCE` in the catalog but do not currently produce corresponding interpretation evidence in the mapper. More importantly, the canonical N4 read adapter returns only interpretation concepts, Place Type, snapshot identity and freshness. Decision serialization only forwards N4 concepts plus product city/category/Place Type/open-now. Thus Age, Rain, Activity, detailed Accessibility and most suitability facts do not reach deterministic ranking or N6 reasons today.

## 5. Semantic drift and collisions

| Terms | Canonical decision | Current drift |
|---|---|---|
| gemütlich / cozy / cosy | `vibe.cozy` | aligned in Product Mood and N3; legacy cluster remains separate |
| ruhig / leise / quiet | `vibe.quiet`; `energy.calm` is related but not identical | N3 quiet creates both quiet and calm intent; Review uses quiet only |
| lebhaft / lebendig / lively | `vibe.lively` | aligned aliases; legacy party cluster may over-broaden |
| laut | observed noise/direct negative tendency, frozen mapping to negative lively | Gold noise LOUD creates positive presence of lively; same word can mean fact vs valence |
| romantic / date | `vibe.romantic` vs `social_style.romantic_friendly` | atmosphere and use-case are frequently conflated |
| family / kids | current audience vs Spot suitability vs learned preference | v13 uses them as categories/flags; N3 and N4 have distinct but incomplete paths |
| friends / group | current audience; `group_friendly` is Spot/use concept | v13 and N3 normalize different input sets |
| afterwork | current occasion | legacy mood token/cluster; N3 occasion; N4 only indirect work-friendly concept |
| urban | `vibe.urban` exists | Product Mood deliberately has no mapping; legacy cluster treats authentic/local/urban together |
| chillig | candidate synonym for `vibe.relaxed` | N3 maps relaxed; Product Mood display-only; legacy cluster canonicalizes it separately |
| authentic | `vibe.authentic` current feeling vs `character.authentic_character` durable character | ranking maps request to both; Review maps only character |
| indoor/outdoor | canonical fact plus corresponding N4 concepts | legacy mood cluster treats outdoor as mood; Decision package drops detailed suitability |
| rain | canonical suitability fact | v13 occasion flag only; absent from N3 and Decision N4 serialization |
| age | canonical suitability fact | not represented in N3/Decision package |
| activity / outing / experience | distinct Place Types and current activity intent | v13 keyword/category adapters vary; Gold detailed activities are not serialized |
| A/B/test/unmapped | no semantic meaning | live legacy mood tokens remain `valid`; new controlled Review resolver blocks them |

## 6. Canonical Semantic Contract V1

### 6.1 Contract packages

`backyrd-canonical-semantics-v1` should consist of six versioned registries:

1. **Concept registry** — the existing frozen 45 Taste concepts plus the seven existing N4-only extension concepts; no additions in this alignment sprint.
2. **Fact registry** — typed Product facts such as age, rain, schedule and activity; facts are not forced into Taste concepts.
3. **Context registry** — N3 social context, occasion, activity, time and hard constraints.
4. **Ingestion aliases** — localized Product strings to one key; aliases never become stored duplicate concepts.
5. **Evidence authority** — which producers may create which semantic layer.
6. **Reason vocabulary** — bounded candidate-specific reason types and required evidence references.

Every interpreted record must retain `semantic_contract_version`, original source identity and, where appropriate, the original raw value. A future mapping change creates a new interpretation; it must not silently rewrite old evidence.

### 6.2 Fact, Concept and Preference

- `suitability.age.min_age=6` is a canonical fact.
- `suitability.environment=INDOOR` is a fact; `environment.indoor` is its qualified semantic interpretation.
- `vibe.cozy` is a concept.
- “User likes cozy” is a derived, scoped User Card node.
- “User asks for cozy now” is Current Intent, not a durable preference.

### 6.3 Human language boundary

UI continues to say “gemütlich”, “ruhig”, “gut zum Reden”. Clients submit stable Product option IDs or raw text. Server adapters normalize those to canonical keys and preserve provenance. Normal users never see `vibe.cozy` or internal reason codes.

## 7. Evidence authority matrix

| Source | Allowed canonical meaning | Forbidden inference |
|---|---|---|
| Decision Request | minimized request + Current Moment evidence | durable Taste from one request |
| Candidate shown | Exposure | Interest or Satisfaction |
| Spot open/search click | weak Interest | Experience or Satisfaction |
| Save | deliberate/stronger Interest | visit or positive outcome |
| Navigation/Reservation | Intent | visit or Satisfaction |
| Verified Visit | Experience | positive outcome |
| Standard Review | source-bound text/moods; Experience only if separately qualified | existence = positive |
| Smart Review | strong Experience + qualified review channels | mood existence = positive |
| Product Mood | direct concept evidence only when mapped and review outcome direction is known | unmapped token → concept |
| Review text | deterministic explicit claims and supported overall sentiment | guessed sentiment/claims |
| Profile selection | explicit self-declaration with correction path | behavioral proof or HIGH |
| Decision onboarding Spot | explicit self-declared anchor | independent experience/outcome |
| N3 Moment | current context/intent | long-term Taste |
| Owner Claim | Spot proposal/evidence with owner provenance | canonical truth or User Taste |
| Admin acceptance | accepted typed fact with source/confidence policy | arbitrary N4 confidence |
| Research proposal | source-bound proposal | direct canonical write |
| N4 snapshot | derived Spot Intelligence | source fact mutation |
| Shadow N6 | ranking/reason selection only | Exposure, learning, candidate creation |

## 8. Product target alignment

### Profile and onboarding

Profile `interests/personality` should remain display-only until replaced or augmented with controlled self-declared concept selections. A self-declared selection must enter N2 as `onboarding_preference`/explicit evidence with its own strength, correction and consent semantics. It must remain distinguishable from learned behavioral/direct evidence in User Card composition.

Decision onboarding may keep favorite-Spot UX, but the backend adapter must emit one canonical self-declaration per selected Spot using frozen N4 at interpretation time. It must stop creating several parallel Taste truths. Missing N4 means no concept claim, not imputation.

### Reviews and Smart Reviews

All Review surfaces should load the server Product Mood registry rather than hardcode the same list. Both Standard and Smart Review must write canonical origin. Smart Review retains Experience qualification. Standard Review facts may contribute direct semantic evidence only through the frozen qualification contract; neither Review type implies positive Satisfaction.

### Moments

Backyrd currently uses “Moments” for community/social content and “Current Moment” for N3. These are different domain objects. Name them explicitly in contracts: `community_moment_content` versus `current_decision_moment`. Social content does not become current intent or durable preference without a canonical action/evidence path.

### Spots, Admin, Owner and Research

Admin/Owner edit facts and proposals only. Gold typed facts, accepted-fact provenance and N4 derivation are the correct foundation. Owner Pro uses the same language and changes authoring capability only. Research Agents submit source-bound proposals. Legacy tags and mood concepts remain visible only as legacy evidence candidates, never as canonical truth.

### N6

N6 may only select candidate-specific authorized reasons. Current production codes are `CURRENT_INTENT_MATCH`, `PLACE_TYPE_MATCH`, `RELEVANT_TASTE_MATCH`, `CONTEXTUAL_TASTE_MATCH`, `LOW_USER_KNOWLEDGE` and `SPARSE_SPOT_INTELLIGENCE`. Adding factual reasons such as rain/age suitability requires the deterministic package and reason-authorizer to carry those accepted facts first; it is not a prompt change.

## 9. End-to-end semantic coverage

Legend: ✓ implemented; △ partial/indirect; ✕ broken/missing; — not semantically appropriate.

| Semantic | Product/N3 understands | Spot/Fact capture | N4 exposes | User Intelligence | N5 | Ranking | N6 reason | Status |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| cozy | ✓ | ✓ atmosphere field | △ catalog says evidence; mapper missing | ✓ via Review/N4 | ✓ | ✓ | ✓ | PARTIAL |
| quiet | ✓ | ✓ conversation/noise | ✓ | ✓ | ✓ | ✓ | ✓ | ALIGNED |
| calm energy | △ derived with quiet | △ no direct Gold control | ✓ registry | ✓ | ✓ | ✓ | ✓ | PARTIAL |
| lively | ✓ | ✓ noise/atmosphere | △ noise only | ✓ | ✓ | ✓ | ✓ | PARTIAL |
| relaxed | ✓ | ✓ atmosphere | △ mapper missing | ✓ registry, Product Mood gap | ✓ | △ | △ generic | PARTIAL |
| romantic atmosphere | ✓ | ✓ atmosphere | △ mapper missing | ✓ | ✓ | ✓ | ✓ | PARTIAL |
| conversation friendly | ✓ from “reden” | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ALIGNED |
| authentic character | ✓ request adapter/ranking | ✓ atmosphere | △ mapper missing | ✓ Review | ✓ | ✓ | ✓ | PARTIAL |
| hidden gem | ✓ exploratory | ✓ atmosphere | △ mapper missing | ✓ Review | ✓ | ✓ | ✓ | PARTIAL |
| solo | ✓ context | ✓ social map | △ suitability not read | ✓ scoped User Card | ✓ | △ | △ | PARTIAL |
| date | ✓ context | ✓ social map | △ | ✓ scoped | ✓ | △ | △ | PARTIAL |
| friends/group | ✓ context | ✓ social map | △ | ✓ scoped | ✓ | △ | △ | PARTIAL |
| family/kids | △ family mapped; age phrase incomplete | ✓ | ✓ family concepts | ✓ scoped | ✓ | △ | △ | PARTIAL |
| child age | ✕ | ✓ typed fact | ✕ read/package | — | — | ✕ | ✕ | BROKEN |
| indoor/outdoor | ✓ explicit | ✓ | ✓ concepts | ✓ | ✓ | ✓ | △ | PARTIAL |
| rain suitability | ✕ canonical N3; v13 private flag | ✓ | ✕ read/package | — | — | ✕ | ✕ | BROKEN |
| detailed activity type | ✓ limited intent | ✓ | ✕ read/package | △ Place-Type only | △ | △ | △ | BROKEN/PARTIAL |
| price | ✓ N3 | ✓ | ✓ fact registry, not Decision serialization | ✓ concepts if evidence exists | ✓ | △ | △ | PARTIAL |
| accessibility | ✕ N3 | ✓ | ✓ fact registry, not Decision serialization | — | — | ✕ | ✕ | BROKEN |
| opening/open now | ✓ hard constraint | ✓ schedules/status | product `openNow` | — | — | ✓ hard eligibility | — | ALIGNED |
| morning/afternoon/evening | ✓ observed | ✓ time field | △ mapper missing | ✓ contexts/concepts | ✓ | △ | △ | PARTIAL |
| afterwork | ✓ occasion | △ occasion field uncontrolled | △ work-friendly only | ✓ context pattern | ✓ | △ | △ | PARTIAL |
| Place Type | ✓ | ✓ category/place type | ✓ | ✓ | ✓ | ✓ | ✓ | ALIGNED core, adapter drift |

The most material broken chain is factual suitability: Product can author it, but Decision package consumers cannot see it. The second is Product self-declaration: the UI can collect Taste-like information, but canonical User Intelligence cannot distinguish or consume it safely.

## 10. Legacy boundary

| Store/path | Decision | Rationale |
|---|---|---|
| `profiles.interests/personality` | DISPLAY_ONLY, then MIGRATE through explicit selection UI | free text lacks version/provenance/meaning |
| Decision onboarding favorites/ML/Place-Type updates | KEEP UX + ADAPTER; DEPRECATE parallel learning writes | selected Spots are explicit anchors, not outcomes |
| `mood_tokens`, synonyms, clusters | KEEP for legacy display/search; controlled adapter only | 118 valid rows contain mixed/test semantics |
| `mood_concepts`, `spot_mood_concepts` | BLOCK_FROM_ENGINE; DISPLAY_ONLY operationally | manually editable derived language |
| `spot_moods`, `spot_moods_agg` | KEEP legacy discovery; BLOCK_FROM_CANONICAL learning | aggregate count/rank is not N4 provenance |
| taxonomy graph | KEEP; map nodes individually | valuable Product facts, not equivalent to N4 |
| `spot_intelligence_v1` | DEPRECATE/BLOCK_FROM_CANONICAL | free-form arrays and direct verification |
| `user_taste_events_v2` | KEEP historical; BLOCK_FROM_NEW_USER_CARD | factor lacks N2 evidence envelope |
| mobile client preference helpers | DEPRECATE/BLOCK | duplicate client-side inference |
| legacy Decision v9/debug RPCs | KEEP internal debug only; no canonical authority | separate cluster taxonomy |
| v13 retrieval | KEEP + adapter | useful candidate retrieval, not canonical semantic truth |

Historical values retain their original contract. Unmapped history is `UNKNOWN` and non-qualifying. Migration must never assign current meaning merely because spelling matches.

## 11. Proposed shared implementation boundary

The implementation should create one generated/shared semantics package and one DB registry identity, not another engine:

- shared JSON/TypeScript contract generated from one source;
- server-owned adapters for Profile, Review, N3 input, categories/taxonomy and Gold facts;
- database constraints/RPC validation for Product option IDs and contract versions;
- adapter conformance tests showing one input maps identically on Mobile, Admin, Owner and server;
- explicit relations where a fact supports a concept; no generic synonym-to-concept inference;
- traces persist contract identity and mapping result (`MAPPED`, `UNKNOWN`, `NON_QUALIFYING`, `INVALID`).

## 12. Priority plan

### P0 — semantic correctness

1. Establish `backyrd-canonical-semantics-v1` as the shared source of keys, Product labels, aliases, fact types, evidence authority and reason codes. Generate/validate clients from it; clients may not invent values.
2. Block legacy client preference helpers and legacy mood/taxonomy/Spot Intelligence stores from canonical User Card/N4 paths. Document the still-active discovery-only consumers.
3. Align every Review surface with the server Product Mood registry and one canonical Review-origin adapter. Keep unmapped moods non-qualifying.
4. Replace duplicated category-name adapters with one versioned Category → Place-Type mapping covering all 14 live categories and an explicit `UNKNOWN`, not silent `other`.
5. Complete the Gold Fact → qualification → N4 evidence/read/package chain for fields already promised as engine-relevant. Facts without an existing N4 concept remain facts; extend bounded Decision serialization rather than invent dimensions.
6. Add conformance tests for quiet, family/kids, date, afterwork, indoor, rain, age, Place Type, unsupported mood, test mood and Current Intent authority.

### P1 — Product alignment

1. Add controlled self-declared Profile/Onboarding selections with explicit-source Memory evidence; distinguish declared from learned evidence in User Card composition.
2. Expand the canonical Product→N3 adapter for weather/rain and child-age facts only after typed N3 contract fields are versioned; until then preserve them as `other_needs`, never hard constraints.
3. Make Gold atmosphere, social, occasion and time controls use the same registry; remove unrestricted multi-selects where canonical values are required.
4. Add factual authorized reasons only after the Decision package can prove the corresponding accepted fact and provenance.
5. Rename/document community “Moments” versus N3 “Current Moment” to prevent cross-domain learning.

### P2 — legacy cleanup

1. Inventory actual references, then retire unused mobile Decision v9/debug and client preference helpers.
2. Mark malformed/test legacy mood tokens invalid for new Product selection without rewriting historical Reviews.
3. Map useful taxonomy nodes to canonical facts one by one; keep unreviewed nodes display/search-only.
4. Deprecate Admin/Owner legacy free-tag editing after Gold Authoring covers the operational use cases.
5. Resolve repository/live schema drift through forward migrations and generated schema types.

## 13. Final answers

**Is one canonical semantic contract feasible?** Yes. The frozen engine already supplies the central concept language. The work is boundary alignment, not a new intelligence engine.

**Is Backyrd ready to implement canonical alignment?** Yes, with the P0 sequence above. It is not ready to start broad online enrichment before Category/Fact mappings, proposal values and downstream Decision serialization are governed by the same contract; otherwise researched facts will enter a language the Decision path cannot consume.

## Verdicts

- CANONICAL LANGUAGE TODAY — **FRAGMENTED**
- REVIEWS — **PARTIAL**
- SMART REVIEWS — **PARTIAL**
- PROFILE / ONBOARDING — **FRAGMENTED**
- MOMENTS — **FRAGMENTED**
- SPOT FACTS — **PARTIAL**
- ADMIN / OWNER — **PARTIAL**
- N3 ↔ N4 — **PARTIAL**
- N4 ↔ USER INTELLIGENCE — **ALIGNED** for canonical concepts, **PARTIAL** for suitability facts
- USER INTELLIGENCE ↔ N5 — **ALIGNED**
- N5 ↔ N6 REASONS — **PARTIAL**
- ONE CANONICAL SEMANTIC CONTRACT FEASIBLE — **YES**
- READY TO IMPLEMENT CANONICAL ALIGNMENT — **YES**
- CODE CHANGES — **0**
- DATA CHANGES — **0**
- PRODUCTION — **UNCHANGED**
