import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {previewStore,readCover} from '../lib/preview.mjs';
import {Queue} from '../lib/queue.mjs';
import {createApp} from '../server.mjs';

const link='https://open.spotify.com/track/7iL6o9tox1zgHpKUfh9vuC';
test('prévia não altera a fila, reutiliza a referência e omite dados privados da fonte',async()=>{
  let reads=0,covers=0;const queue={items:[]};
  const store=previewStore(queue,{reader:async()=>{reads++;return {title:'In Da Club',artist:'50 Cent',cover:'https://i.scdn.co/image/example',session:{accessToken:'secret'}};},coverReader:async()=>{covers++;return {type:'image/png',bytes:Buffer.from('image')};}});
  const preview=await store.get(link);await store.get(link+'?si=another');assert.equal(reads,1);assert.equal(queue.items.length,0);assert.equal(preview.title,'In Da Club');assert.equal(preview.cover,'/api/cover/track/7iL6o9tox1zgHpKUfh9vuC');assert.equal(JSON.stringify(preview).includes('secret'),false);
  await store.cover('track',preview.id);await store.cover('track',preview.id);assert.equal(covers,1);await assert.rejects(store.get('https://evil.test/track/x'));await assert.rejects(readCover('https://127.0.0.1/image'));await assert.rejects(readCover('https://example.com/image'));
});
test('API de prévia exige sessão, fornece capa local e mantém a fila vazia',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ixpotifai-preview-')),previous=process.env.IXPOTIFAI_PORT;process.env.IXPOTIFAI_PORT='0';let app;
  try{
    const queue=await new Queue(dir).init();await queue.action('pause');
    app=await createApp({root:dir,queue,previewOptions:{reader:async()=>({title:'In Da Club',artist:'50 Cent',cover:'https://i.scdn.co/image/example'}),coverReader:async()=>({type:'image/png',bytes:Buffer.from('image')})}});
    const page=await(await fetch(app.url)).text(),token=page.match(/name="ixpotifai-session" content="([^"]+)"/)[1];
    assert.equal((await fetch(app.url+'/api/preview',{method:'POST',body:JSON.stringify({input:link})})).status,403);
    const response=await fetch(app.url+'/api/preview',{method:'POST',headers:{'X-ixpotifai-Token':token},body:JSON.stringify({input:link})});assert.equal(response.status,200);const preview=await response.json();assert.equal(preview.artist,'50 Cent');
    const cover=await fetch(app.url+preview.cover);assert.equal(cover.headers.get('content-type'),'image/png');assert.equal(await cover.text(),'image');assert.equal(queue.items.length,0);
  }finally{await app?.close();if(previous===undefined)delete process.env.IXPOTIFAI_PORT;else process.env.IXPOTIFAI_PORT=previous;await fs.rm(dir,{recursive:true,force:true});}
});
