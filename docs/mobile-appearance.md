# Mobile appearance

Backyrd uses the device appearance on iOS. The Android app defaults to the device appearance and also offers **System**, **Hell**, and **Dunkel** in Settings. The Android choice is stored on the device; choosing System removes the override.

`mobile/theme/appearance-colors.json` is the semantic light/dark palette. `mobile/theme/backyrd.ts` exposes it to React Native components. Keep photo-overlay text explicitly bright where the image supplies its contrast, while page surfaces and ordinary text use semantic colors. Android `values` and `values-night` resources are generated from the same palette by `mobile/plugins/with-appearance-colors.js` during Expo prebuild. Do not edit generated native resource files.

The canonical visual identity is a skin over the existing product architecture, not permission to rearrange screens or flows. Dark mode uses a soft blue-black base (`#1D222B`) with layered slate surfaces; light mode uses a cool near-white base (`#F5F7FA`). Pink remains a deliberate action and punctuation color instead of a large decorative field. Barlow Condensed ExtraBold is the display face for headings and spot names, while Libre Franklin remains the readable UI and body face. Preserve large photography, restrained copy, rounded surfaces, and clear hierarchy. A future proprietary Backyrd typeface may replace the display face only after its design, rights, and device QA are complete.

Home follows the approved reference composition for its location header, greeting, daypart prompt, search field, section headings, and image cards while preserving the Product-owned section order. Use ordinary word spaces and restrained tracking; never insert repeated spaces or size-proportional negative letter spacing to force a title to fit. Native font fitting may reduce long single-line headings without changing their copy or hierarchy.

For visual QA, switch the iOS Simulator between Light and Dark in Settings and inspect Home, discovery list/map, spot details, Wohin, moment creation, profile, messages, and Settings. On Android, test all three choices, restart the app to verify persistence, and confirm that System follows a subsequent device appearance change. Check text on images, modal surfaces, loading/error states, status bar, and keyboard/input contrast in each mode.

The initial appearance release uses iOS app version and Expo runtime 1.1.1. The native appearance setting is built into the app; the 1.1.0 OTA channel continues to serve its existing runtime independently.
