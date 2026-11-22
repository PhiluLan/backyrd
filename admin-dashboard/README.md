# Backyrd Admin Dashboard

Internal operations, quality, moderation and Founder launch control for Backyrd.

The Founder Control Center is part of this application and uses the existing
Supabase Admin authorization boundary. It does not have a separate login.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser and sign in
with an account accepted by `admin_is_admin_v1`.

## Environment

Required browser-safe Supabase configuration:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

Server-only configuration used by the Founder Engineering panel:

```dotenv
FOUNDER_GITHUB_TOKEN=...
FOUNDER_GITHUB_REPOSITORY=PhiluLan/backyrd
```

`FOUNDER_GITHUB_TOKEN` must never use a `NEXT_PUBLIC_` prefix. The browser calls
an Admin-authorized server route and never receives the credential. Engineering
responses are normalized and cached for 45 seconds.

The Founder routes are:

- `/founder` — Basel launch control center
- `/founder/launch-readiness` — evidence-backed launch register
- `/founder/engineering` — live GitHub and CI state

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Product feedback inbox

`/feedback` lists explicit user feedback with server-side status, sentiment,
cause, period and literal-text filters. Totals describe submitted feedback in
the selected filters, not all Decisions or a representative success rate.
Stable timestamp/UUID cursors prevent gaps when several submissions share a
timestamp. `/feedback/[id]` supports triage, notes, a shared topic/ticket reference
and the latest 50 review events. Reopening is supported. Resolving requires a
note; revision checks prevent silent overwrites by another Admin. Topic/ticket
references are internal text, not automatic external issue creation.

The inbox requires migration `20261122102945_admin_product_feedback_inbox.sql`.
All three Admin RPCs authenticate with the existing `admin_is_admin_v1` boundary;
ordinary users and anonymous clients cannot list, review or read audit events.
The older list RPC remains compatible; new UI uses the filtered v2 contract.
No service credential is shipped to the browser.

New Product feedback captures a server-owned minimal context at submission:
city, intent, day phase, candidate count, up to five ranked candidate names,
eligibility/availability labels and ranking version. It excludes the original
wish, participant ages, coordinates, provider payload and taste profile. It is
not a claim that every captured candidate was viewed. Older/missing context is
shown as unavailable; no retrospective reconstruction or backfill is performed.
Context follows the feedback/account deletion lifecycle. Feedback and review
events stay distinct from optional analytics, moderation and ranking signals.

Implementation class: DATABASE_PR plus the affected Admin and delivery gates.
Backend publication must precede feature activation. For Git-integrated staged
deployments, navigation probes the authenticated inbox RPC with a future-only
filter (no feedback rows) and advertises the feature only after the DB contract
is available. Existing routes remain usable during rollout; direct access to
the new route reports a missing migration honestly. The exact SQL delivery
scope is a source proposal, not production execution authority; normal manual
Main certification and deployment are still required. No Mobile OTA is needed.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
