import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import test from "node:test";
const records = new Map();
const reports = [];
let storageUnavailable = false;
const storage = {setItem: async (key,value) => { if(storageUnavailable) throw Error("offline"); records.set(key,value); },getItem:async key=>records.get(key)??null};
const source=fs.readFileSync(new URL("../lib/decision/productDecisionDiagnostics.ts",import.meta.url),"utf8");
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
const m={exports:{}};
new Function("exports","require",compiled)(m.exports,name=>{
 if(name==="@react-native-async-storage/async-storage")return {__esModule:true,default:storage};
 if(name==="expo-updates")return {updateId:"12345678-1234-4234-8234-123456789012"};
 if(name==="../analytics")return {reportAnalyticsError:async report=>{reports.push(report);}};
 throw Error("unexpected import "+name);
});
const {classifyDecisionFailure,recordDecisionFailure,readLastDecisionFailure}=m.exports;
test("wrapped native transport errors retain status without response bodies or credentials",()=>{
 const http={name:"FunctionsHttpError",message:"private-query-and-token",context:{status:401,body:"private"}};
 const outer={name:"DecisionProductUnavailableError",code:"decision_single_route_unavailable",cause:http};
 assert.deepEqual(classifyDecisionFailure(outer,"LOAD"),{phase:"LOAD",code:"decision_transport_http_failure",errorName:"FunctionsHttpError",httpStatus:401});
 assert.equal(classifyDecisionFailure({...outer,cause:{name:"FunctionsFetchError",message:"secret URL"}},"LOAD").code,"decision_transport_network_failure");
 assert.equal(classifyDecisionFailure({...outer,code:"private query",cause:null},"LOAD").code,"decision_unexpected_client_error");
});
test("display validation and unexpected native errors stay distinguishable",()=>{
 assert.equal(classifyDecisionFailure(new Error("wohin_primary_binding_invalid"),"DISPLAY").code,"wohin_primary_binding_invalid");
 assert.equal(classifyDecisionFailure(new TypeError("private query"),"DISPLAY").errorName,"TypeError");
 const cycle={name:"Error"};cycle.cause=cycle;
 assert.equal(classifyDecisionFailure(cycle,"REQUEST").code,"decision_unexpected_client_error");
});
test("last failure and existing analytics carry only bounded technical fields",async()=>{
 const error={name:"DecisionProductUnavailableError",code:"decision_request_transport_timeout",cause:new Error("private search and token")};
 await recordDecisionFailure(error,"LOAD");
 const last=await readLastDecisionFailure();
 assert.equal(last.code,"decision_request_transport_timeout");
 assert.equal(last.updateId,"12345678-1234-4234-8234-123456789012");
 assert.equal(reports.at(-1).error.message,"decision_request_transport_timeout");
 assert.equal(JSON.stringify([...records]).includes("private"),false);
 assert.equal(JSON.stringify(reports).includes("private"),false);
 const key=[...records.keys()][0];
 records.set(key,JSON.stringify({...last,occurredAt:"2020-01-01T00:00:00.000Z"}));
 assert.equal(await readLastDecisionFailure(),null);
 records.set(key,"invalid json");assert.equal(await readLastDecisionFailure(),null);
 storageUnavailable=true;
 await assert.doesNotReject(recordDecisionFailure(error,"LOAD"));
});
