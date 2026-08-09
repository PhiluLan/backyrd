import type { FounderGate, FounderGateStatus, FounderPriority, FounderSourceType } from "@/types/founder";

export const gateStatusLabels: Record<FounderGateStatus, string> = {
  open: "Offen",
  in_progress: "In Arbeit",
  verify: "Zur Prüfung",
  verified: "Bestätigt",
  accepted_risk: "Akzeptiertes Risiko",
};

export const sourceLabels: Record<FounderSourceType, string> = {
  automatic: "Automatisch",
  system: "System",
  manual: "Manuell",
};

export const priorityLabels: Record<FounderPriority, string> = {
  P0: "Kritisch",
  P1: "Wichtig",
  P2: "Beobachten",
};

export const categoryLabels: Record<string, string> = {
  product_decision: "Produkt & Empfehlungen",
  security: "Sicherheit",
  legal_privacy: "Recht & Datenschutz",
  basel_data: "Basel-Daten",
  reliability: "Stabilität",
  trust_safety: "Vertrauen & Moderation",
  analytics: "Messung & Analytics",
  release_app_store: "Release & App Store",
  operations_finance: "Betrieb & Finanzen",
};

type GateCopy = Pick<FounderGate, "title" | "description" | "requirement" | "why_it_matters">;

const gateCopy: Record<string, GateCopy> = {
  decision_eligibility: {
    title: "Empfehlungen zuverlässig",
    description: "Geschlossene, nicht verfügbare oder ungeeignete Orte dürfen nicht empfohlen werden.",
    requirement: "Geprüfte Fälle bestätigen Öffnungszeiten, Verfügbarkeit, Standort und Sicherheits-Ausschlüsse.",
    why_it_matters: "Eine Empfehlung hilft nur, wenn der Ort im entscheidenden Moment wirklich passt und verfügbar ist.",
  },
  basel_decision_gold_set: {
    title: "Empfehlungsqualität geprüft",
    description: "Ein repräsentativer Basel-Testkatalog deckt Stimmungen, Zeiten, Begleitung und schwierige Fälle ab.",
    requirement: "Die vereinbarten Basel-Testfälle sind geprüft, versioniert und bestehen mit dem Release-Kandidaten.",
    why_it_matters: "Technisch funktionierender Code beweist noch nicht, dass Menschen gute Empfehlungen erhalten.",
  },
  canonical_moment_flow: {
    title: "Erlebnis- und Bewertungsablauf",
    description: "Von der Empfehlung bis zur späteren Rückmeldung gibt es einen klaren, vollständigen Ablauf.",
    requirement: "Empfehlung, Spot-Aufruf, Speichern oder Besuch und die spätere Rückmeldung wurden vollständig getestet.",
    why_it_matters: "Backyrd muss reale Entscheidungen verbessern und aus echten Erlebnissen lernen können.",
  },
  credential_secret_security: {
    title: "Zugangsdaten sicher",
    description: "Produktive Zugangsdaten bleiben geschützt und gelangen weder in Code noch in öffentliche Ausgaben.",
    requirement: "Secret-Prüfungen sind grün, Umgebungsvariablen geprüft und mögliche Leaks vollständig bereinigt.",
    why_it_matters: "Ein kompromittierter Zugang kann Vertrauen, Nutzerdaten und den gesamten Launch gefährden.",
  },
  ai_cost_abuse_protection: {
    title: "Schutz vor Missbrauch und Kosten",
    description: "KI-Funktionen sind gegen unkontrollierte Nutzung, Kosten und Ausfälle abgesichert.",
    requirement: "Authentifizierung, Limits, Zeitgrenzen und Kostenkontrollen sind für alle wichtigen KI-Funktionen nachgewiesen.",
    why_it_matters: "Unbegrenzte Nutzung kann Kosten verursachen und die Verfügbarkeit für echte Nutzer beeinträchtigen.",
  },
  native_security_permissions: {
    title: "App-Berechtigungen und Gerätesicherheit",
    description: "Die App fordert nur notwendige Berechtigungen an und verhält sich auf echten Geräten sicher.",
    requirement: "Kamera, Standort, Fotos, Mitteilungen und App-Links wurden auf Release-Versionen geprüft.",
    why_it_matters: "Überraschende Berechtigungen schaden dem Vertrauen und können die Store-Freigabe verhindern.",
  },
  legal_privacy_store: {
    title: "Recht, Datenschutz und Store",
    description: "Rechtstexte, Einwilligungen, Store-Angaben und Datenschutzabläufe stimmen überein.",
    requirement: "Rechtliche Freigabe, Store-Datenschutzangaben und Nutzerrechte sind vollständig geprüft.",
    why_it_matters: "Widersprüchliche Angaben oder nicht funktionierende Nutzerrechte blockieren den Launch.",
  },
  basel_spot_set: {
    title: "Basel-Angebot launchbereit",
    description: "Basel verfügt über genügend aktuelle, freigegebene und empfehlbare Spots für die wichtigsten Bedürfnisse.",
    requirement: "Menge, Abdeckung und Qualität der Basel-Spots erfüllen die gemeinsam festgelegte Launch-Schwelle.",
    why_it_matters: "Ohne verlässliche lokale Auswahl kann Backyrd keine guten Basel-Entscheidungen ermöglichen.",
  },
  production_source_of_truth: {
    title: "Live-System synchron",
    description: "Codebasis, Datenbankstand und produktiver Release-Ablauf sind eindeutig und wiederholbar.",
    requirement: "Ein sauberer Neuaufbau funktioniert und der Weg bis ins Live-System ist dokumentiert und geprüft.",
    why_it_matters: "Unklare oder manuell abweichende Live-Stände machen alle anderen Launch-Nachweise unzuverlässig.",
  },
  auth_release_readiness: {
    title: "Anmeldung releasebereit",
    description: "Registrierung, Bestätigung, Anmeldung, Sitzungswiederherstellung und Kontolöschung funktionieren zuverlässig.",
    requirement: "Erfolgs- und Ablehnungsfälle wurden mit dem Release-Kandidaten in einer sicheren Testumgebung geprüft.",
    why_it_matters: "Menschen müssen Backyrd zuverlässig betreten, nutzen und verlassen können.",
  },
  dependency_risk: {
    title: "Software-Abhängigkeiten",
    description: "Launchkritische Software-Bausteine sind unterstützt, reproduzierbar und ohne offene kritische Warnungen.",
    requirement: "Abhängigkeiten sind aktuell, kritische Risiken gelöst oder bewusst akzeptiert und ein Rückweg ist bekannt.",
    why_it_matters: "Eine fragile Abhängigkeit kann während des Launches zu Ausfällen führen.",
  },
  safety_operational_drill: {
    title: "Moderation im Ernstfall geprüft",
    description: "Das Team kann einen realistischen Sicherheitsfall prüfen, entscheiden, korrigieren und eine Beschwerde bearbeiten.",
    requirement: "Eine dokumentierte Übung bestätigt menschliche Prüfung, Nachvollziehbarkeit, Rücknahme und Beschwerdeweg.",
    why_it_matters: "Technische Schutzfunktionen reichen nicht, wenn der operative Ernstfall nicht beherrscht wird.",
  },
  launch_analytics: {
    title: "Launch-Messung vollständig",
    description: "Aktive Nutzer, Entscheidungen und Launch-Gesundheit werden verlässlich und datenschutzkonform gemessen.",
    requirement: "Messereignisse sind im Release geprüft und stimmen mit bekannten Testfällen überein.",
    why_it_matters: "Ohne verlässliche Messung können wir die wiederkehrende Basel-Nutzung nicht belegen.",
  },
  mobile_release_quality: {
    title: "App technisch releasebereit",
    description: "Der Release-Kandidat läuft stabil auf den unterstützten iOS- und Android-Geräten.",
    requirement: "Codeprüfung, Build, Gerätetests, Absturzprüfung und Update-Pfade bestehen für genau diese Version.",
    why_it_matters: "Entwicklungsversionen beweisen nicht, dass die App-Store-Version stabil funktioniert.",
  },
  release_candidate_e2e: {
    title: "Release vollständig getestet",
    description: "Die endgültige App-Version besteht die wichtigsten Nutzerwege von Anfang bis Ende.",
    requirement: "Anmeldung, Empfehlung, Spot-Auswahl, Rückmeldung, Datenschutz und Wiederherstellung funktionieren auf echten Geräten.",
    why_it_matters: "Einzeltests erkennen keine Brüche zwischen mehreren Schritten und Systemteilen.",
  },
  feature_freeze: {
    title: "Funktionsumfang eingefroren",
    description: "Nach dem vereinbarten Stichtag gelangen nur noch launchkritische Korrekturen in die App.",
    requirement: "Founder und CTO dokumentieren Stichtag, Release-Version und den Umgang mit Ausnahmen.",
    why_it_matters: "Ständig neue Funktionen verhindern eine verlässlich prüfbare Release-Version.",
  },
  owner_minimum: {
    title: "Betreiber-Basisfunktionen",
    description: "Verifizierung und Betreuung von Betreibern erfüllen das notwendige Launch-Minimum.",
    requirement: "Beantragung, Prüfung, Freigabe, Rücknahme und Support-Verantwortung wurden vollständig erprobt.",
    why_it_matters: "Fehlerhafte Betreiber-Abläufe verursachen Vertrauens- und Supportprobleme.",
  },
  repository_release_source_of_truth: {
    title: "Codebasis und Release-Prozess sauber",
    description: "Der aktuelle Hauptstand, automatische Prüfungen und versionierte Änderungen bilden den verlässlichen Release-Nachweis.",
    requirement: "Codebasis, Datenbankaufbau, Geheimnisprüfungen und Verantwortlichkeiten bestehen auf dem Hauptstand.",
    why_it_matters: "Launch-Entscheidungen brauchen einen nachvollziehbaren, reproduzierbaren und geprüften technischen Stand.",
  },
};

export const milestoneLabels: Record<string, string> = {
  internal_alpha: "Interne Alpha",
  founder_control_center: "Founder Control Center",
  security_gate: "Sicherheitsfreigabe",
  closed_beta_50: "Geschlossene Beta · 50 Personen",
  closed_beta_100: "Geschlossene Beta · 100 Personen",
  basel_data_gate: "Basel-Daten freigegeben",
  app_store_approval: "App-Store-Freigabe",
  public_soft_launch: "Öffentlicher Soft Launch",
  wau_500: "500 aktive Nutzer pro Woche",
  wau_1000: "1’000 aktive Nutzer pro Woche",
  basel_pmf_gate: "Basel Product-Market-Fit bestätigt",
};

export function founderGateCopy(gate: GateCopy & { key: string }): GateCopy {
  return gateCopy[gate.key] ?? gate;
}

export function founderGateTitle(key: string, fallback: string): string {
  return gateCopy[key]?.title ?? fallback;
}

export function founderGateWhy(key: string): string | null {
  return gateCopy[key]?.why_it_matters ?? null;
}

export function categoryLabel(key: string, fallback?: string): string {
  return categoryLabels[key] ?? fallback ?? key;
}

export function founderOwner(owner?: string | null): string {
  if (!owner) return "Noch offen";
  return owner
    .replaceAll("Trust & Safety", "Vertrauen & Moderation")
    .replaceAll("Product", "Produkt")
    .replaceAll("Engineering", "Entwicklung")
    .replaceAll("Operations", "Betrieb")
    .replaceAll("Legal", "Recht")
    .replaceAll("Data", "Daten");
}

export const priorityOrder: Record<FounderPriority, number> = { P0: 0, P1: 1, P2: 2 };

export function founderDate(value?: string | null): string {
  return value
    ? new Date(value).toLocaleString("de-CH", { dateStyle: "medium", timeStyle: "short" })
    : "—";
}
export function founderNumber(value: number): string {
  return new Intl.NumberFormat("de-CH").format(value);
}
