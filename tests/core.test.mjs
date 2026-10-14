import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {spotifyInput,entityMetadata,parseSonglink} from '../lib/metadata.mjs';
import {parseManifest,compatibleRecording} from '../lib/provider.mjs';
import {privateAddress,publicURL,safeError} from '../lib/net.mjs';
import {Queue,filename} from '../lib/queue.mjs';
import {createApp} from '../server.mjs';

const link='https://open.spotify.com/intl-pt/track/7iL6o9tox1zgHpKUfh9vuC?si=ignored';
test('normalização preserva a referência e rejeita hosts ou formatos estranhos',()=>{
  assert.equal(spotifyInput(link).url,'https://open.spotify.com/track/7iL6o9tox1zgHpKUfh9vuC');assert.throws(()=>spotifyInput('https://open.spotify.com.evil.test/track/7iL6o9tox1zgHpKUfh9vuC'));assert.throws(()=>spotifyInput('file:///tmp/audio'));
  const metadata=entityMetadata({id:'x',title:'Track',artists:[{name:'Artist'}],duration:1500,session:{accessToken:'secret'}});assert.equal(metadata.duration,1.5);assert.equal(JSON.stringify(metadata).includes('secret'),false);
  assert.equal(parseSonglink({props:{pageProps:{pageData:{entityData:{isrc:'abc'},sections:[{links:[{platform:'tidal',url:'https://tidal.com/track/42'}]}]}}}}).tidalId,'42');
});
test('manifesto rejeita áudio com perdas, prévias e criptografia; preserva FLAC sem conversão',()=>{
  const manifest=m=>({data:{assetPresentation:'FULL',audioQuality:'LOSSLESS',manifest:Buffer.from(JSON.stringify(m)).toString('base64')}});
  assert.equal(parseManifest(manifest({codecs:'flac',encryptionType:'NONE',urls:['https://example.org/a.flac']})).type,'file');assert.throws(()=>parseManifest(manifest({codecs:'aac',urls:['x']})),/FLAC/);assert.throws(()=>parseManifest(manifest({codecs:'flac',encryptionType:'AES',urls:['x']})),/criptografia/);assert.throws(()=>parseManifest({data:{audioQuality:'HIGH'}}),/perdas/);
  const xml='<MPD><Representation codecs="flac"><SegmentTemplate initialization="https://example.org/init" media="https://example.org/$Number$" startNumber="1"><SegmentTimeline><S d="100" r="2"/></SegmentTimeline></SegmentTemplate></Representation></MPD>';
  assert.equal(parseManifest({audioQuality:'HI_RES_LOSSLESS',manifest:Buffer.from(xml).toString('base64')}).urls.length,4);
});
test('ISRC, versão explícita e duração divergentes não são aceitos; master continua não comprovado',()=>{
  const ref={title:'Track',artist:'Artist',duration:193.466,isrc:'US1234567890',explicit:true};const source={title:'Track',artist:{name:'Artist'},duration:193,isrc:ref.isrc,explicit:true};assert.equal(compatibleRecording(ref,source).master,'Não comprovado');assert.throws(()=>compatibleRecording(ref,{...source,isrc:'OTHER'}),/identificador/);assert.throws(()=>compatibleRecording(ref,{...source,explicit:false}),/clean/);assert.throws(()=>compatibleRecording(ref,{...source,duration:210}),/duração/);
});
test('proteção de rede rejeita fontes privadas e credenciais; erros não expõem URLs assinadas',async()=>{
  for(const ip of ['127.0.0.1','10.1.2.3','172.16.0.1','192.168.1.1','169.254.1.1','::1','fc00::1','::ffff:127.0.0.1','::ffff:7f00:1'])assert.equal(privateAddress(ip),true);
  await assert.rejects(publicURL('https://127.0.0.1/x'));await assert.rejects(publicURL('https://[::ffff:127.0.0.1]/x'));await assert.rejects(publicURL('https://user:pass@example.org/x'));await assert.rejects(publicURL('http://example.org/x'));
  assert.equal(safeError(new Error('https://cdn.example.org/a?token=secret')).includes('secret'),false);assert.equal(filename({artist:'A/B',title:'A:Title'}).includes('/'),false);
});
test('fila persistente, lote inválido atômico, deduplicação e cancelamento',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ixpotifai-queue-'));let queue;
  try{queue=await new Queue(dir,{processor:async(item,signal)=>{item.status='downloading';await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));}}).init();await queue.action('pause');await assert.rejects(queue.add(link+' invalid'));assert.equal(queue.items.length,0);await queue.add(link+' '+link);assert.equal(queue.items.length,1);const restored=await new Queue(dir).init();assert.equal(restored.paused,true);assert.equal(restored.items.length,1);await queue.action('resume');await new Promise(r=>setTimeout(r,20));await queue.action('cancel',queue.items[0].id);await new Promise(r=>setTimeout(r,40));assert.equal(queue.items[0].status,'cancelled');await restored.close();}finally{await queue?.close();await fs.rm(dir,{recursive:true,force:true});}
});
test('API local exige sessão para mutações e rejeita origem externa e host falso',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ixpotifai-http-'));const previous=process.env.IXPOTIFAI_PORT;process.env.IXPOTIFAI_PORT='0';let app;
  try{const queue=await new Queue(dir,{metadataReader:async()=>[{id:'7iL6o9tox1zgHpKUfh9vuC',title:'Track',artist:'Artist'}]}).init();await queue.action('pause');app=await createApp({root:dir,queue});const page=await(await fetch(app.url)).text();const token=page.match(/name="ixpotifai-session" content="([^"]+)"/)[1];assert.equal((await fetch(app.url+'/api/add',{method:'POST',body:'{}'})).status,403);const hostStatus=await new Promise((resolve,reject)=>{http.get(app.url+'/api/state',{headers:{Host:'evil.test'}},res=>{res.resume();resolve(res.statusCode);}).on('error',reject);});assert.equal(hostStatus,403);assert.equal((await fetch(app.url+'/api/add',{method:'POST',headers:{'X-ixpotifai-Token':token,Origin:'https://evil.test'},body:'{}'})).status,403);const response=await fetch(app.url+'/api/add',{method:'POST',headers:{'X-ixpotifai-Token':token},body:JSON.stringify({input:link})});assert.equal(response.status,200);assert.equal((await response.json()).items.length,1);assert.equal((await fetch(app.url+'/files/../../package.json')).status,404);}finally{if(app)await app.close();if(previous===undefined)delete process.env.IXPOTIFAI_PORT;else process.env.IXPOTIFAI_PORT=previous;await fs.rm(dir,{recursive:true,force:true});}
});
