# N5 — Relevant User Projection

Status: **PASS**
Production: **UNCHANGED**

## Executive summary

N5 implements the deterministic boundary between N2 User Intelligence, N3 Current Moment and the future N6 AI Decision Buddy. It answers one question only: **which legitimate knowledge about this user matters for this decision?** It does not inspect Candidates, rank Spots, call an LLM, or mutate User Intelligence.

The projection is deliberately smaller for relevance, not larger for maturity. It selects contextual, Place-Type and global Taste hierarchically; admits Behavioral/Occasion Patterns only when several current-context anchors match; carries Confidence and provenance; records suppression; and exposes a decision-specific knowledge-sufficiency assessment. Cold Start and UNKNOWN remain valid outputs.

## Architecture

```text
Explicit Current Intent (authoritative)
            +
N3 Current Moment (authoritative current context)
            +
N2 User Intelligence (conditional historical evidence)
            ↓
relevance and conflict filtering
            ↓
context > place type > global selection per concept
            +
applicable recurring patterns
            +
bounded recent relevant evidence summaries
            ↓
Relevant User Projection + suppression audit + sufficiency
            ↓
compact N6 serialization
```

The N2 intelligence hash and N3 moment hash anchor reconstruction. N5 consumes the canonical derived N2 structures and never reconstructs interpretation from raw event history.

## Relevance hierarchy and authority

1. Explicit Current Intent may select a dimension or suppress conflicting history.
2. N3 Current Moment determines the applicable social, temporal and desire context.
3. Context Taste is preferred when its scope actually matches.
4. Place-Type Taste is used only for an explicit or safely inferred Place Type.
5. Behavioral Patterns require at least two matching anchors, no contradictory anchor, adequate similarity, current recency and sufficient Confidence.
6. Global Taste contributes when activated by the current Moment/Intent. It becomes a bounded fallback only for a broad request or when no more specific relevant Taste exists.
7. Recent evidence is not raw Memory. It is a bounded summary of already-selected, relevant N2 evidence.

The same concept is emitted from only the most specific applicable layer. Context, Place-Type and global copies are never added together.

## Current Intent and Moment behavior

An explicit request such as “today loud and lively” suppresses a conflicting quiet-history row and records `CURRENT_INTENT_OVERRIDES_HISTORY`. N3 remains the source of truth for the current Moment; N5 does not reinterpret raw query text.

The same User Intelligence produces different projections for Family Sunday, Friends Friday and Date Evening because different scopes become applicable. Two users in the same Moment receive different projections only where their validated N2 Evidence differs.

## Patterns, recent Memory and contradictions

Patterns are selected by structural applicability rather than name or a single shared field. Stale, weak and wrong-context patterns are suppressed. Recent Memory is limited to three summaries and is derived only from relevant selected Taste Evidence. No event IDs, raw query history, Spot IDs or city-history stream is serialized for N6.

Contradictions are preserved for selected Concepts and reduce sufficiency. They are not averaged into artificial certainty.

## Knowledge sufficiency

`LOW`, `MEDIUM` and `HIGH` describe knowledge sufficiency **for this decision**, not general User maturity. Inputs are relevant evidence strength, Confidence, contextual/Place-Type specificity, Pattern support, contradictions and Moment Confidence.

- Cold User: sparse projection, `LOW`, explicit `COLD_USER` uncertainty.
- Mature User in a known Family context: specific Evidence can yield `MEDIUM` or `HIGH`.
- Mature User making a first Culture request: global fallback may be present while Place-Type knowledge remains unknown and sufficiency stays `LOW`.

This is the “I don’t know you here” contract required by the Decision Buddy.

## Privacy and safety

N5 applies minimum-necessary disclosure. Consent withdrawal, cross-user input, malformed versions, candidate input, Latent Truth, prompt-injection-like fields and prohibited private/scientific fields fail closed. The compact N6 object excludes raw History, User IDs, city history, Spot IDs, Trust/Moderation Evidence and free-form biographies.

Current Intent, N3, N2 and the validated Wave-3B.1 Taste engine are protected inputs. N5 performs no writes and introduces no migration.

## Validation and scientific validity

The prospectively frozen contract executes 30 scenario arms across three Seeds plus 15 explicit lifecycle arms covering Cold, Onboarding, Early, Mature and Long-Term users. It includes Family, Friends, Date, matching Pattern, intent conflict, cross-city, first Culture request, broad request, huge profile and different-user/same-Moment cases.

An initial pre-certification run exposed `N5-MI-001`: lifecycle Cohorts were declared but not executed as independent arms. That unsealed result was discarded. Fail-closed Cohort coverage was added, the measurement identities were re-frozen, and the official run was restarted from the beginning. No Engine threshold or quality gate changed.

Official result:

- Relevant Knowledge Precision: `1.000`
- Relevant Knowledge Recall: `1.000`
- Irrelevant Knowledge Suppression: `1.000`
- all remaining mandatory quality/integrity metrics: `1.000`
- lifecycle Cohort coverage: `15/15`
- mandatory gates: **PASS**
- Scientific Validity: **PASS**

These synthetic Lab results validate the contract and controlled scenarios; they are not a Production quality or latency claim.

## Performance and bounds

Hard bounds:

- Taste Concepts: 12
- Patterns: 3
- recent Evidence summaries: 3
- provenance families/item: 4
- suppression audit items: 24
- serialization: 12,000 bytes / estimated 3,000 tokens

Official local synthetic performance:

| N2 history size | p95 projection | max bytes | estimated tokens |
|---:|---:|---:|---:|
| 0 | 0.089 ms | 546 | 137 |
| 1,000 | 0.707 ms | 3,664 | 916 |
| 10,000 | 2.733 ms | 3,664 | 916 |

N5 scales with canonical N2 derived structures. The synthetic 10,000-event fixture verifies that longer history does not enlarge the N6 payload.

## Boundaries and remaining limitations

N5 does not select Spots, score Candidates, retrieve, rank, explain in user-facing prose, learn Outcomes or invoke AI. Place-Type conditioning is bounded to the current explicit/safely inferred scope. Recent evidence is intentionally summarized rather than event-level. Real-world relevance quality must later be validated end-to-end with N6 and N9 without weakening these privacy and authority contracts.

## Verdicts

- N5 RELEVANT USER PROJECTION — **PASS**
- RELEVANT KNOWLEDGE SELECTION — **PASS**
- IRRELEVANT KNOWLEDGE SUPPRESSION — **PASS**
- CURRENT INTENT AUTHORITY — **PASS**
- CONTEXTUAL USER PROJECTION — **PASS**
- KNOWLEDGE SUFFICIENCY — **PASS**
- CROSS-CITY PORTABILITY — **PASS**
- PRIVACY & DATA MINIMIZATION — **PASS**
- SCIENTIFIC VALIDITY — **PASS**
- N6 AI DECISION BUDDY — **READY**
- PRODUCTION — **UNCHANGED**
