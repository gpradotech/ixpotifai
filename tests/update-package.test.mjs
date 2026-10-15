import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {decodePackage,managedPath,newerVersion,sha256} from '../lib/update-package.mjs';
import {prepareUpdate,applyPreparedUpdate,rollbackUpdate,confirmUpdate,recoverUpdate,readJSON} from '../lib/update-installer.mjs';
import {fixture,artifact,mutatedPackage} from './update-fixtures.mjs';

test('pacote valida versão, checksum, caminhos, duplicatas e exclusão de dados pessoais',async()=>{
  const result=await artifact(),data=decodePackage(result.compressed,result);
  assert.equal(data.version,'0.1.2');assert.ok(data.files.every(file=>!file.path.startsWith('downloads/') && !file.path.startsWith('.ixpotifai/') && !file.path.startsWith('node_modules/')));
  assert.equal(newerVersion('v0.1.10','0.1.2'),true);assert.equal(newerVersion('0.1.2','0.1.2'),false);assert.equal(newerVersion('1.0.0-beta','0.1.2'),false);
  assert.throws(()=>decodePackage(result.compressed,{...result,digest:'0'.repeat(64)}),/integridade/);
  for(const name of ['../server.mjs','public/../../state.json','C:/escape','public\\escape','.ixpotifai/state.json','downloads/a.flac','lib/CON','lib/a:stream','lib/.env','lib/.git/config'])assert.equal(managedPath(name),false,name);
  for(const mutate of [data=>data.files.push({...data.files[0]}),data=>data.files[0].path='../escape',data=>data.files[0].path='.ixpotifai/state.json',data=>data.files[0].content=Buffer.from('changed').toString('base64'),data=>data.runnerProtocol=2]) {
    const bad=mutatedPackage(structuredClone(data),mutate);assert.throws(()=>decodePackage(bad.compressed,bad));
  }
});

test('instala e confirma sem tocar em áudios, fila, configurações ou dependências iguais',async()=>{
  const root=await fixture(),data=await artifact();
  try {
    const queue=await fs.readFile(path.join(root,'.ixpotifai/state.json'));
    await prepareUpdate(root,data.compressed,data);
    await applyPreparedUpdate(root,{install:()=>assert.fail('Dependências não mudaram')});
    assert.equal(JSON.parse(await fs.readFile(path.join(root,'package.json'))).version,'0.1.2');
    assert.deepEqual(await fs.readFile(path.join(root,'.ixpotifai/state.json')),queue);
    assert.equal(await fs.readFile(path.join(root,'downloads/preserve.flac'),'utf8'),'audio untouched');
    assert.equal(await fs.readFile(path.join(root,'node_modules/preserve.txt'),'utf8'),'dependencies');
    await confirmUpdate(root);
    const home=path.join(root,'.ixpotifai/updates');assert.equal((await readJSON(path.join(home,'journal.json'))).status,'committed');
    assert.equal((await readJSON(path.join(home,'installed.json'))).version,'0.1.2');
    assert.equal(await readJSON(path.join(home,'pending.json')),null);
  }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('reinício interrompido restaura a aplicação e o estado da fila antes de iniciar',async()=>{
  const root=await fixture(),data=await artifact();
  try {
    const original=await fs.readFile(path.join(root,'server.mjs')),queue=await fs.readFile(path.join(root,'.ixpotifai/state.json'));
    await prepareUpdate(root,data.compressed,data);await applyPreparedUpdate(root);
    await fs.writeFile(path.join(root,'.ixpotifai/state.json'),'modified by failed version');
    await recoverUpdate(root);
    assert.deepEqual(await fs.readFile(path.join(root,'server.mjs')),original);assert.deepEqual(await fs.readFile(path.join(root,'.ixpotifai/state.json')),queue);
    assert.equal(JSON.parse(await fs.readFile(path.join(root,'package.json'))).version,'0.1.1');
    assert.equal((await readJSON(path.join(root,'.ixpotifai/updates/result.json'))).phase,'restored');
  }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('falha de dependências preserva a versão anterior; dependências novas também podem ser revertidas',async()=>{
  const root=await fixture(),data=await artifact('0.1.2',{dependency:'2'});
  try {
    await prepareUpdate(root,data.compressed,data);
    await assert.rejects(applyPreparedUpdate(root,{install:async()=>{throw new Error('offline');}}),/offline/);
    assert.equal(JSON.parse(await fs.readFile(path.join(root,'package.json'))).version,'0.1.1');
    assert.equal(await fs.readFile(path.join(root,'node_modules/preserve.txt'),'utf8'),'dependencies');
    await prepareUpdate(root,data.compressed,data);
    await applyPreparedUpdate(root,{install:async stage=>{await fs.mkdir(path.join(stage,'node_modules'));await fs.writeFile(path.join(stage,'node_modules/new.txt'),'new');}});
    assert.equal(await fs.readFile(path.join(root,'node_modules/new.txt'),'utf8'),'new');
    await rollbackUpdate(root);
    assert.equal(await fs.readFile(path.join(root,'node_modules/preserve.txt'),'utf8'),'dependencies');
  }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('instalações de desenvolvimento e arquivos alterados não são sobrescritos',async()=>{
  const root=await fixture(),data=await artifact();
  try {
    await fs.mkdir(path.join(root,'.git'));await prepareUpdate(root,data.compressed,data);
    await assert.rejects(applyPreparedUpdate(root),/desenvolvimento/);await fs.rmdir(path.join(root,'.git'));
    await applyPreparedUpdate(root);await confirmUpdate(root);
    await fs.writeFile(path.join(root,'public/app.js'),'user change');
    const next=await artifact('0.1.3');await prepareUpdate(root,next.compressed,next);
    await assert.rejects(applyPreparedUpdate(root),/modificados/);
    assert.equal(await fs.readFile(path.join(root,'public/app.js'),'utf8'),'user change');
    assert.equal(JSON.parse(await fs.readFile(path.join(root,'package.json'))).version,'0.1.2');
  }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('npm real prepara dependências no estágio antes da troca e permite restaurar as anteriores',async()=>{
  const root=await fixture(),data=await artifact('0.1.2',{dependency:null});
  try {
    await prepareUpdate(root,data.compressed,data);await applyPreparedUpdate(root);
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(root,'package.json'))).dependencies,{});
    assert.equal((await fs.stat(path.join(root,'node_modules'))).isDirectory(),true);
    await rollbackUpdate(root);
    assert.equal(await fs.readFile(path.join(root,'node_modules/preserve.txt'),'utf8'),'dependencies');
  }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('atalho dentro da instalação não permite escrever fora da pasta do aplicativo',async()=>{
  const root=await fixture(),outside=await fixture(),data=await artifact();
  try {
    await fs.rename(path.join(root,'public'),path.join(root,'original-public'));
    await fs.symlink(path.join(outside,'public'),path.join(root,'public'),process.platform==='win32'?'junction':'dir');
    const original=await fs.readFile(path.join(outside,'public/app.js'));
    await prepareUpdate(root,data.compressed,data);
    await assert.rejects(applyPreparedUpdate(root),/atalhos/);
    assert.deepEqual(await fs.readFile(path.join(outside,'public/app.js')),original);
    assert.equal(JSON.parse(await fs.readFile(path.join(root,'package.json'))).version,'0.1.1');
  }finally{await fs.rm(root,{recursive:true,force:true});await fs.rm(outside,{recursive:true,force:true});}
});
