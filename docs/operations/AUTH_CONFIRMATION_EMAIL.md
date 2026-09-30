# Signup confirmation email

The canonical hosted email is `supabase/production/auth-config.json`. Changes
are released through the existing SHA-bound Supabase Production workflow, which
reads the applied Auth settings back after deployment. Do not edit the hosted
template independently.

Mobile signup and resend set `RedirectTo` to `backyrd://auth/callback`. The
template uses this exact value to show a code-entry CTA pointing to
`https://www.backyrd.ch/auth/verify`. The link contains no email address, code,
token or redirect target and does not verify an account. Verification still
requires the email and OTP through the existing Auth form. Browser signups keep
their original `ConfirmationURL` and browser callback.

The website publishes the Apple association for the Production app only, scoped
to `/auth/verify`. The Apple team and bundle identity are the established shipped
identity recorded in `docs/readiness/GATE5_IOS_PHYSICAL_RETEST.md`. Development
builds do not claim the Production domain. The association file bypasses session
middleware and is served as public JSON. The fallback page offers the registered
`backyrd://auth/verify` scheme and manual instructions for clients that keep links
in a browser.

## Release and acceptance

This is a Product release because it changes Auth configuration. No database
migration or policy change is required. Publish the website and the Mobile
handler before the new template. A newly installed native iOS build with the
Associated Domains entitlement is required for the HTTPS link to open the app;
an OTA update alone cannot add that entitlement to older installations.

Validate the native-intent tests, Mobile/Web type and lint checks, the website
build, and the selected CI gates. After deployment verify the association URL
returns 200 JSON without a redirect and the fallback page loads. On the new
iPhone build check both cold and warm starts from an actual confirmation email.
Mail-client link handling can still choose its browser; the fallback must remain
usable. A screenshot of a browser-rendered template does not prove Gmail or
Apple Mail delivery behavior.

The template is self-contained HTML with inline styles and no tracking images.
Production Auth mail uses the separately verified `auth.backyrd.ch` sending
domain in Resend, with `Backyrd <konto@auth.backyrd.ch>` as its sender. The
canonical non-secret SMTP settings are in `auth-config.json`; the Resend SMTP
API key is supplied only by the Production environment secret
`BACKYRD_RESEND_AUTH_SMTP_KEY`. It must not appear in Git, the plan, logs, or
deployment audit. The release fails closed if that secret is absent. Verify
DKIM and SPF in Resend before deployment, then send a real confirmation and
password-recovery email and inspect the sender, delivery, and link behavior.
