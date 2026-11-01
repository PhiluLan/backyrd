#!/usr/bin/env node
// A restore drill is never a Production cutover. All restored data is disposable.
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const sha=body=>createHash('sha256').update(body).digest('hex');
const identifier=value=>'"'+value.replaceAll('"','""')+'"';
const unquote=value=>value.startsWith('"')?value.slice(1,-1).replaceAll('""','"'):value;
const atom='(?:"(?:[^"]|"")+"|[a-z_][a-z0-9_]*)';
const header=new RegExp(`^COPY (${atom})\\.(${atom}) \\((.+)\\) FROM stdin;$`);
export function copySections(sql) {
 const sections=[];let active=null;
 for(const line of sql.split('\n')) {
  if(active){if(line==='\\.'){sections.push({...active,digest:sha(active.rows.sort().join('\n')),count:active.rows.length});active=null;}else active.rows.push(line);continue;}
  const match=header.exec(line);if(!match)continue;
  const columns=match[3].split(/,\s*/).map(unquote);
  if(!columns.every(c=>new RegExp(`^${atom}$`).test(identifier(c))))throw Error('copy_columns_invalid');
  active={schema:unquote(match[1]),table:unquote(match[2]),columns,rows:[]};
 }
 if(active||!sections.length)throw Error('backup_copy_sections_incomplete');
 return sections;
}
export function requireManagedColumns(sections,columns) {
 const available=new Set(columns.map(c=>c.table_schema+'.'+c.table_name+'.'+c.column_name));
 for(const section of sections.filter(s=>['auth','storage'].includes(s.schema)))for(const column of section.columns){
  const key=section.schema+'.'+section.table+'.'+column;
  if(!available.has(key))throw Error('restore_platform_schema_missing:'+key);
 }
}
export function normalizedSchema(sql) {
 return sql.split('\n').filter(line=>!line.startsWith('--')&&!/^\\(?:un)?restrict\b/.test(line)&&line.trim()!=='').join('\n');
}
// pg_dump may wrap a CHECK across lines. Read the complete balanced expression
// rather than treating its first line as executable SQL.
function checkExpression(lines,start,first) {
 const input=[first,...lines.slice(start+1)].join('\n');
 if(!input.startsWith('('))return null;
 let depth=0,quote=null,dollar=null,block=false,lineComment=false;
 for(let i=0;i<input.length;i++){
  const c=input[i],next=input[i+1];
  if(lineComment){if(c==='\n')lineComment=false;continue;}
  if(block){if(c==='*'&&next==='/'){block=false;i++;}continue;}
  if(dollar){if(input.startsWith(dollar,i)){i+=dollar.length-1;dollar=null;}continue;}
  if(quote){if(c==='\\'&&quote==="'"){i++;continue;}if(c===quote){if(next===quote)i++;else quote=null;}continue;}
  if(c==='-'&&next==='-'){lineComment=true;i++;continue;}
  if(c==='/'&&next==='*'){block=true;i++;continue;}
  if(c==="'"||c==='"'){quote=c;continue;}
  if(c==='$'){const match=/^\$(?:[a-zA-Z_][a-zA-Z0-9_]*)?\$/.exec(input.slice(i));if(match){dollar=match[0];i+=dollar.length-1;continue;}}
  if(c==='(')depth++;
  if(c===')'&&--depth===0){
   const expression=input.slice(0,i+1),suffix=input.slice(i+1).split('\n')[0];
   if(!/^(?: NOT VALID)?[,]?$/.test(suffix))return null;
   return {expression,suffix,lines:expression.split('\n').length};
  }
 }
 return null;
}
export function compareSchema(source,target,compareCheck) {
 const a=normalizedSchema(source).split('\n'),b=normalizedSchema(target).split('\n');
 const tableHeader=new RegExp(`^CREATE TABLE IF NOT EXISTS (${atom})\\.(${atom}) \\($`);
 const checkLine=new RegExp(`^CONSTRAINT (${atom}) CHECK (.+)$`);
 let table=null,normalizedChecks=0,i=0,j=0;
 while(i<a.length&&j<b.length){
  const header=tableHeader.exec(a[i]);if(header)table={schema:unquote(header[1]),name:unquote(header[2])};
  if(a[i]===');')table=null;
  const left=table&&checkLine.exec(a[i].trim()),right=table&&checkLine.exec(b[j].trim());
  if(left&&right&&left[1]===right[1]){
   const l=checkExpression(a,i,left[2]),r=checkExpression(b,j,right[2]);
   if(!l||!r||l.suffix!==r.suffix)return {matches:false,normalizedChecks};
   if(l.expression!==r.expression){
    if(!compareCheck({...table,constraint:unquote(left[1]),expression:l.expression}))return {matches:false,normalizedChecks};
    normalizedChecks++;
   }
   i+=l.lines;j+=r.lines;continue;
  }
  if(a[i]!==b[j])return {matches:false,normalizedChecks};
  i++;j++;
 }
 return {matches:i===a.length&&j===b.length,normalizedChecks};
}
export function safeCommandFailure(command,status,stderr,input) {
 const errorLine=stderr.split('\n').find(line=>/ERROR:\s+[0-9A-Z]{5}:/.test(line))??'';
 const state=/ERROR:\s+([0-9A-Z]{5}):/.exec(errorLine)?.[1];
 const line=/psql:<stdin>:(\d+):/.exec(errorLine)?.[1];
 const identifiers=[...errorLine.matchAll(/(?:column|relation|schema|role|type) "([a-z_][a-z0-9_]{0,62})"/g)].slice(0,4).map(m=>m[1]);
 const before=line?input.split('\n').slice(0,Number(line)).join('\n'):'';
 const parts=[...before.matchAll(/^-- backyrd-restore-part:(roles|schema|migration-schema|data|migration-data|managed-controls)\.sql$/gm)];
 const part=parts.at(-1)?.[1];
 return 'restore_command_failed:'+command+':'+status+(state?':sqlstate='+state:'')+(line?':line='+line:'')+(part?':part='+part:'')+(identifiers.length?':identifiers='+identifiers.join(','):'');
}
function run(command,args,{input,env,timeout=120000}={}) {
 try{return execFileSync(command,args,{input,encoding:'utf8',env:{...process.env,...env},timeout,maxBuffer:256*1024*1024,stdio:['pipe','pipe','pipe']});}
 catch(error){
  if(process.env.BACKYRD_RESTORE_DIAGNOSTIC_FILE)writeFileSync(process.env.BACKYRD_RESTORE_DIAGNOSTIC_FILE,error.stderr??'',{mode:0o600});
  throw Error(safeCommandFailure(command,error.status??error.code??'unknown',String(error.stderr??''),String(input??'')));
 }
}
function verifyManifest(directory,name) {
 const lines=readFileSync(join(directory,name),'utf8').trim().split('\n');
 for(const line of lines){const m=/^([a-f0-9]{64})  (.+)$/.exec(line);if(!m||m[2].startsWith('/')||m[2].split('/').includes('..')||m[2].includes('\\'))throw Error('backup_manifest_invalid');
  if(sha(readFileSync(join(directory,m[2])))!==m[1])throw Error('backup_checksum_mismatch');}
 return lines.length;
}
export function buildRestoreSql(part) {
 const section=name=>'\n-- backyrd-restore-part:'+name+'\n'+part(name);
 return `begin;set local session_replication_role=replica;${section('roles.sql')}\nset local role postgres;\nalter default privileges for role postgres in schema public revoke all on functions from anon,authenticated,service_role;\nalter default privileges for role postgres in schema public revoke all on tables from anon,authenticated,service_role;\nalter default privileges for role postgres in schema public revoke all on sequences from anon,authenticated,service_role;\n${section('schema.sql')}\n${section('migration-schema.sql')}\nreset role;\n${section('data.sql')}\n${section('migration-data.sql')}\nset local session_replication_role=replica;\n${section('managed-controls.sql')}\nreset role;\ncommit;`;
}
async function isolatedTarget(cli,phase,operation) {
 const workdir=mkdtempSync(join(tmpdir(),'backyrd-isolated-restore-'));
 const project='backyrd-restore-'+randomUUID().slice(0,12),network=project+'-isolated';let networkCreated=false,started=false;
 const sql=body=>run('docker',['exec','-i','supabase_db_'+project,'psql','-U','supabase_admin','-d','postgres','-X','-q','-t','-A','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-f','-'],{input:body});
 try {
  run(cli,['init','--workdir',workdir,'--yes','--agent=no']);
  const configPath=join(workdir,'supabase/config.toml');let config=readFileSync(configPath,'utf8');
  config=config.replace(/^project_id = .*$/m,'project_id = "'+project+'"').replace(/5432([0-9])/g,(_,n)=>'6202'+n).replace(/(\[db.seed\][\s\S]*?)enabled = true/, '$1enabled = false');writeFileSync(configPath,config,{mode:0o600});
  run('docker',['network','create','--internal',network]);networkCreated=true;started=true;
  // Only an empty project may bootstrap with a normal network. Fence every
  // service before reading backup SQL or transferring any original media.
  run(cli,['start','--workdir',workdir,'--exclude','studio,imgproxy,mailpit,edge-runtime,logflare,vector,supavisor,postgres-meta,realtime','--agent=no'],{timeout:600000});
  const status={};for(const line of run(cli,['status','--workdir',workdir,'-o','env','--agent=no']).split('\n')){const m=/^([A-Z_]+)=(".*")$/.exec(line);if(m)status[m[1]]=JSON.parse(m[2]);}
  assert.ok(['127.0.0.1','localhost'].includes(new URL(status.API_URL).hostname));assert.ok(status.SERVICE_ROLE_KEY?.length>20);
  let dumpScript=run(cli,['db','dump','--local','--workdir',workdir,'--dry-run','--agent=no']);
  dumpScript=dumpScript.replace(/^(?:export )?PG(?:HOST|PORT|USER|DATABASE|PASSWORD)=.*$/gm,'');
  dumpScript='export PGHOST=/var/run/postgresql PGPORT=5432 PGUSER=supabase_admin PGDATABASE=postgres\nunset PGPASSWORD\n'+dumpScript;
  const containers=run('docker',['ps','--format','{{.Names}}']).trim().split('\n').filter(name=>name.endsWith('_'+project));
  for(const container of containers){
   const networks=JSON.parse(run('docker',['inspect',container,'--format','{{json .NetworkSettings.Networks}}']));
   const aliases=[...new Set(Object.values(networks).flatMap(info=>info.Aliases??[]))];
   run('docker',['network','connect',...aliases.flatMap(alias=>['--alias',alias]),network,container]);
   for(const previous of Object.keys(networks))run('docker',['network','disconnect',previous,container]);
   assert.deepEqual(Object.keys(JSON.parse(run('docker',['inspect',container,'--format','{{json .NetworkSettings.Networks}}']))),[network]);
  }
  assert.equal(run('docker',['network','inspect',network,'--format','{{.Internal}}']).trim(),'true');
  assert.ok(containers.includes('supabase_db_'+project)&&containers.includes('supabase_storage_'+project));
  for(const container of containers.filter(name=>name!=='supabase_db_'+project))run('docker',['restart',container],{timeout:120000});
  assert.equal(sql("select (select count(*) from auth.users)+(select count(*) from storage.objects)+(select count(*) from storage.buckets);").trim(),'0');
  sql("alter system set cron.launch_active_jobs=off;select pg_reload_conf();");
  const storage=async(path,options={})=>{
   const request={path,method:options.method??'GET',headers:{authorization:'Bearer '+status.SERVICE_ROLE_KEY,apikey:status.SERVICE_ROLE_KEY,...options.headers},body:options.body===undefined?null:Buffer.from(options.body).toString('base64')};
   const code=`let input='';process.stdin.on('data',b=>input+=b);process.stdin.on('end',async()=>{try{const r=JSON.parse(input);const response=await fetch('http://127.0.0.1:5000'+r.path,{method:r.method,headers:r.headers,...(r.body===null?{}:{body:Buffer.from(r.body,'base64')}),signal:AbortSignal.timeout(30000)});const b=Buffer.from(await response.arrayBuffer());process.stdout.write(JSON.stringify({status:response.status,body:b.toString('base64')}));}catch{process.exitCode=1;}});`;
   const response=JSON.parse(run('docker',['exec','-i','supabase_storage_'+project,'node','-e',code],{input:JSON.stringify(request)}));
   if(response.status<200||response.status>=300){if(process.env.BACKYRD_RESTORE_DIAGNOSTIC_FILE)writeFileSync(process.env.BACKYRD_RESTORE_DIAGNOSTIC_FILE+'.storage.json',Buffer.from(response.body,'base64'),{mode:0o600});throw Error('local_storage_restore_failed:'+request.method+':'+path.split('/')[1]+':'+response.status);}
   return Buffer.from(response.body,'base64');
  };
  // Wait for the restarted Storage process and its new local DB connection.
  let ready=false;for(let attempt=0;attempt<30;attempt++){try{await storage('/bucket');ready=true;break;}catch{await new Promise(resolve=>setTimeout(resolve,500));}}
  if(!ready)throw Error('isolated_storage_not_ready');
  console.log('Restore phase: '+phase+' target isolated and empty.');
  return await operation({sql,storage,dumpSchema:()=>run('docker',['exec','-i','supabase_db_'+project,'bash'],{input:dumpScript,timeout:120000})});
 } finally {
  let failed=false;if(started)try{run(cli,['stop','--workdir',workdir,'--no-backup','--agent=no'],{timeout:120000});}catch{failed=true;}
  if(networkCreated)try{run('docker',['network','rm',network]);}catch{failed=true;}
  rmSync(workdir,{recursive:true,force:true});if(failed)throw Error('disposable_restore_cleanup_failed');
 }
}
async function restore(snapshot,reportPath) {
 const metadata=JSON.parse(readFileSync(join(snapshot,'metadata.json'),'utf8'));
 if(metadata.version!=='backyrd-production-backup-v2'||metadata.databaseIncluded!==true)throw Error('complete_v2_backup_required');
 const database=join(snapshot,'database');verifyManifest(database,'files-sha256.txt');verifyManifest(snapshot,'database-sha256.txt');const mediaCount=verifyManifest(snapshot,'storage-sha256.txt');assert.equal(mediaCount,metadata.storageFiles);
 const scope=JSON.parse(readFileSync(join(database,'scope.json'),'utf8'));assert.equal(scope.version,'backyrd-database-snapshot-v2');assert.equal(scope.scope,'all-non-platform-application-schemas');
 const cli=process.env.BACKYRD_RESTORE_SUPABASE_CLI||'supabase';assert.equal(run(cli,['--version']).trim(),'2.122.0');
 const part=name=>readFileSync(join(database,name),'utf8');
 const evidence=await isolatedTarget(cli,'database',async({sql,dumpSchema})=>{
  const platformColumns=JSON.parse(sql("select coalesce(json_agg(t),'[]') from (select table_schema,table_name,column_name from information_schema.columns where table_schema in ('auth','storage'))t;"));
  requireManagedColumns(copySections(part('data.sql')),platformColumns);
  sql(buildRestoreSql(part));console.log('Restore phase: database loaded; comparing schema and tables.');
  const restoredSchema=dumpSchema();
  const comparison=compareSchema(part('schema.sql'),restoredSchema,check=>{
   // Compare parsed CHECK expressions on the same engine. Only redundant AND
   // nesting may differ; never ignore ACL, function or default changes.
   const temporary='restore_check_'+randomUUID().replaceAll('-',''),relation=identifier(check.schema)+'.'+identifier(check.name);
   return sql(`begin;set local search_path=pg_catalog,public,extensions;alter table ${relation} add constraint ${identifier(temporary)} check ${check.expression} not valid;select pg_get_expr(expected.conbin,expected.conrelid,false)=pg_get_expr(actual.conbin,actual.conrelid,false) from pg_constraint expected join pg_constraint actual on actual.conrelid=expected.conrelid where expected.conname='${temporary}' and actual.conname='${check.constraint.replaceAll("'","''")}' and expected.conrelid='${relation.replaceAll("'","''")}'::regclass;rollback;`).trim()==='t';
  });
  if(!comparison.matches){if(process.env.BACKYRD_RESTORE_DIAGNOSTIC_FILE)writeFileSync(process.env.BACKYRD_RESTORE_DIAGNOSTIC_FILE+'.schema.sql',restoredSchema,{mode:0o600});throw Error('restored_schema_or_acl_mismatch');}
  const sections=[...copySections(part('data.sql')),...copySections(part('migration-data.sql'))];let rowCount=0,checked=0;
  for(const section of sections){const body=sql(`COPY ${identifier(section.schema)}.${identifier(section.table)} (${section.columns.map(identifier).join(',')}) TO STDOUT;`);const rows=body.endsWith('\n')?body.slice(0,-1).split('\n'):body?body.split('\n'):[];
   if(rows.length!==section.count||sha(rows.sort().join('\n'))!==section.digest)throw Error('restored_table_mismatch');rowCount+=rows.length;checked++;if(checked%100===0)console.log('Restore phase: '+checked+' tables verified.');}
  let sequenceCount=0;
  for(const m of part('data.sql').matchAll(/^SELECT pg_catalog\.setval\('((?:[^']|'')+)', ([0-9]+), (true|false)\);$/gm)){
   const relation=new RegExp(`^(${atom})\\.(${atom})$`).exec(m[1].replaceAll("''","'"));if(!relation)throw Error('sequence_identifier_invalid');
   const result=sql(`select last_value::text||','||is_called::text from ${identifier(unquote(relation[1]))}.${identifier(unquote(relation[2]))};`).trim();if(result!==m[2]+','+m[3])throw Error('restored_sequence_mismatch');sequenceCount++;
  }
  sql(`begin;do $$ declare r record;begin for r in select c.conname,c.conrelid::regclass relation,pg_get_constraintdef(c.oid) definition from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace where c.contype='f' and c.convalidated and (n.nspname in ('auth','storage') or n.nspname not in ('information_schema','extensions','cron','net','realtime','vault','supabase_functions','supabase_migrations') and n.nspname !~ '^pg_' and n.nspname !~ '^_') loop execute format('alter table %s drop constraint %I',r.relation,r.conname);execute format('alter table %s add constraint %I %s not valid',r.relation,r.conname,r.definition);execute format('alter table %s validate constraint %I',r.relation,r.conname);end loop;end $$;rollback;`);
  const buckets=JSON.parse(sql("select coalesce(json_agg(json_build_object('id',id,'name',name,'public',public,'file_size_limit',file_size_limit,'allowed_mime_types',allowed_mime_types) order by id),'[]') from storage.buckets;"));
  const contentTypes=JSON.parse(sql("select coalesce(json_object_agg(bucket_id||'/'||name,metadata->>'mimetype'),'{}') from storage.objects;"));
  console.log('Restore phase: database rows, schema, ACL, sequences and foreign keys verified.');
  return {tableCount:sections.length,rowCount,sequenceCount,normalizedChecks:comparison.normalizedChecks,buckets,contentTypes};
 });
 const restoredFiles=await isolatedTarget(cli,'independent media',async({storage})=>{
  // Follow the runbook: media API replay uses an independent empty target, so
  // new transport metadata cannot overwrite the database evidence just checked.
  for(const bucket of evidence.buckets){assert.equal(bucket.id,bucket.name);await storage('/bucket',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:bucket.id,name:bucket.name,public:false,file_size_limit:1073741824,allowed_mime_types:null})});}
  let count=0;
  for(const line of readFileSync(join(snapshot,'storage-sha256.txt'),'utf8').trim().split('\n')){
   const m=/^([a-f0-9]{64})  storage\/([^/]+)\/(.+)$/.exec(line);if(!m)throw Error('media_manifest_invalid');
   const url='/object/'+encodeURIComponent(m[2])+'/'+m[3].split('/').map(encodeURIComponent).join('/');
   await storage(url,{method:'POST',headers:{'Content-Type':evidence.contentTypes[m[2]+'/'+m[3]]||'application/octet-stream'},body:readFileSync(join(snapshot,'storage',m[2],m[3]))});
   if(sha(await storage(url))!==m[1])throw Error('restored_media_digest_mismatch');count++;
  }
  for(const bucket of evidence.buckets)await storage('/bucket/'+encodeURIComponent(bucket.id),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:bucket.id,name:bucket.name,public:bucket.public,file_size_limit:bucket.file_size_limit,allowed_mime_types:bucket.allowed_mime_types})});
  const buckets=JSON.parse((await storage('/bucket')).toString()).map(b=>Object.fromEntries(['id','name','public','file_size_limit','allowed_mime_types'].map(k=>[k,b[k]]))).sort((a,b)=>a.id.localeCompare(b.id,'en'));
  const expected=[...evidence.buckets].sort((a,b)=>a.id.localeCompare(b.id,'en'));assert.deepEqual(buckets,expected);assert.equal(count,mediaCount);return count;
 });
 writeFileSync(reportPath,JSON.stringify({version:'backyrd-backup-restore-drill-v1',status:'PASS',sourceType:process.env.BACKYRD_RESTORE_ARCHIVE_SHA256?'VERIFIED_AWS_ARCHIVE':'SYNTHETIC_LOCAL',sourceMainSha:metadata.canonicalMainSha,sourceCreatedAt:metadata.createdAt,sourceArchiveSha256:process.env.BACKYRD_RESTORE_ARCHIVE_SHA256||null,tableCount:evidence.tableCount,rowCount:evidence.rowCount,sequenceCount:evidence.sequenceCount,storageFiles:restoredFiles,schemaAndAclMatch:true,postgresNormalizedChecks:evidence.normalizedChecks,allCopiedRowsMatch:true,foreignKeysValidated:true,sequencesMatch:true,allMediaBytesMatch:true,bucketControlsRestored:true,outboundNetworkDisabled:true,independentDatabaseAndMediaTargets:true,disposableTargetsRemoved:true,productionWrites:0,productionCutoverTested:false},null,2)+'\n',{mode:0o600});
 console.log('Isolated restore: PASS; database and '+restoredFiles+' media files verified in independent targets.');
}

if(process.argv[1]===fileURLToPath(import.meta.url)) {
 const [snapshot,report]=process.argv.slice(2);if(!snapshot||!report)throw Error('private_snapshot_directory_and_report_required');
 restore(resolve(snapshot),resolve(report)).catch(error=>{console.error(error.message);process.exitCode=1;});
}
