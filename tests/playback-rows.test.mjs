import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {Queue} from '../lib/queue.mjs';
import {createApp} from '../server.mjs';
import {command,validateAudio} from '../lib/audio.mjs';
import {formatDuration,listPage} from '../public/list.js';
import {publicTrackAlbum,entityMetadata} from '../lib/metadata.mjs';

test('reprodução exige sessão, serve FLAC intacto e responde a intervalos válidos e inválidos',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'ixpotifai-playback-'));let app;
  const previous=process.env.IXPOTIFAI_PORT;process.env.IXPOTIFAI_PORT='0';
  try{
    const queue=await new Queue(root).init();await queue.action('pause');
    const id=randomUUID(),file='Teste.flac',full=path.join(queue.downloadRoot,file);
    await command(['-v','error','-f','lavfi','-i','anullsrc=r=44100:cl=stereo','-t','2','-c:a','flac',full]);
    const bytes=await fs.readFile(full);queue.items.push({id,status:'completed',file,downloadFolder:queue.downloadRoot});
    app=await createApp({root,queue});const token=(await(await fetch(app.url)).text()).match(/name="ixpotifai-session" content="([^"]+)"/)[1];
    const url=app.url+`/api/audio/${id}?session=${token}`;
    assert.equal((await fetch(app.url+`/api/audio/${id}`)).status,403);
    const complete=await fetch(url);assert.equal(complete.status,200);assert.equal(complete.headers.get('content-type'),'audio/flac');assert.deepEqual(Buffer.from(await complete.arrayBuffer()),bytes);
    const partial=await fetch(url,{headers:{Range:'bytes=8-63'}});assert.equal(partial.status,206);assert.equal(partial.headers.get('content-range'),`bytes 8-63/${bytes.length}`);assert.deepEqual(Buffer.from(await partial.arrayBuffer()),bytes.subarray(8,64));
    const suffix=await fetch(url,{headers:{Range:'bytes=-42'}});assert.deepEqual(Buffer.from(await suffix.arrayBuffer()),bytes.subarray(-42));
    assert.equal((await fetch(url,{headers:{Range:'bytes=99999999-'}})).status,416);
    assert.equal((await fetch(url,{headers:{Range:'bytes=0-1,4-5'}})).status,416);
    assert.equal((await fetch(url,{method:'HEAD'})).headers.get('content-length'),String(bytes.length));
    queue.items[0].file='../outside.flac';assert.equal((await fetch(url)).status,400);
    queue.items[0].file=file;queue.items[0].status='queued';assert.equal((await fetch(url)).status,404);
  }finally{await app?.close();if(previous===undefined)delete process.env.IXPOTIFAI_PORT;else process.env.IXPOTIFAI_PORT=previous;await fs.rm(root,{recursive:true,force:true});}
});

test('remover uma linha preserva o áudio e permite reutilizá-lo após reiniciar sem desfazer outras remoções',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'ixpotifai-remove-row-'));let queue,restored;
  try{
    queue=await new Queue(root).init();await queue.action('pause');const input='https://open.spotify.com/track/7iL6o9tox1zgHpKUfh9vuC';await queue.add(input);
    const item=queue.items[0];item.file='Teste.flac';await command(['-v','error','-f','lavfi','-i','anullsrc=r=44100:cl=stereo','-t','1','-c:a','flac',path.join(queue.downloadRoot,item.file)]);item.audio=await validateAudio(path.join(queue.downloadRoot,item.file));item.status='completed';await queue.persist();
    await queue.action('remove',item.id);assert.equal(queue.items.length,0);assert.equal(queue.view().canUndoClear,false);assert.equal(queue.removedItems.length,1);await queue.close();
    restored=await new Queue(root).init();await restored.add(input);assert.equal(restored.items[0].status,'completed');assert.equal(restored.items[0].audio.sha256,item.audio.sha256);
  }finally{await queue?.close();await restored?.close();await fs.rm(root,{recursive:true,force:true});}
});

test('remover uma transferência ativa interrompe apenas essa faixa e a exclui da lista',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'ixpotifai-remove-active-'));let queue;
  try{
    queue=await new Queue(root,{processor:async(item,signal)=>{item.status='downloading';await new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));}}).init();
    await queue.add('https://open.spotify.com/track/7iL6o9tox1zgHpKUfh9vuC');const id=queue.items[0].id;assert.ok(queue.active);await queue.action('remove',id);
    assert.equal(queue.active,null);assert.equal(queue.items.length,0);assert.equal(queue.removedItems[0].status,'cancelled');
  }finally{await queue?.close();await fs.rm(root,{recursive:true,force:true});}
});

test('duração, numeração paginada e álbum usam metadados reais sem reter sessão',()=>{
  assert.equal(formatDuration(249.8),'4:09');assert.equal(formatDuration(3723),'1:02:03');assert.equal(formatDuration(null),'—');
  const page=listPage(Array.from({length:25},(_,i)=>i),2);assert.equal(page.start,11);assert.equal(page.start+page.items.length-1,20);
  const id='7iL6o9tox1zgHpKUfh9vuC',state={session:{secret:'not-retained'},entities:{items:{['spotify:track:'+id]:{albumOfTrack:{name:"Get Rich Or Die Tryin'"}}}}};
  assert.equal(publicTrackAlbum(`<script id="initialState">${Buffer.from(JSON.stringify(state)).toString('base64')}</script>`,id),"Get Rich Or Die Tryin'");
  assert.equal(entityMetadata({title:'Faixa',artists:[{name:'Artista'}],album:{name:'Álbum'}}).album,'Álbum');
});
