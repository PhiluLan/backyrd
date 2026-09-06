# Decision v26 evidence re-certification: Events V1 Metro packaging

The Founder-authorized Events V1 Consumer Product Polish was merged through
PR #210 at canonical main `3454f012c9c1d70b71dafda5e0b2cd31c8d9b234`.
Its first Production OTA export stopped before upload because Metro did not
watch the repository shared package that supplies the runtime-only Event
presentation helpers. No OTA update was created by that failed export.

## Preserved Production identity

- Supabase project: `hjgcrrzfjchzqoegcywn`
- Function: `decision-v13`
- Active Production version: `124`
- Production bundle SHA-256:
  `a920d38405534f8fdd02e13934988b97fcd4dec12e9c93d8f8dd8bed8d4dac13`
- Repository-matched deployed files: `41 / 41`
- Decision Engine source SHA-256:
  `cad2c4ea94817d2facbd54db92f55f3286acecf4d1e8a71dda414431b76cf000`

The protected semantic source set is byte-identical to v25. Decision,
Ranking, Mood, Taste, N4, Auth, Push, Deep Link, Gate 1–7, database, RLS,
Admin, Spot and Event-domain semantics are unchanged.

## Authorized evidence change

The exact packaging correction is
`95ba3174787a4f40d6d81dcf107a34eab292a383`, based on canonical main
`3454f012c9c1d70b71dafda5e0b2cd31c8d9b234`. It adds the existing repository
shared package to Metro's explicit watch graph. A clean local iOS and Android
Expo export then completed successfully. No application behavior, canonical
Event value, Event/Occurrence behavior or Production Decision runtime changed.

## Result

`AUTHORIZED` — evidence identities may be re-derived for this exact Metro
packaging correction only. No Decision runtime deployment, semantic change,
guard relaxation, database change or external Event source activation is
authorized.
