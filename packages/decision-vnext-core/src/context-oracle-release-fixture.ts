/**
 * Reviewed Phase 3A synthetic evaluation release. This is fixture provisioning,
 * not a Product policy and not part of the package's public runtime API.
 */
import { deepFreeze } from "./canonical.js";
import { validateAcceptedOracleCatalogs, type AcceptedOracleCatalogs } from "./context-oracle-catalog.js";
import {
  provisionSyntheticAuthorityCatalog,
  provisionSyntheticOracleRelease,
  provisionSyntheticTrustAnchorCatalog,
  type OracleAuthorityFixtureSpec,
} from "./context-oracle-provisioning.js";

export const PHASE3A_RELEASE_SCENARIO_IDS = [
  "companion-alone-vs-friends", "midday-vs-late-evening", "available-time-long-vs-short", "distance-low-vs-high", "weather-dry-vs-rain",
  "budget-narrow-vs-broad", "familiar-vs-exploration", "general-vs-accessibility-hard", "location-permission-granted-vs-denied", "weather-known-vs-unavailable",
  "context-unknown-vs-not-configured", "initial-vs-alternative-requested", "candidate-unseen-vs-rejected", "same-request-different-authorized-location", "same-context-different-timezone",
] as const;

const BASE = {
  baseContextHash: "a16e44e7d5b24069bee7cb745fecb31dab2936575e095e18a3ca2d6b88a2565a",
  baseContextIdentity: "e626edf983965d88f9867373a06c61f96ec0f82d71fc8c6a8c3bfbc1c4a9c56e",
  baseEnvelopeHash: "693034967c60cefcb3055b38cf2325d106a5208440dc97019cebea7d9f192c03",
  hardChanged: false,
  softChanged: false,
  eligibility: "NOT_CONFIGURED" as const,
};

const SPECS: readonly OracleAuthorityFixtureSpec[] = [
  { ...BASE, scenarioId: "companion-alone-vs-friends", flippedContextHash: "7a2e16b4e2ba9a4843b92de0e9f87c58ddb6f6c05f91abc8f0bad525d0c59020", flippedContextIdentity: "c818798bc6b4bc58274ba63d4a8482f2f372934e779b396d73dc4725f459db88", flippedEnvelopeHash: "bdab22bdb8bba6afa761572907a694fa5194fe74c24665208bee8f9603d72c1c", changes: ["context.companion.explicit"], inputs: ["CLIENT_REQUEST"], expectedAuthorityHash: "94b894367664b559a711d068464b016a08a00126ca8bbfbecdd1fd86f53668c2" },
  { ...BASE, scenarioId: "midday-vs-late-evening", flippedContextHash: "1f19ec2263d5bae547e9cbe925b8ce77d78055a9281087f726172118a74fe222", flippedContextIdentity: "c812d1face5a11dfc09ef4b3e4b31b46e8a847524af815d9288b83398bbf6419", flippedEnvelopeHash: "ee2ef5b5e805d108dc6394ae26a6862d148002417baf8ba2269974de0389d141", changes: ["context.location.permission", "context.location.scope", "context.occasion.explicit", "context.session.state", "context.time.local", "context.time.server", "context.weather.explicit", "context.weather.observed", "fixture.constraint.accessibility"], inputs: ["AUTHORITY_SERVER_TIME", "AUTHORITY_WEATHER"], expectedAuthorityHash: "fe6cced496bb334060456fed40f359ca9c50cf2ebe55107314a8564177183f92" },
  { ...BASE, scenarioId: "available-time-long-vs-short", flippedContextHash: "dcbca81b3f3ee45e6fb59e6f196b1814b4cc4bd5eeef5694f0ed4e53419dcf29", flippedContextIdentity: "04958752cda91533ccdd166e761cd28829b99ffde1a9d5c6a4aeefa05253a43f", flippedEnvelopeHash: "3184d755ccdb976787a8a3945cd595db5bdb51b9eb6e64e1aaa00d7b7b39b944", changes: ["context.available-time.explicit"], inputs: ["CLIENT_EXPLICIT_DIMENSIONS"], expectedAuthorityHash: "b8512c934667f3b6efc22653228fcefdbbcdf895c501cf957dae0e5e2c81774c" },
  { ...BASE, scenarioId: "distance-low-vs-high", flippedContextHash: "860557e2a64e8873b0c2fa44f1936a280a09ff182d1fc4cf7cf10dd048d4737d", flippedContextIdentity: "c3b44fb34a40d79715560284059caff1ceb482d0cdb709c369e3de845c3e9b4f", flippedEnvelopeHash: "f1739aa5bdabc12b61cca7659652971562bc04323f95d6f2a5bb1831b6356da7", changes: ["context.distance-willingness.explicit"], inputs: ["CLIENT_EXPLICIT_DIMENSIONS"], expectedAuthorityHash: "5e36eb5925709dc4b032a377ebe035544fea5229863d6e66105d1091d6399458" },
  { ...BASE, scenarioId: "weather-dry-vs-rain", flippedContextHash: "01ee11887a0aa60cb09cfd768e165e92d7c7a0f1ab122b4d87630c1c886e271e", flippedContextIdentity: "e3c6938409986e8ab788ff5aa7d804c095d3ed87392408e1248236ccdca3d189", flippedEnvelopeHash: "3ac251545c1a71ff292f8c25244f164d3ee51647882e703f2669ae673348b631", changes: ["context.weather.observed"], inputs: ["AUTHORITY_WEATHER"], expectedAuthorityHash: "cece95039f05ff583892e293a09ca497b77baa38be1772ba40875e807f448fda" },
  { ...BASE, scenarioId: "budget-narrow-vs-broad", flippedContextHash: "5a1614ef1eee415f8a3e05d1d21432a78ff6b9f5b3f0552b975f35392d4babb4", flippedContextIdentity: "a94db7756fae526471102384b1a9326e7853c214aa1a5767be1ecb15f315d388", flippedEnvelopeHash: "6fa1e26f50f677d1e1668510864eab98bb045876b554f9e659e858ed457420eb", changes: ["context.budget.explicit"], inputs: ["CLIENT_REQUEST"], expectedAuthorityHash: "c28741443653b0fb811bb5d2a75653a2da6cd99afaa7f53f6e171e7bae99aaec" },
  { ...BASE, scenarioId: "familiar-vs-exploration", flippedContextHash: "e71db9c525ed1dd3aac12b86d75712893b606cdf4af39ec26bac6faf287bb939", flippedContextIdentity: "b1662434022a4ab5b1519c89b868f209f7349e6e739413d85d86fa10254b93cb", flippedEnvelopeHash: "6292aa5c9683886f9e04880d9a2bf782af9d89bed33f2e329ae68bc2ba29db85", changes: ["context.exploration.explicit"], inputs: ["CLIENT_REQUEST"], expectedAuthorityHash: "b834c66c95965ec40c177164e7b040ccfca10e106c76efbb1d5d252563560bd0" },
  { ...BASE, scenarioId: "general-vs-accessibility-hard", flippedContextHash: "1ea50ac373f0b271942d1ef198abecb297d52f25aa16c61ae2cb2ac0843de958", flippedContextIdentity: "ba382f2ccd22d36381e9199aa31f71a61abfa227b46967ed333789a96cffb7f0", flippedEnvelopeHash: "42e50e7a06bab481d6902942457bf61f921804f614b6f96018f1eb9705ce30c1", changes: ["fixture.constraint.accessibility"], inputs: ["CLIENT_HARD_CONSTRAINTS"], hardChanged: true, eligibility: "MAY_CHANGE_BY_CONFIGURED_HARD_CONSTRAINT", expectedAuthorityHash: "d46ef6fa9c722d95631e40cdc8140a5b6564729db6a97562844f1d0cf68b115b" },
  { ...BASE, scenarioId: "location-permission-granted-vs-denied", flippedContextHash: "835b2e1334afcfa9586ea1800aa58c47a63c0606346ae3ec0cd2ffb10932b6f5", flippedContextIdentity: "c901fc7e1f4e86ceb2f5db2b269d871c8bc6d332395d9bdb477edf98f9208ee3", flippedEnvelopeHash: "d8d8d5388cfb417470a0b0ff109140b5fdc9963318045f01289bf3e8a7788f31", changes: ["context.location.permission", "context.location.scope"], inputs: ["AUTHORITY_LOCATION", "AUTHORITY_PERMISSION"], expectedAuthorityHash: "4015b777393d0875f8f8e5c16743dc56c230b661e8ff859f687ab070d19dd220" },
  { ...BASE, scenarioId: "weather-known-vs-unavailable", flippedContextHash: "bd018f8833a9ef264227658489845ebc76753f3b738c5ebb59477fe16c45d72f", flippedContextIdentity: "250c958743b661a5410c92a5de711c37e5c1191d84362dfc1d4c781cf48dc665", flippedEnvelopeHash: "550113d0ab5cfe88644b7ca1e06ce6a396a1cbf8cb4aca75975485085f3015cb", changes: ["context.weather.observed"], inputs: ["AUTHORITY_WEATHER"], expectedAuthorityHash: "385e40ffe02790fb06adc6451e93ce959bd36ad974baa45649b023d59d2b9fa4" },
  { scenarioId: "context-unknown-vs-not-configured", baseContextHash: "4b80c9967bb0f091fdfafa8ca1513125674685bf612aafbd5fa9134a21a0c0c2", flippedContextHash: "133866ffa59d6b1c87ef5e0be37d5afde61873f96d654a56cf1cd3d92b82dacb", baseContextIdentity: "c0b86737f2b3dbfbdd7d2725f157b9fd00e64e739f4681a6c7ca06a7a2c79232", flippedContextIdentity: "d19219d94c1be26fe3d6d14c21a151dd2db841030d8e072548a0c9a294c71dce", baseEnvelopeHash: "47af761443aab79fe2fceb296d549d4efc16fdd72941e1c2dfd6e4029b008737", flippedEnvelopeHash: "713955a6e860c7efbd35064a10cec326c98b91f44924ed73b4b0101ec08ccc26", changes: ["context.exploration.explicit"], inputs: ["CLIENT_REQUEST"], hardChanged: false, softChanged: false, eligibility: "NOT_CONFIGURED", expectedAuthorityHash: "e5cbcfc5708b3180c3872eb9a5f542b0c2482bb25416ceccdbb301e71292f77b" },
  { ...BASE, scenarioId: "initial-vs-alternative-requested", flippedContextHash: "26c19829482a2d1af1bf9465e233ed989d13dc1221ae068c5921329330882e68", flippedContextIdentity: "83500c60ef9685856479e1600444b4a118d74251625c60e63ff764069bbcc4df", flippedEnvelopeHash: "dfd04dd7199a1dafd3a4b17f1abe8b75fc2363eca594cf239d4aa0b0f8167028", changes: ["context.session.state"], inputs: ["AUTHORITY_SESSION_STATE"], expectedAuthorityHash: "cf14ee1857baf7d49877cdce66835f3f134bc5823f6ad8514f21bf0afcb33b55" },
  { ...BASE, scenarioId: "candidate-unseen-vs-rejected", flippedContextHash: "6fb553c197efc9fc1fee4014d7bd3f98900f89cdd7cecd82b4d843d751e78413", flippedContextIdentity: "ee7e9c74c21f263d4e808e5b6e8445142dec4a4bde22567fdff71b09c7699407", flippedEnvelopeHash: "f0a9b9aa71b193dd1855de026ecd23f5feabb0565702e8b79e35d3ac5b45b320", changes: ["context.session.state"], inputs: ["AUTHORITY_SESSION_STATE", "CLIENT_REQUEST"], expectedAuthorityHash: "7affeb478476d8a3f2aa166245907c1d140219ed6bb4a9fdc36920c98651bac1" },
  { ...BASE, scenarioId: "same-request-different-authorized-location", flippedContextHash: "51d1059f65a39fff98eb838965367abc454685763cd4017f3264675a15807274", flippedContextIdentity: "cbe12177f7e0906510cfac1a4806576c0c1ca15e62524d5187a1031f329b2687", flippedEnvelopeHash: "7fafb068e899e1f86395c54846d4a3488976dd2b0a4098dc5a52d384f20c93d9", changes: ["context.location.scope", "context.weather.observed"], inputs: ["AUTHORITY_LOCATION", "AUTHORITY_WEATHER", "CLIENT_REQUEST"], expectedAuthorityHash: "76529c85b844c42f5789ad94d1e3c78be04953e7bd38b269371e00f2a8bf0c97" },
  { ...BASE, scenarioId: "same-context-different-timezone", flippedContextHash: "728bef9bdc262ebb8683fc7f81bfa050b399f2e5f5cd2421225565c4bb926a3f", flippedContextIdentity: "f8ed363505b82b9b869ea01bd135bfdd5668b85b0c014b2c7452724aa210be92", flippedEnvelopeHash: "96126eaf36632885ba5164a852c173352d5afe0b925841316ff0b6b70641ac60", changes: ["context.time.local"], inputs: ["AUTHORITY_TIME_ZONE"], expectedAuthorityHash: "a697906b24b51e257805ab38880585190babb1f6275ebf7454e296d0fdd1506b" },
];

export const PHASE3A_ORACLE_AUTHORITY_CATALOG = provisionSyntheticAuthorityCatalog(SPECS, {
  version: "backyrd-vnext-context-fixture-registry-v1",
  hash: "048b794a9072c3c52ba5186bc604c455b8aef20cf3c7dbe07dfbc190bb531042",
}, {
  version: "backyrd-vnext-context-fixture-policy-v1",
  hash: "b1ad89e7b4b3d81165767c608bffcf5eb2b7cbd43e5f255effed10620999cce4",
});

export const PHASE3A_ORACLE_TRUST_ANCHOR_CATALOG = provisionSyntheticTrustAnchorCatalog(
  SPECS,
  PHASE3A_ORACLE_AUTHORITY_CATALOG.catalogVersion,
  PHASE3A_ORACLE_AUTHORITY_CATALOG.catalogHash,
);

export const PHASE3A_ORACLE_RELEASE = provisionSyntheticOracleRelease(PHASE3A_ORACLE_AUTHORITY_CATALOG, PHASE3A_ORACLE_TRUST_ANCHOR_CATALOG);

// Review-pinned separately from all three generated artifacts. Updating the release requires an explicit diff here.
export const ACCEPTED_PHASE3A_ORACLE_RELEASE_HASH = "88d9863ae794f2dc5f6156c4b294da80ff485cd32335d33ece7dbec3cc668efa";

export function loadAcceptedPhase3AOracleRelease(): AcceptedOracleCatalogs {
  return deepFreeze(validateAcceptedOracleCatalogs(
    PHASE3A_ORACLE_AUTHORITY_CATALOG,
    PHASE3A_ORACLE_TRUST_ANCHOR_CATALOG,
    PHASE3A_ORACLE_RELEASE,
    ACCEPTED_PHASE3A_ORACLE_RELEASE_HASH,
    PHASE3A_RELEASE_SCENARIO_IDS,
  ));
}
