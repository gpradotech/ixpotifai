import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {friendlyError} from '../public/errors.js';
import {listPage} from '../public/list.js';
import {Queue} from '../lib/queue.mjs';

test('erros do sistema têm mensagens úteis sem caminhos, URLs ou códigos técnicos',()=>{
  const duplicate="EEXIST: file already exists, link 'C:\\Users\\user\\downloads\\temp.part' -> 'C:\\Users\\user\\downloads\\music.flac'";
  assert.equal(friendlyError(duplicate),'Ops! Essa música já existe em sua pasta.');assert.equal(friendlyError(Object.assign(new Error('duplicate'),{code:'EEXIST'})),'Ops! Essa música já existe em sua pasta.');
  assert.match(friendlyError(Object.assign(new Error('disk'),{code:'ENOSPC'})),/sem espaço/);assert.match(friendlyError(new Error('A fonte respondeu HTTP 429.')),/Aguarde/);
  for(const error of [duplicate,"EPERM: permission denied C:\\Users\\user\\music.flac",'fetch failed https://cdn.example.org/music?token=secret','Unknown failure /home/user/audio']){const text=friendlyError(error);assert.doesNotMatch(text,/C:\\|\/home\/|secret|https?:|EEXIST|EPERM/);assert.equal(friendlyError(text),text);}
});
test('paginação mantém todos os itens e limita cada página a dez, inclusive após limpar a lista',()=>{
  const items=Array.from({length:23},(_,index)=>({id:index}));const first=listPage(items,1),second=listPage(items,2),third=listPage(items,3);assert.equal(first.items.length,10);assert.equal(second.items.length,10);assert.equal(third.items.length,3);assert.equal(third.pages,3);assert.deepEqual([...first.items,...second.items,...third.items],items);assert.equal(listPage(items,9).page,3);assert.equal(listPage([],3).page,1);assert.equal(listPage(items.slice(0,5),3).page,1);assert.equal(listPage(Array.from({length:11},(_,id)=>id),2).items.length,1);
});
test('máximo de cinco links por envio é atômico e não limita o total da fila',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'ixpotifai-batch-'));let queue;
  const links=Array.from({length:15},(_,index)=>`https://open.spotify.com/track/${String(index).padStart(22,'0')}`);
  try{queue=await new Queue(root).init();await queue.action('pause');await assert.rejects(queue.add(links.slice(0,6).join('\n')),/até 5/);assert.equal(queue.items.length,0);for(let i=0;i<links.length;i+=5)await queue.add(links.slice(i,i+5).join('\n'));assert.equal(queue.items.length,15);}finally{await queue?.close();await fs.rm(root,{recursive:true,force:true});}
});
