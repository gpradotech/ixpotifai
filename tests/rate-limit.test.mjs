import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import dns from 'node:dns/promises';
import https from 'node:https';
import {EventEmitter} from 'node:events';
import {Readable} from 'node:stream';
import {RateLimitError,retryAfterMilliseconds} from '../lib/rate-limit.mjs';
import {remote} from '../lib/net.mjs';
import {Queue} from '../lib/queue.mjs';
import {retryFeedback,downloadControl} from '../public/list.js';

const settle=async queue=>{const deadline=Date.now()+2000;while(queue.active || (!queue.paused && queue.items.some(item=>['queued','waiting'].includes(item.status)))){if(Date.now()>deadline)throw new Error('Fila não terminou');await new Promise(resolve=>setTimeout(resolve,5));}};

test('Retry-After aceita segundos e data HTTP; o transporte preserva 429 sem expor a URL',async t=>{
  const now=Date.parse('2026-10-15T18:00:00Z');
  assert.equal(retryAfterMilliseconds('120',now),120000);
  assert.equal(retryAfterMilliseconds('Thu, 15 Oct 2026 18:03:00 GMT',now),180000);
  assert.equal(retryAfterMilliseconds('Thu, 15 Oct 2026 17:00:00 GMT',now),0);
  assert.equal(retryAfterMilliseconds(null,now),null);assert.equal(retryAfterMilliseconds('invalid',now),null);
  t.mock.method(dns,'lookup',async()=>[{address:'93.184.216.34'}]);
  t.mock.method(https,'request',(_url,_options,callback)=>{
    const request=new EventEmitter();
    request.end=()=>queueMicrotask(()=>callback(Object.assign(Readable.from([]),{statusCode:429,headers:{'retry-after':'120'}})));
    return request;
  });
  await assert.rejects(remote('https://example.org/audio?token=secret'),error=>{
    assert.equal(error.status,429);assert.equal(error.retryAfterMs,120000);assert.equal(error.source,'example.org');
    assert.doesNotMatch(error.message,/secret|https:/);return true;
  });
});

test('429 aguarda o prazo antes de repetir e mantém as outras músicas na fila',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'ixpotifai-429-success-'));let queue,now=0;
  const attempts=[],waits=[];
  try {
    queue=await new Queue(root,{now:()=>now,wait:async ms=>{
      waits.push(ms);assert.equal(queue.items[0].status,'waiting');assert.equal(queue.items[1].status,'queued');
      assert.match(retryFeedback(queue.items[0],false,now),/120s/);now+=ms;
    },processor:async item=>{
      attempts.push(item.id);
      if(attempts.length===1)throw new RateLimitError('source.example','120');
      item.status='completed';
    }}).init();await queue.action('pause');
    queue.items=[{id:'first',status:'failed'},{id:'second',status:'failed'}];
    const accepted=await queue.action('retry-failed');assert.deepEqual(accepted.actionResult,{type:'retry-failed',ids:['first','second'],count:2});
    await settle(queue);
    assert.deepEqual(waits,[120000]);assert.deepEqual(attempts,['first','first','second']);
    assert.ok(queue.items.every(item=>item.status==='completed'));assert.equal(queue.paused,false);
  }finally{await queue?.close();await fs.rm(root,{recursive:true,force:true});}
});

test('limite persistente encerra após três novas tentativas e pausa o restante da fila',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'ixpotifai-429-bound-'));let queue,restored,now=0;
  const attempts=[],waits=[];
  try {
    queue=await new Queue(root,{now:()=>now,wait:async ms=>{waits.push(ms);now+=ms;},processor:async item=>{attempts.push(item.id);throw new RateLimitError('source.example',null);}}).init();
    await queue.action('pause');queue.items=[{id:'limited',status:'failed'},{id:'next',status:'queued'}];
    await queue.action('retry-failed');await settle(queue);
    assert.deepEqual(attempts,['limited','limited','limited','limited']);assert.deepEqual(waits,[60000,120000,240000]);
    assert.equal(queue.items[0].status,'failed');assert.equal(queue.items[0].rateLimitExhausted,true);
    assert.equal(queue.items[1].status,'queued');assert.equal(queue.paused,true);
    assert.match(retryFeedback(queue.items[0],true,now),/3 novas tentativas/);
    const deadline=queue.rateLimitUntil;assert.equal(deadline-now,480000);
    await queue.close();restored=await new Queue(root,{now:()=>now}).init();
    assert.equal(restored.rateLimitUntil,deadline);assert.equal(restored.paused,true);
    assert.equal(restored.items[0].retryAt,deadline);
    await assert.rejects(restored.action('unknown'),/reconhecer este controle/);
  }finally{await queue?.close();await restored?.close();await fs.rm(root,{recursive:true,force:true});}
});

test('prazo ampliado durante a espera prevalece antes de qualquer novo pedido',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'ixpotifai-429-extended-'));let queue,now=0,calls=0;
  const waits=[];
  try {
    queue=await new Queue(root,{now:()=>now,wait:async ms=>{
      waits.push(ms);if(waits.length===1)queue.rateLimitUntil=180000;now+=ms;
    },processor:async item=>{calls++;if(calls===1)throw new RateLimitError('source.example','120');assert.equal(now,180000);item.status='completed';}}).init();
    await queue.action('pause');queue.items=[{id:'limited',status:'failed'}];
    await queue.action('retry-failed');await settle(queue);
    assert.deepEqual(waits,[120000,60000]);assert.equal(calls,2);assert.equal(queue.items[0].status,'completed');
  }finally{await queue?.close();await fs.rm(root,{recursive:true,force:true});}
});

test('espera pode ser pausada, retomada e cancelada sem ignorar o prazo da fonte',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'ixpotifai-429-pause-'));let queue,now=0,entered;
  let startedWaiting=new Promise(resolve=>entered=resolve),calls=0;
  try {
    queue=await new Queue(root,{now:()=>now,wait:async(_ms,signal)=>{entered();await new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));},processor:async()=>{calls++;throw new RateLimitError('source.example','90');}}).init();
    await queue.action('pause');queue.items=[{id:'limited',status:'failed'}];
    await queue.action('retry-failed');await startedWaiting;
    assert.equal(downloadControl(queue.view()).action,'pause');
    await queue.action('pause');await settle(queue);
    assert.equal(queue.items[0].status,'queued');assert.equal(queue.rateLimitUntil,90000);
    startedWaiting=new Promise(resolve=>entered=resolve);
    await queue.action('resume');await startedWaiting;assert.equal(calls,1);
    await queue.action('cancel','limited');await settle(queue);
    assert.equal(queue.items[0].status,'cancelled');assert.equal(calls,1);
  }finally{await queue?.close();await fs.rm(root,{recursive:true,force:true});}
});
