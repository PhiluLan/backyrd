import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
const container=process.env.BACKYRD_ADMIN_CATEGORY_DB_CONTAINER;
test('real PostgreSQL preserves metrics and permissions, returns current categories across pages, rejects unsafe successors',{skip:!container},async()=>{
 assert.match(container,/^[a-zA-Z0-9_-]+$/);
 const db='admin_category_test_'+randomUUID().replaceAll('-','');
 const docker=(args,options={})=>execFileSync('docker',['exec',...(options.input?['-i']:[]),container,...args],{encoding:'utf8',...options});
 const baseline=await readFile(new URL('../../supabase/migrations/20260828192125_gate1_schema_convergence_v1.sql',import.meta.url),'utf8');
 const old=baseline.slice(baseline.indexOf('create or replace function public.admin_spots_intelligence_v1('),baseline.indexOf('create or replace function public.admin_spot_readiness_worklist_v1('));
 const migration=await readFile(new URL('../../supabase/migrations/20261028200651_admin_spots_primary_category_v1.sql',import.meta.url),'utf8');
 const fixture=await readFile(new URL('./fixtures/spot-category-filter-db.sql',import.meta.url),'utf8');
 const query="public.admin_spots_intelligence_v1('2026-10-01','2026-11-01',1000,0,null)";
 docker(['createdb','-U','postgres',db]);
 try{
 const sql=fixture+'\n'+old+`\nrevoke all on function public.admin_spots_intelligence_v1(timestamptz,timestamptz,integer,integer,text) from public,anon; grant execute on function public.admin_spots_intelligence_v1(timestamptz,timestamptz,integer,integer,text) to authenticated,service_role; create table baseline_result as select ${query} data;\n`+migration+`\n
 do $$declare data jsonb; cleaned jsonb; begin
 data:=${query};
 if data->>'categorySource'<>'WORLD_AUTHORING_CURRENT_V1' then raise exception 'missing metadata marker';end if;
 if jsonb_array_length(data->'spots')<>32 then raise exception 'catalogue truncated';end if;
 if (select count(*) from jsonb_array_elements(data->'spots') s where s->>'primary_category'='EAT')<>20 then raise exception 'wrong eat count';end if;
 if (select count(*) from jsonb_array_elements(data->'spots') s where s->>'primary_category'='STAY')<>6 then raise exception 'wrong stay count';end if;
 if (select count(*) from jsonb_array_elements(data->'spots') s where s->'primary_category'='null'::jsonb)<>6 then raise exception 'unsafe successor revived old category';end if;
 select jsonb_agg(s-'primary_category' order by s->>'spot_id') into cleaned from jsonb_array_elements(data->'spots') s;
 if cleaned is distinct from (select jsonb_agg(s order by s->>'spot_id') from baseline_result,jsonb_array_elements(baseline_result.data->'spots') s) then raise exception 'metrics changed';end if;
 if data->'summary' is distinct from (select baseline_result.data->'summary' from baseline_result) then raise exception 'summary changed';end if;
 if has_function_privilege('anon','public.admin_spots_intelligence_v1(timestamptz,timestamptz,integer,integer,text)','EXECUTE') then raise exception 'anonymous execute expanded';end if;
 if (select count(*) from jsonb_array_elements(public.admin_spots_intelligence_v1('2026-10-01','2026-11-01',5,27,null)->'spots') s where s ? 'primary_category')<>5 then raise exception 'later page missing categories';end if;
 end$$;
 set role authenticated;
 select ${query}->>'categorySource';
 select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
 do $$begin begin perform ${query};raise exception 'ordinary user was allowed';exception when insufficient_privilege then null;end;end$$;
 select set_config('request.jwt.claim.sub','',false);
 do $$begin begin perform ${query};raise exception 'missing identity was allowed';exception when insufficient_privilege then null;end;end$$;
 reset role;
 `;
 const restoreCheck="select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);\n"+old+`\n do $$begin if ${query} ? 'categorySource' then raise exception 'read function recovery failed';end if;end$$;\n`;
 const result=docker(['psql','-U','postgres','-d',db,'-X','-v','ON_ERROR_STOP=1','--single-transaction'],{input:sql+restoreCheck});
 assert.ok(result.includes('WORLD_AUTHORING_CURRENT_V1'));
 }finally{docker(['dropdb','-U','postgres',db]);}
});
