# Isolated Mobile development environment

Development, simulator and preview builds use the EAS `development` or `preview` environment and the `.dev` application identity. They are rejected during configuration if their Supabase URL points at Production project `hjgcrrzfjchzqoegcywn`. `map-validation-sim` is a preview build; it cannot consume the Production channel or Production database.

The repository contains no Supabase URL or key in `eas.json`. Configure these public runtime variables in both EAS environments:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- the existing Maps/OAuth public variables required by the build

For local work, run `eas env:pull --environment development` from `mobile/`; compare the resulting file with `.env.development.example`. Never copy Production Product data into the development project. Apply canonical migrations to an empty development database and use synthetic fixtures only.

Production builds and OTA releases remain bound to the EAS `production` environment. Production OTA already uses `eas update --channel production --environment production`.
