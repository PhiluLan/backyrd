#!/usr/bin/env node

const required = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
];

const present = Object.fromEntries(
  required.map((name) => [name, Boolean(process.env[name]?.trim())]),
);

process.stdout.write(`${JSON.stringify({ present })}\n`);
if (Object.values(present).some((value) => !value)) process.exitCode = 1;
