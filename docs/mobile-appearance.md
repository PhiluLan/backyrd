# Mobile appearance

Backyrd uses the device appearance on iOS. The Android app defaults to the device appearance and also offers **System**, **Hell**, and **Dunkel** in Settings. The Android choice is stored on the device; choosing System removes the override.

`mobile/theme/appearance-colors.json` is the semantic light/dark palette. `mobile/theme/backyrd.ts` exposes it to React Native components. Keep photo-overlay text explicitly bright where the image supplies its contrast, while page surfaces and ordinary text use semantic colors. Android `values` and `values-night` resources are generated from the same palette by `mobile/plugins/with-appearance-colors.js` during Expo prebuild. Do not edit generated native resource files.

For visual QA, switch the iOS Simulator between Light and Dark in Settings and inspect Home, discovery list/map, spot details, Wohin, moment creation, profile, messages, and Settings. On Android, test all three choices, restart the app to verify persistence, and confirm that System follows a subsequent device appearance change. Check text on images, modal surfaces, loading/error states, status bar, and keyboard/input contrast in each mode.
