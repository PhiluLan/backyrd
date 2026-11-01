import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const container=process.env.BACKYRD_SEASONAL_TEST_CONTAINER;
if(!container?.startsWith('supabase_db_backyrd-'))throw Error('explicit_local_backyrd_test_container_required');
const migration=readFileSync(new URL('../../supabase/migrations/20261101162452_seasonal_event_editions_v1.sql',import.meta.url),'utf8');
const tests=readFileSync(new URL('../../supabase/tests/seasonal_event_editions_v1.sql',import.meta.url),'utf8').replace('begin;\n','');
execFileSync('docker',['exec','-i',container,'psql','-U','postgres','-d','postgres','-X','-v','ON_ERROR_STOP=1'],{input:`\\set ON_ERROR_STOP on\nbegin;\n${migration}\n${tests}`,stdio:['pipe','pipe','pipe']});
console.log('SEASONAL_MIGRATION_AND_AUTHORIZATION_PASS_ROLLED_BACK');
