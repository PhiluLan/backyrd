# Owner Pro billing: Stripe connection and release

Status: prepared in code; **checkout remains off until a separately verified Stripe activation**. Owner Pro is CHF 39 per month **per spot, including applicable VAT**. Billing never changes organic ranking, Decision eligibility, or canonical World Knowledge.

Founder accepted the untested database-recovery risk on 2026-10-03 for exactly `supabase/migrations/20261002202705_owner_pro_stripe_billing_v1.sql` (SHA-256 `7aa7abc64b9965c6767364c840f3f27dffd8ad6fedf4efbbcab97488a18b58f6`). This is not a tested or guaranteed rollback and does not itself authorize activating payments. The ordinary manual Production release checks still apply.

## Ownership and payment boundary

- Only a logged-in, verified Owner can start Checkout for an approved spot. The server checks ownership again; the browser never supplies a price or entitlement.
- Each spot has its own subscription and Stripe customer. This keeps invoices and the customer portal scoped to one spot.
- Stripe Checkout handles card and TWINT. `OWNER_PRO_TWINT_VERIFIED=true` is permitted only after TWINT is active on the specific Stripe account and a test Checkout visibly offers it. If TWINT is absent, session creation fails closed.
- The CHF 39 recurring Stripe Price must be CHF 39.00, monthly, tax-inclusive. The server validates the Price against Stripe on each checkout/webhook.
- Checkout success is not proof of payment. Only a signature-verified Stripe event plus a freshly retrieved subscription and a paid invoice payment may grant `BILLING_VERIFIED`. The subscription metadata, spot owner, checkout nonce, Stripe customer, subscription and Price are bound. Duplicate events are idempotent.
- The Owner's invoice list and customer portal stay available independently of the World Knowledge authoring RPC. Canceling the subscription does not delete prior invoices. A spot or account with a billing row cannot be deleted until the subscription and row are resolved, to avoid orphan recurring charges.
- The UI shows payment pending, active, payment failure, cancellation, and unavailable states without pretending that a returned Checkout URL means an active subscription.

## Stripe account setup (human-controlled)

1. Create and verify the backyrd Stripe account. Complete business identity, Swiss payout account, legal details, and applicable tax registrations with the responsible finance/tax person.
2. Create one Product `Owner Pro` and one recurring Price: CHF 39.00 per month, quantity 1, **tax behavior inclusive**. Record the live `price_…` ID. Do not configure a trial or usage-based amount.
3. Configure Stripe Tax / automatic tax and Swiss VAT registrations as applicable. Confirm an end-to-end invoice shows the correct gross amount and tax breakdown before charging real customers. This code cannot decide legal tax obligations.
4. Activate card and TWINT for the account and wait for TWINT onboarding approval. Verify TWINT is present in Checkout on a Swiss test purchase. A provider-side pending state is not approval.
5. Configure the Stripe Customer Portal for payment-method updates, invoice download, and cancellation at period end. Do not enable cross-product upgrades or unreviewed price changes. Check that a spot's portal session exposes only its own subscription.
6. Create a dedicated Stripe webhook endpoint at `https://backyrd.ch/api/owner/billing/webhook`. Subscribe to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.created`, `customer.subscription.updated`, and `customer.subscription.deleted`. Store its signing secret server-side only.
7. Place `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `STRIPE_OWNER_PRO_PRICE_ID` in the Production web deployment's secret store. Set `OWNER_PRO_BILLING_ORIGIN=https://backyrd.ch`. Never add keys to Git, `NEXT_PUBLIC_*`, browser bundles, logs, or evidence.

## Safe activation

1. Review and merge the migration and web changes through the regular DATABASE_PR/FAST_PR gates. The migration requires the normal explicit production recovery-risk acceptance and source-bound manual release; do not apply it ad hoc.
2. Deploy with `OWNER_PRO_BILLING_ENABLED=false` and `OWNER_PRO_TWINT_VERIFIED=false`. The UI must show “Checkout wird vorbereitet” and no purchase button.
3. Verify the migrated tables have RLS, no anon/authenticated grants, service-only RPC access, and positive/negative SQL tests. Verify the web build and Owner Basic paywall.
4. In Stripe test mode, use separate test-mode keys, Price, and webhook secret. Verify one subscription per spot, card and TWINT eligibility, success return before webhook (still pending), signed paid webhook (Pro), duplicate/out-of-order webhook delivery, failed payment (no Pro), renewal, cancellation at period end, portal, and invoice separation between two spots.
5. Repeat a controlled live-mode pilot with the responsible Owner and finance reviewer. Confirm gross CHF 39.00, inclusive tax invoice, TWINT availability, correct sender/descriptor, refund and failed-payment operations, and support contact. Keep any pilot scope narrow.
6. Only after these checks set `OWNER_PRO_TWINT_VERIFIED=true` and `OWNER_PRO_BILLING_ENABLED=true` in the exact approved production release. If webhook delivery, payment status or tax fails, turn **both flags off**; this blocks new checkout without erasing existing subscriptions. Reconcile existing subscriptions in Stripe and handle support manually.

## Operations and reconciliation

- Stripe is the payment source of truth; the database row is a verified projection. Watch webhook failures and reconcile Stripe subscription, invoice and database entitlement before resolving a billing ticket.
- The Checkout page is not a substitute for an invoice. Invoices are fetched from Stripe per subscription; the customer portal handles payment methods and cancellation.
- A refund, chargeback, account closure, owner transfer or spot deletion requires a human billing operation and reconciliation before any local state is removed. Do not silently delete a Stripe subscription or retain access after a reversed payment. Extend webhook/reconciliation coverage before broad launch if automatic revocation on refund/dispute is required.
- Secrets and webhook signing secrets rotate through the deployment's secret store. Never put them in GitHub PR comments or test screenshots.
