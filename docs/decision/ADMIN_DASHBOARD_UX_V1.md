# Admin Dashboard UX V1

## Product goal

The Admin dashboard is an operational product for Founder and Admin users. Its default language is human, its primary actions are explicit, and daily work remains usable from phone through desktop. Server-side authorization and all canonical Spot, Gold and Decision contracts remain authoritative.

## Navigation and page structure

Navigation is grouped into **Überblick**, **Spots**, **Menschen**, **Sicherheit** and **System**. Desktop retains the persistent sidebar. Mobile uses a compact header, drawer and a bottom quick navigation for Übersicht, Spots, Reviews and Safety.

Shared page primitives provide consistent headers, filter bars, badges, cards, loading, empty and error states. At mobile widths, operational tables become labeled cards rather than horizontally scrolling desktop tables.

## Daily operations

- The home screen prioritizes actionable work: Spot quality, owner claims, recent Reviews and operational errors.
- The Spot list supports query-backed search, status and attention filters, desktop table and mobile Spot cards. Gold readiness is read from the canonical readiness contract through an admin-only worklist RPC.
- Spot editing has human top-level navigation for information, Backyrd's understanding, sources/review, overview and Owner state.
- The Human Spot Editor has section navigation, readable accepted information and a human intelligence preview. Internal fact keys and N4 terminology are not the primary UI.
- Proposal review explicitly presents current value, proposed value, source and reason for review before the safe actions.
- Reviews, users and owner claims have responsive card/table presentations with clear actions and polished loading, empty and error states.

## Responsive contract

Supported validation widths are 320, 375, 390, 430, 768, 1024 and 1440 pixels. At 760 pixels and below:

- forms use a single-column layout and labels remain above fields;
- controls are at least 44 pixels high and use a 16-pixel input font to avoid iOS zoom;
- chips wrap, action rows stack, and long text may break safely;
- desktop data tables are replaced by cards or labeled stacked rows;
- long editor actions remain reachable above the mobile quick navigation.

## Security and semantics

The UI does not replace authorization. Existing Founder/Admin, Owner Basic/Pro and cross-owner boundaries remain server-side. The new readiness worklist rejects non-admin callers. Owner subscription, readiness presentation and UI state do not enter N4, eligibility, ranking or reason authorization.

No canonical concept, N4 dimension, Gold truth policy, User Intelligence or Decision behavior changed.
