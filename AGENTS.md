# Backyrd – AGENTS.md

> **Purpose**
>
> This document is the primary operating manual for every AI agent, developer and contributor working on Backyrd.
>
> Code should always follow these principles before implementation begins.

---

# PRODUCT

## What is Backyrd?

Backyrd is an AI-powered experience discovery platform.

It helps people discover restaurants, cafés, bars, hotels, activities and experiences based on their current mood, context and personal taste.

Backyrd is **not** a review platform.

Backyrd is **not** a rating platform.

Backyrd is an experience platform.

---

## Mission

Help people create better real-life moments.

Every feature should improve the quality of real experiences.

---

## Vision

Become the world's most trusted platform for discovering experiences.

Trust always comes before growth.

Authenticity always comes before engagement.

---

# PRODUCT PHILOSOPHY

## Mood beats stars

Traditional rating systems reduce experiences to a number.

Backyrd intentionally avoids this.

People don't look for a 4.8-star restaurant.

People look for:

- cozy
- romantic
- lively
- local
- hidden
- creative
- authentic

Backyrd optimizes for mood.

---

## Context beats popularity

The best place depends on:

- time
- company
- weather
- location
- intention
- mood
- personal taste

Popularity is only one signal.

---

## Experiences beat reviews

Reviews are not the product.

Experiences are.

Reviews only exist to improve future recommendations.

---

## Trust beats engagement

Backyrd never sacrifices trust for higher engagement.

Never introduce mechanics that increase spam.

Never optimize for addiction.

Never optimize for doom scrolling.

---

## Human-first

AI assists.

Humans remain responsible.

Human moderation is always final.

---

# CORE PRODUCTS

Backyrd currently consists of:

- Mobile App
- Admin Dashboard
- Owner Dashboard
- Founder Dashboard
- Decision Engine
- Journey Engine
- Review System
- Trust & Safety Platform
- Review Integrity Engine
- Owner Platform
- Search & Discovery
- Gamification
- Social Layer

Every system must remain consistent.

---

# DEVELOPMENT PRINCIPLES

## Think first

Before writing code:

Understand the feature.

Understand the existing architecture.

Search for existing implementations.

Never assume.

---

## Reuse before creating

Never duplicate:

- Components
- Business Logic
- SQL
- RPCs
- Hooks
- Services
- Utilities

Always extend existing systems where appropriate.

---

## Small changes

Prefer incremental improvements.

Avoid large rewrites unless explicitly requested.

---

## Backwards compatibility

Never break existing features.

If something must change:

- identify affected systems
- update them
- verify functionality

---

# GIT

Git is the source of truth.

Git is the backup.

Never create:

- backup folders
- backup files
- page_old.tsx
- final_backup.tsx

Git already stores every version.

---

# DATABASE

Database:

Supabase Cloud

Rules:

- Every schema change must be a migration.
- Never edit production schema manually.
- Never duplicate SQL functions.
- Never weaken RLS.
- Never bypass security policies.

---

# CODE STYLE

Priorities:

1. Readability
2. Simplicity
3. Maintainability
4. Performance

Avoid clever code.

Prefer understandable code.

Future developers should understand the implementation immediately.

---

# TYPESCRIPT

Always use strict typing.

Avoid "any".

Prefer explicit interfaces.

Keep types close to their domain.

---

# UI PRINCIPLES

Backyrd should feel:

- premium
- elegant
- calm
- modern
- fast
- confident

Avoid:

- clutter
- unnecessary dialogs
- unnecessary animations
- feature overload

---

# DESIGN LANGUAGE

Core characteristics:

- Dark-first
- Premium typography
- Large spacing
- Rounded corners
- Pink accent color
- Strong hierarchy
- Minimal UI
- Fast interactions

Every screen should feel intentional.

---

# DECISION ENGINE

The Decision Engine is one of Backyrd's core systems.

Its purpose is **not** finding the highest rated place.

Its purpose is recommending the best experience for the user's current situation.

Recommendations should consider:

- Mood
- Context
- Distance
- Opening hours
- Personal taste
- Discovery
- Friends
- Authenticity

---

# REVIEWS

Reviews exist to improve recommendations.

Reviews are intentionally lightweight.

Backyrd does not optimize for long essays.

Reviews should remain authentic.

---

# OWNER PLATFORM

The Owner Platform exists to help businesses improve their profile.

It must never allow owners to manipulate rankings.

Analytics exist for improvement.

Never for ranking influence.

---

# TRUST & SAFETY

Trust is a core product.

Not a support feature.

Core systems include:

- Content Safety
- Owner Verification
- Review Integrity
- Human Moderation
- Appeals

Human decisions always override AI decisions.

---

# REVIEW INTEGRITY

Integrity signals indicate unusual behaviour.

Integrity signals never prove manipulation.

Signals support human moderation.

False positives must always be assumed possible.

Automatic permanent punishment is prohibited.

---

# AI

AI should:

- help
- explain
- assist

AI should never:

- deceive
- fabricate certainty
- hide important uncertainty

Explainability is required whenever possible.

---

# PERFORMANCE

Prefer:

- fewer queries
- reusable components
- caching
- efficient rendering

Optimize after measuring.

Not before.

---

# BEFORE EVERY IMPLEMENTATION

1. Understand the problem.
2. Search existing implementation.
3. Search reusable code.
4. Inspect related database objects.
5. Consider impact on Mobile, Admin and Owner platforms.

---

# BEFORE EVERY COMMIT

Verify:

- Build succeeds
- TypeScript passes
- Existing functionality still works
- No duplicate logic introduced
- No dead code created

---

# DEFINITION OF DONE

A feature is complete when:

- it works
- it is tested
- it fits the product philosophy
- it follows the design language
- it introduces no regressions
- it remains maintainable

---

# WHAT NOT TO BUILD

Never copy competitors blindly.

Never add features because they are trendy.

Never optimize for vanity metrics.

Never build complexity without clear user value.

Never sacrifice trust for growth.

---

# FINAL PRINCIPLE

Before implementing anything, ask:

**"Does this improve a real-world experience for the user?"**

If the answer is **no**, rethink the implementation.