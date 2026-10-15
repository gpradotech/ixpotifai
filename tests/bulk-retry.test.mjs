import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Queue} from '../lib/queue.mjs';
import {downloadControl} from '../public/list.js';

test('controle global alterna pausa, retomada com falhas e nova tentativa em lote',()=>{
  const state=(statuses,paused=false,preparing=false)=>({items:statuses.map(status=>({status})),paused,preparing});
  assert.deepEqual(downloadControl(state(['downloading','failed'])),{label:'Pausar downloads',action:'pause',disabled:false});
  assert.deepEqual(downloadControl(state(['queued','failed'],true)),{label:'Retomar downloads',action:'retry-failed',disabled:false});
  assert.deepEqual(downloadControl(state(['queued'],true)),{label:'Retomar download',action:'resume',disabled:false});
  for(const paused of [true,false])assert.deepEqual(downloadControl(state(['completed','failed','failed'],paused)),{label:'Tentar novamente',action:'retry-failed',disabled:false});
  for(const statuses of [[],['completed'],['cancelled'],['completed','cancelled']])assert.equal(downloadControl(state(statuses)).disabled,true);
  assert.equal(downloadControl(state(['failed'],false,true)).disabled,true);
});

test('nova tentativa global inclui todas as falhas uma vez e preserva concluídos e cancelados',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'ixpotifai-bulk-retry-'));let queue,restored;
  const started=[];
  try {
    queue=await new Queue(root,{processor:async item=>{
      started.push(item.id);assert.equal(item.error,undefined);assert.equal(item.progress,0);
      if(item.id==='failed-again')throw new Error('O áudio recebido parece estar incompleto ou danificado. Tente novamente.');
      item.status='completed';
    }}).init();await queue.action('pause');
    queue.items=[
      {id:'done',status:'completed',file:'preserved.flac',audio:{sha256:'preserved'}},
      {id:'failed-again',status:'failed',error:'Anterior',progress:95},
      {id:'cancelled',status:'cancelled'},
      {id:'metadata-failure',status:'failed',input:'https://open.spotify.com/track/0000000000000000000001',error:'Anterior',progress:50},
      {id:'pending',status:'queued',progress:0}
    ];
    await queue.action('retry-failed');
    while(queue.active || queue.items.some(item=>item.status==='queued'))await new Promise(resolve=>setTimeout(resolve,5));
    assert.deepEqual(started,['failed-again','metadata-failure','pending']);
    assert.equal(queue.items[0].file,'preserved.flac');assert.equal(queue.items[0].audio.sha256,'preserved');
    assert.equal(queue.items[1].status,'failed');assert.equal(queue.items[2].status,'cancelled');
    assert.equal(queue.items[3].status,'completed');assert.equal(queue.paused,false);
    await queue.close();restored=await new Queue(root).init();
    assert.deepEqual(restored.items.map(item=>item.status),['completed','failed','cancelled','completed','completed']);
  }finally{await queue?.close();await restored?.close();await fs.rm(root,{recursive:true,force:true});}
});

test('nova tentativa global aguarda a preparação e não altera a fila em limpeza',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'ixpotifai-bulk-guard-'));let queue;
  try {
    queue=await new Queue(root).init();await queue.action('pause');queue.items=[{id:'failed',status:'failed'}];
    queue.preparing=true;await assert.rejects(queue.action('retry-failed'),/Aguarde/);queue.preparing=false;
    queue.clearing=true;await assert.rejects(queue.action('retry-failed'),/Aguarde/);queue.clearing=false;
    assert.equal(queue.items[0].status,'failed');assert.equal(queue.paused,true);
  }finally{if(queue){queue.preparing=false;queue.clearing=false;}await queue?.close();await fs.rm(root,{recursive:true,force:true});}
});
