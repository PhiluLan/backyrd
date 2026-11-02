import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
const compiled=ts.transpileModule(readFileSync(new URL('../app.config.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function config(variant){
 const module={exports:{}};
 new Function('require','module','exports','process',compiled)(name=>{assert.equal(name,'dotenv/config');return {};},module,module.exports,{env:{APP_VARIANT:variant}});
 return module.exports.default({config:{}});
}
const association=JSON.parse(readFileSync(new URL('../../web/public/.well-known/apple-app-site-association',import.meta.url),'utf8'));
test('Password AutoFill is limited to the existing signed production app and domain',()=>{
 const prod=config('prod');
 assert.equal(prod.ios.bundleIdentifier,'com.philipplanger.backyrd');
 assert.deepEqual(prod.ios.associatedDomains,['applinks:www.backyrd.ch','webcredentials:www.backyrd.ch']);
 assert.deepEqual(association.webcredentials.apps,['7B3B8TL6J9.com.philipplanger.backyrd']);
 assert.deepEqual(association.applinks.details,[{appID:'7B3B8TL6J9.com.philipplanger.backyrd',paths:['/auth/verify']}]);
});
test('development builds cannot claim production credentials',()=>{
 const dev=config('dev');assert.equal(dev.ios.bundleIdentifier,'com.philipplanger.backyrd.dev');assert.deepEqual(dev.ios.associatedDomains,[]);
 assert.ok(!association.webcredentials.apps.some(value=>value.endsWith('.dev')));
});
