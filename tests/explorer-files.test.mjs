import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {publishDownload} from '../lib/queue.mjs';
import {command,validateAudio} from '../lib/audio.mjs';

test('nome sem código preserva os bytes FLAC e não sobrescreve arquivos ou relatórios existentes',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ixpotifai-filename-'));
  try{
    const staged=path.join(dir,'staged.part');await command(['-v','error','-f','lavfi','-i','sine=duration=1','-c:a','flac','-f','flac',staged]);
    const audio=await validateAudio(staged),track={id:'1rkP1QTDKqKUNkBMqauUz7',artist:'2ZDinizz, Camila Zasoul, HHR',title:'Te Encontrar na Lapa'};
    const report={track,audio};const name=await publishDownload(staged,dir,track,report);
    assert.equal(name,'2ZDinizz, Camila Zasoul, HHR - Te Encontrar na Lapa.flac');
    assert.equal((await validateAudio(path.join(dir,name))).sha256,audio.sha256);
    assert.equal(JSON.parse(await fs.readFile(path.join(dir,name+'.json'),'utf8')).track.id,track.id);
    await assert.rejects(publishDownload(staged,dir,track,{changed:true}),{code:'EEXIST'});
    assert.equal((await validateAudio(path.join(dir,name))).sha256,audio.sha256);
    const other={artist:'Artista',title:'Outra faixa'};const orphan=path.join(dir,'Artista - Outra faixa.flac.json');await fs.writeFile(orphan,'preserve');
    await assert.rejects(publishDownload(staged,dir,other,report),{code:'EEXIST'});
    assert.equal(await fs.readFile(orphan,'utf8'),'preserve');await assert.rejects(fs.stat(path.join(dir,'Artista - Outra faixa.flac')),{code:'ENOENT'});
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
