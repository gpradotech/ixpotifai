import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {UpdateManager,RELEASE_API,releaseCandidate} from '../lib/updates.mjs';
import {createApp} from '../server.mjs';
import {Queue} from '../lib/queue.mjs';
import {fixture,artifact,release,waitFor} from './update-fixtures.mjs';

test('somente Release estável mais recente com asset oficial e digest pode ser oferecida',async()=>{
  const data=await artifact(),valid=release(data);
  assert.equal(releaseCandidate(valid,'0.1.1').version,'0.1.2');
  assert.equal(releaseCandidate(valid,'0.1.2'),null);
  for(const mutate of [r=>r.draft=true,r=>r.prerelease=true,r=>r.tag_name='v0.1.3-beta',r=>r.assets[0].digest=null,r=>r.assets[0].browser_download_url='https://example.org/other.gz',r=>r.assets[0].size=100000000]) {
    const bad=structuredClone(valid);mutate(bad);assert.equal(releaseCandidate(bad,'0.1.1'),null);
  }
});

test('consulta estável usa cache, persiste Mais tarde e respeita pausa do GitHub',async()=>{
  const root=await fixture(),data=await artifact();let manager,now=100000,calls=0;
  try {
    manager=await new UpdateManager(root,{items:[],paused:true},{autoCheck:false,now:()=>now,request:async(url,options)=>{
      calls++;assert.equal(url,RELEASE_API);
      if(calls===1)return new Response(JSON.stringify(release(data)),{headers:{etag:'"release"'}});
      assert.equal(options.headers['If-None-Match'],'"release"');
      if(calls===2)return new Response(null,{status:304});
      return new Response(null,{status:429,headers:{'retry-after':'3600'}});
    }}).init();
    await manager.check({manual:true});assert.equal(manager.view().available.version,'0.1.2');
    await manager.check({manual:true});assert.equal(calls,1);
    await manager.dismiss('0.1.2');manager.close();
    manager=await new UpdateManager(root,{items:[],paused:true},{autoCheck:false,now:()=>now,request:manager.request}).init();
    assert.equal(manager.view().dismissedVersion,'0.1.2');
    now+=60001;await manager.check({manual:true});assert.equal(calls,2);assert.equal(manager.view().available.version,'0.1.2');
    now+=60001;await manager.check({manual:true});now+=120000;await manager.check({manual:true});assert.equal(calls,3);
    assert.match(manager.view().checkError,/pausa/);
  }finally{manager?.close();await fs.rm(root,{recursive:true,force:true});}
});

test('download verificado aguarda a fila; cancelar não reinicia e nova solicitação pode prosseguir',async()=>{
  const root=await fixture(),data=await artifact();let manager,restarts=0;
  const queue={items:[{status:'downloading'}],active:{},paused:false};
  try {
    manager=await new UpdateManager(root,queue,{managed:true,autoCheck:false,onRestart:async()=>{restarts++;},request:async url=>url===RELEASE_API?new Response(JSON.stringify(release(data))):new Response(data.compressed)}).init();
    await manager.check({manual:true});await manager.start('0.1.2');await waitFor(()=>manager.phase==='waiting-downloads');
    assert.equal(restarts,0);await manager.cancel();assert.equal(manager.phase,'idle');
    await manager.start('0.1.2');await waitFor(()=>manager.phase==='waiting-downloads');
    queue.active=null;queue.items=[];await manager.maybeRestart();await waitFor(()=>restarts===1);
    assert.equal(manager.phase,'restarting');
  }finally{manager?.close();await fs.rm(root,{recursive:true,force:true});}
});

test('pacote corrompido e modo offline deixam a instalação intacta',async()=>{
  const root=await fixture(),data=await artifact();let manager;
  try {
    manager=await new UpdateManager(root,{items:[],paused:true},{autoCheck:false,managed:true,onRestart:()=>assert.fail('Não pode reiniciar'),request:async url=>url===RELEASE_API?new Response(JSON.stringify(release(data))):new Response(Buffer.alloc(data.compressed.length))}).init();
    await manager.check({manual:true});await manager.start('0.1.2');await waitFor(()=>manager.phase==='error');
    assert.equal(JSON.parse(await fs.readFile(path.join(root,'package.json'))).version,'0.1.1');
    manager.request=async()=>{throw new Error('offline');};manager.nextCheckAt=0;
    await manager.check({manual:true});assert.match(manager.view().checkError,/downloads podem continuar/);
  }finally{manager?.close();await fs.rm(root,{recursive:true,force:true});}
});

test('rotas de atualização exigem sessão e não aceitam pacote ou URL do cliente',async()=>{
  const root=await fixture();let app;const previous=process.env.IXPOTIFAI_PORT;process.env.IXPOTIFAI_PORT='0';
  try {
    const queue=await new Queue(root).init();await queue.action('pause');
    app=await createApp({root,queue,updateOptions:{autoCheck:false,request:async()=>new Response(null,{status:404})}});
    for(const route of ['check','dismiss','install','cancel'])assert.equal((await fetch(app.url+'/api/updates/'+route,{method:'POST',body:'{}'})).status,403);
    const token=(await(await fetch(app.url)).text()).match(/name="ixpotifai-session" content="([^"]+)"/)[1];
    const response=await fetch(app.url+'/api/updates/install',{method:'POST',headers:{'X-ixpotifai-Token':token},body:JSON.stringify({version:'9.9.9',url:'http://localhost/file'})});
    assert.equal(response.status,400);
    assert.equal((await(await fetch(app.url+'/api/updates')).json()).currentVersion,'0.1.1');
  }finally{await app?.close();if(previous===undefined)delete process.env.IXPOTIFAI_PORT;else process.env.IXPOTIFAI_PORT=previous;await fs.rm(root,{recursive:true,force:true});}
});
