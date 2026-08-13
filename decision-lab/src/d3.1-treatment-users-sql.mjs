#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { buildPersonalizationTreatment, TREATMENT_ARMS } from "./personalization-treatment.mjs";

const worldPath = process.argv[2];
if (!worldPath) throw new Error("Usage: d3.1-treatment-users-sql.mjs <world.json>");
const world = JSON.parse(await readFile(worldPath, "utf8"));
const maturities = ["cold", "onboarding", "sparse", "developing", "mature", "power"];
const q = (value) => `'${String(value).replaceAll("'", "''")}'`;
const users = maturities.flatMap((maturity) => {
  const source = world.users.find((user) => user.maturity === maturity);
  if (!source) throw new Error(`World has no ${maturity} user`);
  const bundle = buildPersonalizationTreatment(world, { userId: source.id, currentRequest: { city: "Synthetic Basel", query: "D3.1 treatment fixture" }, currentContext: { contextId: world.contexts[0].id } });
  return TREATMENT_ARMS.map((arm) => bundle.enginePlans[arm].user);
});

process.stdout.write(`\\set ON_ERROR_STOP on
begin;
set local client_min_messages = warning;
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token) values
${users.map((user) => `('00000000-0000-0000-0000-000000000000',${q(user.id)}::uuid,'authenticated','authenticated',${q(`d31-${user.id}@synthetic.invalid`)},'','{"provider":"email","providers":["email"],"synthetic":true}'::jsonb,'{"synthetic":true,"treatment_arm":${JSON.stringify(user.treatmentArm)}}'::jsonb,'2026-08-11T12:00:00Z','2026-08-11T12:00:00Z','','','','')`).join(",\n")}
on conflict (id) do nothing;
commit;
`);
