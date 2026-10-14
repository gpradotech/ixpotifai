import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Queue} from '../lib/queue.mjs';
import {command,validateAudio} from '../lib/audio.mjs';

test('limpar lista preserva arquivos e permite desfazer mesmo após reiniciar',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ixpotifai-clear-'));let queue,restored;
  try{
    queue=await new Queue(dir).init();await queue.action('pause');await queue.add('https://open.spotify.com/track/7iL6o9tox1zgHpKUfh9vuC');queue.items[0].status='completed';queue.items[0].file='keep.flac';await fs.writeFile(path.join(queue.downloadRoot,'keep.flac'),'preserve');await queue.persist();
    const id=queue.items[0].id;await queue.action('clear');assert.equal(queue.items.length,0);assert.equal(queue.view().canUndoClear,true);assert.equal(await fs.readFile(path.join(queue.downloadRoot,'keep.flac'),'utf8'),'preserve');await queue.close();
    restored=await new Queue(dir).init();assert.equal(restored.view().canUndoClear,true);await restored.action('undo-clear');assert.equal(restored.items[0].id,id);assert.equal(restored.items[0].status,'completed');assert.equal(restored.view().canUndoClear,false);
  }finally{await queue?.close();await restored?.close();await fs.rm(dir,{recursive:true,force:true});}
});
test('limpar interrompe a transferência ativa, esvazia a fila e restaura itens sem perder novos pedidos',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ixpotifai-clear-active-'));let queue;
  try{
    queue=await new Queue(dir,{processor:async(item,signal)=>{item.status='downloading';await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));}}).init();
    await queue.add('https://open.spotify.com/track/7iL6o9tox1zgHpKUfh9vuC');assert.ok(queue.active);await queue.action('clear');assert.equal(queue.active,null);assert.equal(queue.items.length,0);assert.equal(queue.clearedItems[0].status,'queued');
    await queue.action('pause');await queue.add('https://open.spotify.com/track/5D2mYZuzcgjpchVY1pmTPh');await queue.action('undo-clear');assert.equal(queue.items.length,2);assert.equal(queue.items[0].status,'queued');assert.notEqual(queue.items[0].id,queue.items[1].id);
  }finally{await queue?.close();await fs.rm(dir,{recursive:true,force:true});}
});
test('adicionar novamente um item limpo reutiliza o FLAC validado sem sobrescrever o arquivo',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ixpotifai-clear-reuse-'));let queue;
  try {
    queue=await new Queue(dir).init();await queue.action('pause');
    const input='https://open.spotify.com/track/7iL6o9tox1zgHpKUfh9vuC';await queue.add(input);const item=queue.items[0];
    item.file='existing.flac';const file=path.join(queue.downloadRoot,item.file);await command(['-v','error','-f','lavfi','-i','sine=duration=1','-c:a','flac',file]);item.audio=await validateAudio(file);item.status='completed';await queue.persist();
    const hash=item.audio.sha256;await queue.action('clear');await queue.add(input);assert.equal(queue.items[0].status,'completed');assert.equal(queue.items[0].audio.sha256,hash);assert.equal(queue.items[0].id,item.id);await queue.action('undo-clear');assert.equal(queue.items.length,1);
  }finally{await queue?.close();await fs.rm(dir,{recursive:true,force:true});}
});
