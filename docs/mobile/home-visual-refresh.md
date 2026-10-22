# iOS Home visual refresh

The iOS app uses the native system font throughout its UI. Home applies a bold, tightly tracked display treatment to the greeting, nearby heading, spot-card names, and Moments heading. Those titles scale to the available width; long spot names may use two lines. The greeting uses the profile's first available name, while the profile action shows the stored avatar or a smiley outline.

Home's second line reflects local device time: Morgen 05:00–09:00, Vormittag 09:01–11:59, Mittag 12:00–14:00, Nachmittag 14:01–17:00, Abend 17:01–22:00, and Nacht 22:01–04:59. The daypart underline and question mark use the pink accent.

The search field submits through the keyboard search action or its pink magnifier, which appears after typing. Inputs shorter than the existing authenticated/guest minimum show an inline hint. The nearby and Moments sections keep their cards and existing loading, empty, and error behavior. The nearby heading no longer has separate mood chips or a distance subline; the Moments heading no longer has a subtitle or an "Alle ansehen" link.

This is an iOS JavaScript/asset update for the existing 1.1.0 runtime. It changes no database schema, authorization rule, Decision Engine behavior, or native permission. Local simulator preview helpers and a fixed test daypart are excluded from the Production source.
