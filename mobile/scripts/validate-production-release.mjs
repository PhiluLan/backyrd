import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const required = [
  "EXPO_PUBLIC_SUPABASE_URL",
  "EXPO_PUBLIC_SUPABASE_ANON_KEY",
  "EXPO_PUBLIC_GOOGLE_MAPS_KEY",
  "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID",
  "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID",
];

const failures = [];

for (const name of required) {
  if (!process.env[name]?.trim()) failures.push(`${name} is missing`);
}

if (process.env.APP_VARIANT !== "prod") {
  failures.push("APP_VARIANT must be prod");
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const eas = JSON.parse(fs.readFileSync(path.join(root, "eas.json"), "utf8"));
if (eas.build?.production?.channel !== "production") failures.push("EAS production channel mismatch");
if (packageJson.version !== "1.1.0") failures.push("Mobile release version mismatch");

const sourceRoots = ["app", "components", "hooks", "lib", "providers", "stores", "theme"];
const sourceFiles = [];
for (const relativeRoot of sourceRoots) walk(path.join(root, relativeRoot));

function walk(directory) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(fullPath);
    else if (/\.(ts|tsx|js|jsx)$/.test(entry.name) && !entry.name.includes("backup") && !entry.name.includes("before-")) sourceFiles.push(fullPath);
  }
}

const forbidden = [
  ["fake Match floor", /Math\.max\(\s*82/],
  ["client OpenAI key", /EXPO_PUBLIC_OPENAI_KEY/],
  ["client OpenAI SDK", /from\s+["']openai["']/],
  ["legacy Taste table", /user_taste_events_v2/],
  ["legacy Taste RPC", /backyrd_log_taste_event_v3/],
  ["runtime OTA reload", /Updates\.reloadAsync/],
  ["legacy Decision copy", /decision-copy/],
  ["legacy Decision session", /create_decision_session_v1/],
  ["legacy Decision retrieval", /backyrd_get_decision_spots_v9/],
  ["legacy Decision context", /get_decision_context_v1/],
  ["retired Decision debug route", /decision-debug/],
  ["direct achievement write", /from\(["']user_achievements["']\)\s*\.insert/],
  ["placeholder OAuth client", /<YOUR_[A-Z_]+>/],
];

for (const file of sourceFiles) {
  const relative = path.relative(root, file);
  const content = fs.readFileSync(file, "utf8");
  for (const [label, pattern] of forbidden) {
    if (pattern.test(content)) failures.push(`${label}: ${relative}`);
  }
}

const decision = fs.readFileSync(path.join(root, "app/(tabs)/decision.tsx"), "utf8");
for (const requiredDecisionContract of [
  "backyrd_record_visible_decision_impression_v1",
  'DecisionCardAction = "next" | "like" | "dislike"',
  'data.north_star?.active !== true',
]) {
  if (!decision.includes(requiredDecisionContract)) failures.push(`Decision contract missing: ${requiredDecisionContract}`);
}

if (failures.length) {
  console.error("Production release validation failed:\n" + failures.map((value) => `- ${value}`).join("\n"));
  process.exit(1);
}

console.log(`Production release validation passed (${sourceFiles.length} source files scanned).`);
