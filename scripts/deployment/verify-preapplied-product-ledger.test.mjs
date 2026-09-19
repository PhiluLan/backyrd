import test from "node:test";
import assert from "node:assert/strict";
import { verifyPreappliedProductLedger } from "./verify-preapplied-product-ledger.mjs";

const scope=()=>{
  const migrations=Array.from({length:13},(_,i)=>{
    const version=`202609190904${String(i+11)}`;
    return {path:`supabase/migrations/${version}_prior_${i}.sql`,productionStatementCount:i+1,productionStatementSha256:String(i).padStart(64,"0")};
  });
  const rows=migrations.map((migration)=>({version:migration.path.slice(20,34),name:migration.path.slice(35,-4),statement_count:migration.productionStatementCount,statement_sha256:migration.productionStatementSha256,total_count:152,ledger_tip:"20260919090423"}));
  const plan={productPreappliedImport:{migrations,remoteMigrationCount:152,remoteMigrationTip:"20260919090423"},pendingMigrations:[{path:"supabase/migrations/20260919120432_pending.sql"}]};
  return {plan,rows};
};

test("live ledger verifier accepts only the sealed 13 identities and pending scope",()=>{
  const {plan,rows}=scope();
  const result=verifyPreappliedProductLedger(plan,rows);
  assert.equal(result.status,"VERIFIED_READ_ONLY");
  assert.deepEqual(result.pendingPaths,["supabase/migrations/20260919120432_pending.sql"]);
});

test("live ledger verifier rejects changed statements, missing rows, changed tip and count",()=>{
  for (const mutate of [
    ({rows})=>{rows[0].statement_sha256="f".repeat(64);},
    ({rows})=>{rows.pop();},
    ({rows})=>{rows[12].ledger_tip="20260919120432";},
    ({rows})=>{rows[0].total_count=153;},
  ]) {
    const input=scope(); mutate(input);
    assert.throws(()=>verifyPreappliedProductLedger(input.plan,input.rows),/product_preapplied_remote_/);
  }
});
