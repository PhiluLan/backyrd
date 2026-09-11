# Phase 3B Scenario Oracles

Der Founder Release enthält 28 eindeutige Szenarien: die 27 bestätigten Product-Fälle plus den korrigierten, isolierten `midday-vs-late-evening`-Zeitflip. Authority-, Trust- und Combined-Release-Artefakte sind getrennt; der Combined Release wird durch den gepinnten Ed25519-Key geprüft.

Replay verlangt die exakte Reihenfolge, rekonstruiert jeden Report und vergleicht Workbench und innere Reports byte-identisch. `productQualityClaim`, `productionAuthorized` und `runtimeActivated` bleiben false. Details und Hashes: [PHASE3B_ORACLE_RELEASE.md](./PHASE3B_ORACLE_RELEASE.md).
