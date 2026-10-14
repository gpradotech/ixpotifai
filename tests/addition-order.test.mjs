import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Queue} from '../lib/queue.mjs';
import {listPage} from '../public/list.js';

const link=n=>'https://open.spotify.com/track/'+String(n).padStart(22,'0');
const reader=async input=>[{id:input.split('/').at(-1),spotifyUrl:input,title:'Faixa',artist:'Artista',duration:180}];
test('números de adição sobrevivem a novas faixas, exclusão, paginação, limpeza e reinício',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'ixpotifai-order-'));let queue;
  try{
    queue=await new Queue(root,{metadataReader:reader}).init();await queue.action('pause');
    for(let n=1;n<=12;n++)await queue.prepare(link(n));
    assert.deepEqual(queue.items.map(item=>item.sequence),Array.from({length:12},(_,i)=>i+1));
    const oldest=queue.items[0];await queue.action('remove',queue.items[1].id);await queue.prepare(link(13));
    assert.equal(queue.items[0].sequence,oldest.sequence);
    const descending=queue.view().items.sort((a,b)=>b.sequence-a.sequence);
    assert.deepEqual(listPage(descending,1).items.map(item=>item.sequence),[13,12,11,10,9,8,7,6,5,4]);
    assert.deepEqual(listPage(descending,2).items.map(item=>item.sequence),[3,1]);
    await queue.action('clear');await queue.action('undo-clear');assert.equal(queue.items[0].sequence,1);
    await queue.close();queue=await new Queue(root,{metadataReader:reader}).init();await queue.prepare(link(14));
    assert.equal(queue.items[0].sequence,1);assert.equal(queue.items.at(-1).sequence,14);
    await queue.action('clear');await queue.close();queue=await new Queue(root,{metadataReader:reader}).init();await queue.prepare(link(15));
    assert.equal(queue.items[0].sequence,15);
  }finally{await queue?.close();await fs.rm(root,{recursive:true,force:true});}
});
test('migra a ordem antiga uma vez e conserva o número ao tentar novamente a mesma faixa',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'ixpotifai-migrate-order-'));let queue;
  try{
    const dir=path.join(root,'.ixpotifai');await fs.mkdir(dir);
    await fs.writeFile(path.join(dir,'state.json'),JSON.stringify({paused:true,items:[{id:'first',input:link(1),status:'failed'},{id:'second',input:link(2),status:'cancelled'}]}));
    queue=await new Queue(root,{metadataReader:reader}).init();assert.deepEqual(queue.items.map(item=>item.sequence),[1,2]);
    await queue.action('retry','first');assert.equal(queue.items.find(item=>item.input===link(1)).sequence,1);
    await queue.prepare(link(3));assert.equal(queue.items.at(-1).sequence,3);
    await queue.close();queue=await new Queue(root,{metadataReader:reader}).init();assert.equal(queue.items.find(item=>item.input===link(1)).sequence,1);
  }finally{await queue?.close();await fs.rm(root,{recursive:true,force:true});}
});
