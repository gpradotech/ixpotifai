import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {Queue} from '../lib/queue.mjs';
import {createApp} from '../server.mjs';
import {spotifyLinkKey} from '../public/list.js';

const id1='7iL6o9tox1zgHpKUfh9vuC',id2='0000000000000000000002';
const url=id=>`https://open.spotify.com/track/${id}`;
const track=id=>({id,title:`Faixa ${id}`,artist:'Artista',cover:'https://example.org/capa.png',spotifyUrl:url(id)});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};

test('todos os metadados do lote ficam prontos antes de iniciar qualquer transferência',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ixpotifai-prepare-'));
  const first=deferred(),second=deferred(),done=deferred();let queue;const started=[];
  try {
    queue=await new Queue(dir,{metadataReader:input=>input===url(id1)?first.promise:second.promise,processor:async item=>{started.push(item.id);item.status='completed';if(started.length===2)done.resolve();}}).init();
    const preparing=queue.prepare(`${url(id1)}\n${url(id2)}`);
    assert.equal(queue.view().preparing,true);
    first.resolve([track(id1)]);await new Promise(r=>setImmediate(r));
    assert.equal(queue.items.length,0);assert.equal(started.length,0);
    await assert.rejects(queue.action('clear'),/preparando/);
    second.resolve([track(id2)]);const ready=await preparing;
    assert.equal(ready.preparing,false);assert.equal(ready.items.length,2);
    assert.ok(ready.items.every(item=>item.status==='prepared' && item.track.title && item.track.artist && item.track.cover));
    assert.equal(started.length,0);
    await queue.startBatch(ready.readyBatches[0]);await done.promise;
    assert.equal(started.length,2);
  }finally{await queue?.close();await fs.rm(dir,{recursive:true,force:true});}
});

test('links equivalentes e referências já presentes são recusados antes de consultar metadados',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ixpotifai-duplicates-'));let queue,calls=0;
  try {
    const localized=`https://open.spotify.com/intl-pt/track/${id1}?si=other`;
    assert.equal(spotifyLinkKey(localized),spotifyLinkKey(url(id1)));
    assert.equal(spotifyLinkKey(`spotify:track:${id1}`),spotifyLinkKey(url(id1)));
    assert.equal(spotifyLinkKey('https://example.org/track/'+id1),null);
    queue=await new Queue(dir,{metadataReader:async()=>{calls++;return [track(id1)];}}).init();
    await assert.rejects(queue.prepare(`${localized}\n${url(id1)}`),/outro campo/);
    assert.equal(calls,0);assert.equal(queue.items.length,0);
    await queue.prepare(url(id1));await assert.rejects(queue.prepare(localized),/já está/);
    assert.equal(calls,1);assert.equal(queue.items.length,1);
  }finally{await queue?.close();await fs.rm(dir,{recursive:true,force:true});}
});

test('álbum e faixa sobrepostos produzem uma única faixa e preservam os links de origem',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ixpotifai-album-'));let queue;
  const album=`https://open.spotify.com/album/${id2}`;
  try {
    queue=await new Queue(dir,{metadataReader:async input=>input===album?[track(id1),track(id2)]:[track(id1)]}).init();
    const ready=await queue.prepare(`${album}\n${url(id1)}`);
    assert.equal(ready.items.length,2);
    assert.deepEqual(ready.items[0].sourceInputs,[album,url(id1)]);
    await assert.rejects(queue.prepare(album+'?si=other'),/já está/);
  }finally{await queue?.close();await fs.rm(dir,{recursive:true,force:true});}
});

test('falha de metadados é exibida sem iniciar os demais downloads prematuramente',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ixpotifai-metadata-failure-'));let queue;
  try {
    queue=await new Queue(dir,{metadataReader:async input=>{if(input===url(id2))throw new Error('Não conseguimos reconhecer essa música agora.');return [track(id1)];},processor:async()=>assert.fail('Transferência iniciou antes de renderizar')}).init();
    const ready=await queue.prepare(`${url(id1)}\n${url(id2)}`);
    assert.deepEqual(ready.items.map(item=>item.status),['prepared','failed']);
    assert.match(ready.items[1].error,/reconhecer/);
  }finally{await queue?.close();await fs.rm(dir,{recursive:true,force:true});}
});

test('pasta escolhida persiste e arquivos antigos mantêm sua localização',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ixpotifai-folder-'));let queue,restored;
  try {
    queue=await new Queue(dir).init();const old=queue.downloadRoot;
    await fs.writeFile(path.join(old,'existing.flac'),'preserved');
    queue.items.push({id:'old',status:'completed',file:'existing.flac'});
    const next=path.join(dir,'Nova pasta com acentos — músicas');await fs.mkdir(next);
    await queue.setDownloadFolder(next);
    assert.equal(queue.items[0].downloadFolder,old);
    assert.equal(await fs.readFile(path.join(old,'existing.flac'),'utf8'),'preserved');
    assert.deepEqual(await fs.readdir(next),[]);
    restored=await new Queue(dir).init();assert.equal(restored.downloadRoot,await fs.realpath(next));
    queue.active={id:'x'};await assert.rejects(queue.setDownloadFolder(old),/Aguarde/);queue.active=null;
    await assert.rejects(queue.setDownloadFolder('relative'),/pasta válida/);
  }finally{if(queue)queue.active=null;await queue?.close();await restored?.close();await fs.rm(dir,{recursive:true,force:true});}
});

test('navegação de pastas exige sessão e só confirmação válida muda o destino',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ixpotifai-folder-http-'));let app;
  const previous=process.env.IXPOTIFAI_PORT;process.env.IXPOTIFAI_PORT='0';
  try {
    const queue=await new Queue(dir).init();
    app=await createApp({root:dir,queue});
    const token=(await(await fetch(app.url)).text()).match(/name="ixpotifai-session" content="([^"]+)"/)[1];
    assert.equal((await fetch(app.url+'/api/folders',{method:'POST',body:'{}'})).status,403);
    assert.equal((await fetch(app.url+'/api/folder',{method:'POST',body:'{}'})).status,403);
    const post=(route,data)=>fetch(app.url+'/api/'+route,{method:'POST',headers:{'X-ixpotifai-Token':token},body:JSON.stringify(data)});
    const original=queue.downloadRoot,selected=path.join(dir,'chosen');await fs.mkdir(selected);await fs.writeFile(path.join(dir,'do-not-list.txt'),'file');
    const listing=await(await post('folders',{directory:dir})).json();
    assert.equal(listing.directory,await fs.realpath(dir));assert.ok(listing.folders.some(folder=>folder.name==='chosen'));assert.ok(!listing.folders.some(folder=>folder.name==='do-not-list.txt'));
    assert.equal(queue.downloadRoot,original);
    assert.equal((await post('folder',{directory:'invalid'})).status,400);assert.equal(queue.downloadRoot,original);
    assert.equal((await(await post('folder',{directory:selected})).json()).downloadFolder,await fs.realpath(selected));
    assert.equal((await fetch(app.url+'/files/old.flac')).status,404);
  }finally{await app?.close();if(previous===undefined)delete process.env.IXPOTIFAI_PORT;else process.env.IXPOTIFAI_PORT=previous;await fs.rm(dir,{recursive:true,force:true});}
});

test('nova tentativa de uma playlist prepara todas as faixas antes de iniciar a fila',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ixpotifai-retry-list-'));let queue;
  try {
    queue=await new Queue(dir,{metadataReader:async()=>[track(id1),track(id2)],processor:async()=>assert.fail('Download prematuro')}).init();
    const input=`https://open.spotify.com/playlist/${id2}`;queue.items.push({id:'failed-list',input,status:'failed'});
    const ready=await queue.action('retry','failed-list');
    assert.equal(ready.items.length,2);assert.ok(ready.items.every(item=>item.track.cover && item.status==='prepared'));assert.equal(ready.readyBatches.length,1);
  }finally{await queue?.close();await fs.rm(dir,{recursive:true,force:true});}
});
