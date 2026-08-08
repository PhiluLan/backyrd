# Canonical Supabase managed metadata

These files describe Backyrd-owned Supabase metadata that is not part of the normal
`public` schema dump. They are intentionally separate from the active migration chain.

For a fresh, isolated environment, apply them after all files in `supabase/migrations/`
have succeeded, in this order:

1. `storage.sql`
2. `auth_hooks.sql`
3. `realtime.sql`
4. `cron.sql`
5. `webhooks.sql`

`cron.sql` and `webhooks.sql` reference Vault secret names only. Provision the required
secrets out of band before enabling those integrations. Never commit secret values.

Required Vault names:

- `backyrd_project_url`
- `backyrd_publishable_key`
- `backyrd_service_role_key`
- `backyrd_safety_text_worker_secret`
- `backyrd_safety_image_worker_secret`
- `backyrd_message_push_webhook_secret`

These files touch Supabase-managed schemas. Execute them with the project-specific
Supabase admin workflow; the normal `postgres` migration role does not own every local
`auth` or `storage` object. Never work around ownership by broadening grants.

Do not apply these files to production without a reviewed reconciliation plan.
