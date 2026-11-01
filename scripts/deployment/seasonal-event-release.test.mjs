import test from 'node:test';import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';import {readFileSync} from 'node:fs';
import {SEASONAL_EVENT_MIGRATION as migration,scopeSeasonalEventMigrations,DEFERRED_BOOKING_MIGRATIONS as deferred} from './isolated-research-migration.mjs';
const base='a'.repeat(40);
const input=()=>({pending:[...deferred,migration],baseSha:base,deployFunctions:['decision-v13','decision-admin-diagnostic'],authDeploy:false,appliedSeasonalEvent:null,scope:{contractVersion:'backyrd.seasonal-event-delivery-scope@1.0',executionAuthorized:false,baseSha:base,migrations:[migration],deferredMigrations:deferred,functions:['decision-v13','decision-admin-diagnostic'],backupRunId:1}});
test('seasonal release binds one exact SQL and keeps four Booking migrations deferred',()=>{
 const p=scopeSeasonalEventMigrations(input());assert.deepEqual(p.pendingMigrations,[migration]);assert.deepEqual(p.deferredMigrations,deferred);
 assert.equal(createHash('sha256').update(readFileSync(new URL('../../'+migration.path,import.meta.url))).digest('hex'),migration.sha256);
});
test('seasonal release rejects changed SQL, Auth, other functions, missing backup and broadened authority',()=>{
 for(const edit of [p=>p.scope.migrations=[{...migration,sha256:'b'.repeat(64)}],p=>p.authDeploy=true,p=>p.deployFunctions.push('other'),p=>p.scope.backupRunId=0,p=>p.scope.executionAuthorized=true,p=>p.scope.deferredMigrations=[]]){
  const p=input();edit(p);assert.throws(()=>scopeSeasonalEventMigrations(p),/seasonal_event_scope_invalid/);
 }
 const p=input();p.pending.push({path:'extra.sql',sha256:'b'.repeat(64)});assert.throws(()=>scopeSeasonalEventMigrations(p),/seasonal_event_pending_scope_changed/);
});
