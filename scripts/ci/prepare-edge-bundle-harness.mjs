#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const index = process.argv.indexOf("--output");
if (index < 0 || !process.argv[index + 1]) throw new Error("edge_harness_output_required");
const root = resolve(process.argv[index + 1]);
mkdirSync(resolve(root, "supabase/migrations"), { recursive: true });
writeFileSync(resolve(root, "supabase/config.toml"), 'project_id = "backyrd"\n');
process.stdout.write("edge_bundle_harness_ready_without_migrations\n");
