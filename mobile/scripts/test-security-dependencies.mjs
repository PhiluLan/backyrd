import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,symlink,lstat,readlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import test from 'node:test';
const require=createRequire(import.meta.url);

test('navigation query decoder preserves valid UTF-8 and bounds malformed-input work',()=>{
 const query=require('query-string');
 assert.equal(query.parse('name=Gem%C3%BCtlich&city=Basel').name,'Gemütlich');
 assert.deepEqual([...query.parse('tag=warm&tag=ruhig').tag],['warm','ruhig']);
 const child=spawnSync(process.execPath,['-e',`const q=require('query-string');let p='';for(let i=0;i<32000;i++)p+='%'+Math.floor(i/256).toString(16).padStart(2,'0')+'%'+(i%256).toString(16).padStart(2,'0')+'x';q.parse('q='+p+'%zz');console.log('completed');`],{cwd:new URL('..',import.meta.url),timeout:3000,encoding:'utf8'});
 assert.equal(child.status,0,child.error?.message||child.stderr);
 assert.match(child.stdout,/completed/);
});

test('Metro reads images from buffers and disk, and rejects a zero-length ICNS entry promptly',async()=>{
 const metroRequire=createRequire(require.resolve('metro/package.json'));
 const {getAssetSize}=metroRequire('./src/Assets.js');
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6v4sAAAAASUVORK5CYII=','base64');
 assert.deepEqual(getAssetSize('png',png,'fixture.png'),{width:1,height:1});
 const dir=await mkdtemp(join(tmpdir(),'backyrd-metro-security-'));
 try {
  const file=join(dir,'fixture.png');await writeFile(file,png);
  const data=await metroRequire('./src/Assets.js').getAssetData(file,'fixture.png',[],'ios','/assets');
  assert.equal(data.width,1);assert.equal(data.height,1);
 }finally{await rm(dir,{recursive:true,force:true});}
 const child=spawnSync(process.execPath,['-e',`const b=Buffer.alloc(16);b.write('icns');b.writeUInt32BE(16,4);b.write('ic07',8);try{require('image-size').imageSize(b)}catch{};console.log('completed');`],{cwd:new URL('..',import.meta.url),timeout:2000,encoding:'utf8'});
 assert.equal(child.status,0,child.error?.message||child.stderr);assert.match(child.stdout,/completed/);
});

test('PostCSS does not disclose a local source map supplied through an absolute annotation',async()=>{
 const postcss=require('postcss');const dir=await mkdtemp(join(tmpdir(),'backyrd-css-security-'));
 try {
  const map=join(dir,'private.map');await writeFile(map,JSON.stringify({version:3,sources:['private.txt'],sourcesContent:['SYNTHETIC_PRIVATE_CANARY'],names:[],mappings:''}));
  const result=await postcss([]).process(`a{color:red}/*# sourceMappingURL=${map} */`,{from:undefined,map:{inline:false,annotation:false}});
  assert.ok(!JSON.stringify(result.map?.toJSON()).includes('SYNTHETIC_PRIVATE_CANARY'));
 }finally{await rm(dir,{recursive:true,force:true});}
});


test('lint filesystem recursive copy preserves a symlink instead of copying external file bytes',async()=>{
 const {NodeHfs}=await import('@humanfs/node');
 const dir=await mkdtemp(join(tmpdir(),'backyrd-lint-copy-security-'));
 try {
  const source=join(dir,'source'),destination=join(dir,'destination'),outside=join(dir,'outside.txt');
  await mkdir(source);await writeFile(outside,'SYNTHETIC_OUTSIDE_CANARY');
  await symlink(outside,join(source,'link.txt'));
  await new NodeHfs().copyAll(source,destination);
  assert.equal((await lstat(join(destination,'link.txt'))).isSymbolicLink(),true);
  assert.equal(await readlink(join(destination,'link.txt')),outside);
 }finally{await rm(dir,{recursive:true,force:true});}
});
