/** Pure plan and budget admission. No model loading, network or resource mutations. */
export function betaTrainingPlan(manifest) {
  return {
    version: "backyrd.nuknuk-beta-training-plan@2",
    state: "PREPARED_NOT_EXECUTED",
    datasetCatalogHash: manifest.catalogHash,
    objective:
      "Lossless understanding of everyday Backyrd requests in German and Swiss German, with scoped roles, time, money, modalities, conditions and atomic follow-ups.",
    model: {
      base: "Qwen/Qwen3.6-35B-A3B",
      baseRevision: "995ad96eacd98c81ed38be0c5b274b04031597b0",
      parent: "EXACT_VERIFIED_LIVE_ADAPTER_TO_FREEZE_BEFORE_EXECUTION",
      parentIdentityVerifiedByThisPackage: false,
      noAutomaticParentSwap: true,
    },
    data: {
      counts: manifest.counts,
      trainFile: "train.jsonl",
      selectionFile: "valid.jsonl",
      testTrainingFile: null,
      testInputs: "test-requests.json",
      heldoutLabels: "catalog.json",
      seed: 42,
      shuffle:
        "Stable SHA-256 order over seed and case id; no implicit duplicated correction rows.",
      trainOnInputs: false,
      noTruncation: true,
      maxTotalTokens: 5120,
      maxAnswerTokens: 2048,
    },
    recipe: {
      status: "CONSERVATIVE_CONTINUATION_PROPOSAL_REQUIRES_PILOT",
      epochs: 1,
      learningRate: 0.000002,
      loraRank: 16,
      loraAlpha: 32,
      dropout: "PRESERVE_VERIFIED_PARENT_CONFIG",
      targetModules: "PRESERVE_VERIFIED_PARENT_CONFIG",
      microBatch: 1,
      gradientAccumulation: 4,
      optimizerUpdates: Math.ceil(manifest.counts.TRAIN / 4),
      loss: "ASSISTANT_COMPLETION_ONLY",
      seed: 42,
      automaticSecondEpoch: false,
      pilotOptimizerUpdates: 12,
      pilotUses:
        "TRAIN only; finite loss, gradient, memory, exact mask and measured throughput; never TEST for selecting a checkpoint.",
    },
    costs: {
      totalCeilingUsd: 50,
      cleanupReserveUsd: 5,
      allInHourlyRateMustBeVerified: true,
      autoPayMustBeOff: true,
      includes: [
        "startup",
        "download",
        "pilot",
        "all training attempts",
        "GPU development inference",
        "persistent storage until verified deletion",
        "billing settlement reserve",
      ],
      oneOwnedPodOnly: true,
      automaticRetryAllocation: false,
      maximumOwnedGpuHours: 6,
      trainingHoursEstimate: "MEASURE_IN_PILOT_NOT_GUARANTEED",
      alreadySpentByThisPackageUsd: 0,
    },
    execution: [
      "Verify exact files, source and tokenizer hashes.",
      "Freeze and measure the existing live parent on DEV.",
      "Check account balance, Auto-Pay, no unexpected owned resources and actual all-in quote.",
      "Start at most one explicitly bound resource with a cost/time watchdog.",
      "Run the bounded TRAIN pilot and admit the full epoch only if the pessimistic projection fits the remaining ceiling.",
      "Secure checkpoints locally and verify hashes.",
      "Delete the owned Pod and paid storage; verify deletion and billing.",
      "Test parent/candidate with identical prompts and inputs on the isolated Mac, restoring the prior service after any approved maintenance.",
      "Freeze candidate selection using DEV; run TEST only afterwards.",
      "Attribute failures separately to understanding, handoff, inventory, retrieval/ranking or presentation.",
    ],
    acceptance: {
      modelEvaluated: false,
      proposedMinimumFullCaseFraction: 0.95,
      criticalRoleAgeMoneyTimeModalityScopeOrLogicFailuresAllowed: 0,
      newMaterialRegressionsAllowed: 0,
      reportWorstVariantPerScenarioGroup: true,
      reportPerLocaleAndTheme: true,
      firstAttemptFailuresRemainFailures: true,
      equivalentGraphDifferencesRequireAdjudication: true,
      syntheticSuccessDoesNotProveBetaReadiness: true,
      nativeMacServingAndRealRecommendationChecksRequired: true,
      latency:
        "Measure p50/p95 against the existing live endpoint budget; do not loosen timeouts to make the candidate pass.",
    },
    publication: {
      automaticActivation: false,
      trainingApprovalIsNotProductionApproval: true,
      previousLiveModelRetained: true,
    },
  };
}
export function admitBetaBudget(input) {
  const {
    rateUsdPerHour,
    observedSpentUsd,
    storageAllowanceUsd,
    remainingBalanceUsd,
    autoPay,
    ownedPods,
    pilotSecondsPerUpdate,
    remainingUpdates,
    remainingSecondsForStartupAndSaving = 1800,
  } = input;
  for (const n of [
    rateUsdPerHour,
    observedSpentUsd,
    storageAllowanceUsd,
    remainingBalanceUsd,
    pilotSecondsPerUpdate,
    remainingUpdates,
    remainingSecondsForStartupAndSaving,
  ])
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0)
      throw Error("beta_budget_input_invalid");
  if (
    rateUsdPerHour <= 0 ||
    pilotSecondsPerUpdate <= 0 ||
    !Number.isInteger(remainingUpdates) ||
    autoPay !== false ||
    ownedPods !== 1
  )
    throw Error("beta_budget_boundary_invalid");
  const projectedSeconds =
    pilotSecondsPerUpdate * remainingUpdates * 1.5 +
    remainingSecondsForStartupAndSaving;
  const projectedAdditionalUsd =
    (projectedSeconds / 3600) * rateUsdPerHour + storageAllowanceUsd;
  const available = Math.min(50 - observedSpentUsd, remainingBalanceUsd) - 5;
  const allowed =
    projectedSeconds <= 6 * 3600 &&
    available >= 0 &&
    projectedAdditionalUsd <= available;
  return {
    allowed,
    projectedSeconds,
    projectedAdditionalUsd,
    totalProjectedUsd: observedSpentUsd + projectedAdditionalUsd,
    cleanupReserveUsd: 5,
    spendCeilingUsd: 50,
    resourceAllocationPerformed: false,
  };
}
export function betaStartHere(manifest) {
  return `# NukNuk – vollständiges Vorbereitungspaket\n\n**Stand: Katalog erstellt; kein neues Modell trainiert oder veröffentlicht.**\n\n## Inhalt\n\n- ${manifest.formulations} Formulierungen: **${manifest.counts.TRAIN} zum Lernen**, **${manifest.counts.DEV} zur Entwicklung**, **${manifest.counts.TEST} zur einmaligen Abschlussprüfung nach Kandidatenauswahl**.\n- ${manifest.controlledBlueprints} kuratierte Szenariovorlagen mit kontrollierten Ausprägungen, ${manifest.individuallyAuthoredSituations} zusätzlich einzeln formulierte Alltagssituationen und ${manifest.lexiconEntries} ergänzende Begriffszuordnungen.\n- Deutsch und Schweizer Formulierungen. Varianten und Zahlenänderungen sind keine unabhängigen neuen Alltagssituationen. Die Gruppen bleiben innerhalb eines Bestands.\n- Alltag: Familie, Alter und Rollen, Essen und Ernährung, Zeit, Budget und Kostenumfang, Mobilität, Wetter, Bereiche, Atmosphäre, Zugang, Buchung, Ausstattung, Anlässe, Alternativen, Reihenfolge, Kombinationen, Unsicherheit, Rückfragen und Dialogkorrekturen.\n\n## So liest du das Paket\n\n**GESAMTKATALOG.md** enthält sämtliche Anfragen und die tatsächlich zugehörigen Lernziele in lesbarer Form. **FRAGENKATALOG.md** enthält nur die Anfragen. **BEGRIFFE.json** dokumentiert die zusätzlichen Begriffszuordnungen. Du musst diese Fälle nicht einzeln bewerten; die Aufbereitung und Prüfung liegt bei mir.\n\nDie maschinellen Daten stehen in **catalog.json**, **train.jsonl** und **valid.jsonl**. Es gibt absichtlich keine Trainingsdatei mit TEST-Zielantworten. Die Abschlussfragen stehen in **test-requests.json**, ihre zurückgehaltenen Soll-Antworten im vollständigen lokalen Katalog. TEST darf weder zur Optimierung noch zur Auswahl des Kandidaten verwendet werden. Sichtbare synthetische Prüfungen werden nicht als unabhängige menschliche Blindstudie bezeichnet.\n\n## Training und Kosten\n\n**training-plan.json** legt den Ablauf fest: den bestehenden Parent exakt sichern, vorab vergleichen, einen kurzen technischen Probelauf messen, dann einen vollständigen Durchlauf des Lernbestands. Vorläufige konservative Fortsetzungsparameter: LoRA-Rang 16, Alpha 32, Lernrate 2e-6, ein Durchlauf, Batch 1 mit vierfacher Gradientenakkumulation. Parent-Konfiguration und Zielmodule werden vor Ausführung geprüft, nicht geraten.\n\n**50 USD sind die gesamte vorgeschlagene Obergrenze**, einschliesslich Vorbereitung auf der GPU, Fehlversuchen, Training, GPU-Prüfung und bezahltem Speicher bis zur bestätigten Löschung. Fünf USD bleiben als Abrechnungs- und Aufräumreserve. Keine automatische Aufladung, höchstens ein eigener Pod, keine automatische Neuanlage. Der gemessene Pilot muss samt Sicherheitsfaktor in die verbleibende Grenze passen. Das Paket selbst startet keine Ressource. Eine vollständige Durchführung für 50 USD oder eine bestimmte Dauer wird ohne Messung nicht garantiert.\n\n## Was als Erfolg zählt\n\nWir vergleichen Parent und Kandidat auf denselben Anfragen. Vorgeschlagen sind mindestens 95 Prozent vollständig passende Abschlussfälle, keine materiellen Rollen-, Alters-, Budget-, Zeit-, Modalitäts-, Bezugs- oder Logikfehler und keine neue materielle Verschlechterung. Ergebnisse werden zusätzlich nach Szenariogruppe, Thema und Sprache ausgewiesen. Ein strukturell anderer, aber möglicherweise gleichbedeutender Graph braucht fachliche Prüfung.\n\nDanach folgt die native Mac-Prüfung und eine Prüfung der tatsächlichen Empfehlungskette. Gute Sprachübersetzung allein beweist weder passende Ortsdaten noch zulässige Angebote oder funktionierende Live-Empfehlungen. Modellaktivierung bleibt ein eigener Schritt.\n\n## Ehrlicher Nachweisstand\n\nDie Daten sind assistenzverfasste synthetische Lehrdaten. Bekannte frühere Fehlermuster dienen dem Lernen. Technische Validierung, numerische Quellenprüfung, Rollenprüfungen, gruppierte Trennung, Grammatik und Tokenisierung sind keine Garantie korrekter Semantik oder eines besseren Modells. **preflight.json** und **quality-report.json** nennen die ausgeführten Prüfungen und ihre Grenzen; alle Modellmetriken bleiben bis zur echten Ausführung offen.\n\nDas Modell lädt dieses Paket nicht von selbst. Für den nächsten Schritt wird genau die versiegelte Fassung in den bestehenden begrenzten Trainingsprozess übernommen.\n\n## Quellen und Reproduktion\n\nDie versionierten Quellen liegen im angegebenen Git-Commit unter scripts/decision-diagnostics/nuknuk-curriculum. Build: node scripts/decision-diagnostics/nuknuk-curriculum/beta-catalog.mjs build AUSGABE. Prüfung: derselbe Befehl mit verify.\n\nTechnische Referenzen: [Qwen-Modellkarte](https://huggingface.co/Qwen/Qwen3.6-35B-A3B), [SFT und getrennte Auswertung](https://huggingface.co/docs/trl/sft_trainer), [aktuelle Runpod-Preise](https://www.runpod.io/pricing). Der konkrete Tarif muss vor Ausführung erneut verifiziert werden.\n`;
}
