import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source = await readFile(new URL('../../packages/shared/src/presentation/event.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { upcomingSpotEvents, eventSourceLabel } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const now = new Date('2026-10-18T10:00:00Z');
const row = { event_id:'e1', occurrence_id:'o1', start_at:'2026-10-19T18:00:00Z', end_at:'2026-10-19T22:00:00Z', event_status:'PUBLISHED', occurrence_status:'SCHEDULED' };
test('one nearest valid occurrence per series, in chronological order',()=>{
 const rows = [{...row, occurrence_id:'o2',start_at:'2026-10-26T18:00:00Z',end_at:'2026-10-26T22:00:00Z'},row,{...row,event_id:'e2',occurrence_id:'o3',start_at:'2026-10-18T20:00:00Z',end_at:'2026-10-18T23:00:00Z'}];
 assert.deepEqual(upcomingSpotEvents(rows,now).map(r=>r.occurrence_id),['o3','o1']);
 assert.equal(rows.length,3);
});
test('draft, cancelled, postponed, ended, and past events never become active cards',()=>{
 const excluded = [{...row,event_status:'DRAFT'},{...row,event_status:'CANCELLED'},{...row,occurrence_status:'POSTPONED'},{...row,occurrence_status:'ENDED'},{...row,end_at:'2026-10-17T22:00:00Z'},{...row,start_at:'2026-10-17T18:00:00Z',end_at:null}];
 assert.deepEqual(upcomingSpotEvents(excluded,now),[]);
});
test('ongoing event and future event without end remain discoverable',()=>{
 assert.equal(upcomingSpotEvents([{...row,start_at:'2026-10-18T08:00:00Z',end_at:'2026-10-18T12:00:00Z'}],now).length,1);
 assert.equal(upcomingSpotEvents([{...row,end_at:null}],now).length,1);
});
test('Owner and Admin source labels stay human-readable',()=>{
 assert.equal(eventSourceLabel('manual_owner'),'Angaben vom Veranstalter');
 assert.equal(eventSourceLabel('manual_admin'),'Angaben vom Veranstalter');
});
