import { spawnSync } from "node:child_process";
import process from "node:process";

if (process.env.EAS_BUILD_PROFILE !== "production") {
  console.log("Skipping Production-only Mobile release guard.");
  process.exit(0);
}

for (const script of ["typecheck", "lint", "test:contracts", "release:validate"]) {
  const result = spawnSync("npm", ["run", script], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log("EAS Production Mobile release guard passed.");
