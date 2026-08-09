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

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
