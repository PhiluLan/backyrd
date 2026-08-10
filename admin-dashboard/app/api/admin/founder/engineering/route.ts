import { NextResponse } from "next/server";
import { authorizeAdminRequest } from "@/lib/server/adminAuthorization";
import type { EngineeringPullRequest, FounderEngineering } from "@/types/founder";

export const dynamic = "force-dynamic";

const CACHE_SECONDS = 45;
let cache: { expiresAt: number; value: FounderEngineering } | null = null;

type GitHubCommit = {
  sha: string;
  html_url: string;
  commit: { message: string; committer: { date: string } | null };
};

type GitHubPull = {
  number: number;
  title: string;
  html_url: string;
  draft: boolean;
  mergeable: boolean | null;
  merged_at: string | null;
  updated_at: string;
  head: { ref: string; sha: string };
};

type GitHubCheckRuns = {
  check_runs: Array<{ status: string; conclusion: string | null }>;
};

function githubHeaders(token: string): HeadersInit {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "backyrd-founder-control-center",
  };
}
async function githubFetch<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: githubHeaders(token),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`github_api_${response.status}`);
  }
  return (await response.json()) as T;
}

function normalizeCi(checks: GitHubCheckRuns): EngineeringPullRequest["ciStatus"] {
  if (checks.check_runs.length === 0) return "unknown";
  if (checks.check_runs.some((check) => check.status !== "completed")) return "pending";
  if (checks.check_runs.some((check) => ["failure", "cancelled", "timed_out", "action_required"].includes(check.conclusion ?? ""))) {
    return "fail";
  }
  return checks.check_runs.every((check) => ["success", "neutral", "skipped"].includes(check.conclusion ?? ""))
    ? "pass"
    : "unknown";
}

function inferArea(pulls: EngineeringPullRequest[], latestMerge: GitHubPull | null): string {
  const text = `${pulls.map((pull) => `${pull.title} ${pull.branch}`).join(" ")} ${latestMerge?.title ?? ""}`.toLowerCase();
  if (text.includes("founder") || text.includes("launch")) return "Founder Cockpit & Basel-Launch";
  if (text.includes("trust") || text.includes("integrity") || text.includes("safety")) return "Vertrauen & Moderation";
  if (text.includes("decision")) return "Empfehlungsqualität";
  if (text.includes("spot")) return "Spot-Qualität";
  return "Backyrd-Plattform";
}

async function loadEngineering(): Promise<FounderEngineering> {
  const token = process.env.FOUNDER_GITHUB_TOKEN ?? process.env.GITHUB_TOKEN;
  const repository = process.env.FOUNDER_GITHUB_REPOSITORY ?? "PhiluLan/backyrd";
  if (!token) throw new Error("github_not_configured");

  const [main, openPulls, closedPulls] = await Promise.all([
    githubFetch<GitHubCommit>(`/repos/${repository}/commits/main`, token),
    githubFetch<GitHubPull[]>(`/repos/${repository}/pulls?state=open&sort=updated&direction=desc&per_page=20`, token),
    githubFetch<GitHubPull[]>(`/repos/${repository}/pulls?state=closed&sort=updated&direction=desc&per_page=20`, token),
  ]);

  const mainChecks = await githubFetch<GitHubCheckRuns>(`/repos/${repository}/commits/${main.sha}/check-runs?per_page=100`, token);

  const normalizedPulls = await Promise.all(openPulls.map(async (listedPull) => {
    const [pull, checks] = await Promise.all([
      githubFetch<GitHubPull>(`/repos/${repository}/pulls/${listedPull.number}`, token),
      githubFetch<GitHubCheckRuns>(`/repos/${repository}/commits/${listedPull.head.sha}/check-runs?per_page=100`, token),
    ]);
    return {
      number: pull.number,
      title: pull.title,
      branch: pull.head.ref,
      url: pull.html_url,
      draft: pull.draft,
      mergeability: pull.mergeable === true ? "mergeable" : pull.mergeable === false ? "conflicting" : "unknown",
      ciStatus: normalizeCi(checks),
      updatedAt: pull.updated_at,
    } satisfies EngineeringPullRequest;
  }));

  const latestMerge = closedPulls.find((pull) => pull.merged_at !== null) ?? null;
  return {
    repository,
    main: {
      sha: main.sha,
      shortSha: main.sha.slice(0, 7),
      message: main.commit.message.split("\n")[0],
      url: main.html_url,
      committedAt: main.commit.committer?.date ?? new Date().toISOString(),
      ciStatus: normalizeCi(mainChecks),
    },
    latestMerge: latestMerge ? {
      number: latestMerge.number,
      title: latestMerge.title,
      url: latestMerge.html_url,
      mergedAt: latestMerge.merged_at ?? latestMerge.updated_at,
    } : null,
    openPullRequests: normalizedPulls,
    inferredArea: inferArea(normalizedPulls, latestMerge),
    refreshedAt: new Date().toISOString(),
    cacheSeconds: CACHE_SECONDS,
  };
}

export async function GET(request: Request) {
  const authorization = await authorizeAdminRequest(request);
  if (!authorization.ok) {
    return NextResponse.json({ error: authorization.status === 403 ? "Für diese Entwicklungsdaten fehlt die Admin-Berechtigung." : "Die Admin-Sitzung ist nicht mehr gültig. Bitte erneut anmelden." }, { status: authorization.status });
  }

  try {
    if (cache && cache.expiresAt > Date.now()) {
      return NextResponse.json(cache.value, { headers: { "Cache-Control": "private, max-age=15" } });
    }
    const value = await loadEngineering();
    cache = { value, expiresAt: Date.now() + CACHE_SECONDS * 1000 };
    return NextResponse.json(value, { headers: { "Cache-Control": "private, max-age=15" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "engineering_unavailable";
    console.error("Founder engineering integration failed", { code: message });
    if (message === "github_not_configured") {
      return NextResponse.json({ error: "GitHub-Verbindung fehlt. Das Entwicklungs-Dashboard kann derzeit keine Live-Daten laden." }, { status: 503 });
    }
    if (message === "github_api_403") {
      return NextResponse.json({ error: "GitHub konnte nicht gelesen werden. Bitte Berechtigung des Tokens prüfen." }, { status: 502 });
    }
    if (/^github_api_5\d\d$/.test(message)) {
      return NextResponse.json({ error: "GitHub ist momentan nicht erreichbar. Wir versuchen es beim nächsten Aktualisieren erneut." }, { status: 502 });
    }
    return NextResponse.json({ error: "Entwicklungsdaten konnten gerade nicht geladen werden." }, { status: 502 });
  }
}
