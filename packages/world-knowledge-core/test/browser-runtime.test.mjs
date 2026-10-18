import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import * as browser from '@backyrd/world-knowledge-core/browser';
import * as server from '../dist/index.js';
import * as browserHash from '../dist/canonical.browser.js';

const root = fileURLToPath(new URL('..', import.meta.url));

test('browser entry exposes the same canonical UI contracts without server entrypoints', () => {
  for (const key of ['REGISTRY_HASH','AUTHORING_CATALOG_HASH','AUTHORING_FIELDS','AUTHORING_STEPS','SPOT_TYPE_CATALOG','OFFER_CATALOG','AREA_CATALOG','validateAuthoringSubmission','parseExperienceProfile']) {
    assert.deepEqual(browser[key], server[key], key);
  }
  for (const key of ['createFounderWorldCohortHandoff','createFounderWorldKnowledgeReader','createWorldResearchBatch','createDiscoveryPreparationHttpHandler','PHILIPPS_CASA_CLAIMS']) {
    assert.equal(Object.hasOwn(browser,key),false,key);
  }
  assert.equal(browser.validateAuthoringSubmission('experience.profile','KNOWN_VALUE',{...browser.emptyExperienceProfile('RESTAURANT'),reviewed:true}).ok,true);
  assert.equal(browser.validateAuthoringSubmission('experience.profile','KNOWN_VALUE',{category:'made-up'}).ok,false);
});

test('browser mapping has no node imports or server HTTP/fixture modules in its dependency graph', () => {
  const manifest=JSON.parse(readFileSync(resolve(root,'package.json'),'utf8'));
  assert.equal(manifest.browser['./dist/canonical.js'],'./dist/canonical.browser.js');
  const visited=new Set();
  function visit(file) {
    if(visited.has(file))return;
    visited.add(file);
    for(const dependency of ts.preProcessFile(readFileSync(file,'utf8'),true,true).importedFiles){
      const specifier=dependency.fileName;
      assert.ok(!specifier.startsWith('node:'),`${file}: ${specifier}`);
      if(!specifier.startsWith('.')){assert.equal(specifier,'crypto');continue;}
      let target=resolve(dirname(file),specifier);
      if(target===resolve(root,'dist/canonical.js'))target=resolve(root,'dist/canonical.browser.js');
      visit(target);
    }
  }
  visit(resolve(root,'dist/browser-runtime.js'));
  assert.ok(visited.has(resolve(root,'dist/canonical.browser.js')));
  for(const name of ['canonical.js','index.js','founder-handoff.js','fixtures.js','discovery-http.js','discovery-preparation.js','research-batch.js']) {
    assert.ok(!visited.has(resolve(root,'dist',name)),name);
  }
});

test('browser and server hashing preserve canonical Unicode, key order and existing hashes', () => {
  const cases=[null,'', 'Grüezi 👋', 'e\u0301', {z:-0,a:['ü',true,null,{b:2,a:1}]}, {message:'x'.repeat(10000)}];
  for(const value of cases){
    assert.equal(browserHash.canonicalJson(value),server.canonicalJson(value));
    assert.equal(browserHash.sha256(value),server.sha256(value));
  }
  assert.equal(browserHash.hashBody({a:1,signature:'ignored'},['signature']),server.hashBody({a:1,signature:'ignored'},['signature']));
  for(const value of [undefined,NaN,Infinity,new Date(),{invalid:undefined}]){
    assert.throws(()=>browserHash.sha256(value));
    assert.throws(()=>server.sha256(value));
  }
});
