import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {readSpotify,enrichTrack} from './metadata.mjs';
import {getCandidate,DEFAULT_PROVIDERS} from './provider.mjs';
import {remote,safeError} from './net.mjs';
import {validateAudio,remuxFLAC} from './audio.mjs';

export function filename(track) {
  const stem=`${track.artist || 'Artista'} - ${track.title || 'Faixa'}`.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/,'').slice(0,140);
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(stem)?`_${stem}`:stem;
}
export class Queue {
  constructor(root,{providers=DEFAULT_PROVIDERS,downloadRoot=path.join(root,'downloads'),processor}={}) {
    this.root=root;this.dir=path.join(root,'.skeeter');this.downloadRoot=downloadRoot;this.providers=providers;
    this.items=[];this.paused=false;this.active=null;this.serial=Promise.resolve();this.processor=processor || this.obtain.bind(this);
  }
  async init() {
    await fs.mkdir(this.dir,{recursive:true});await fs.mkdir(this.downloadRoot,{recursive:true});
    try{const saved=JSON.parse(await fs.readFile(path.join(this.dir,'state.json'),'utf8'));this.items=saved.items || [];this.paused=saved.paused ?? true;for(const item of this.items)if(['reading','matching','downloading','validating'].includes(item.status)){item.status='queued';item.progress=0;}}catch(error){if(error.code!=='ENOENT')throw new Error('A fila salva não pôde ser lida. O arquivo foi preservado.');}
    await this.persist();this.pump();return this;
  }
  persist() {
    const snapshot=JSON.stringify({version:1,paused:this.paused,items:this.items},null,2);
    const task=this.serial.then(async()=>{const temp=path.join(this.dir,'state.json.tmp');await fs.writeFile(temp,snapshot,{mode:0o600});await fs.rename(temp,path.join(this.dir,'state.json'));});
    this.serial=task.catch(()=>{});return task;
  }
  view() {return {paused:this.paused,downloadFolder:this.downloadRoot,items:this.items,providers:this.providers.map(p=>new URL(p).hostname)};}
  async add(input) {
    const values=input.split(/\s+/).filter(Boolean);if(!values.length)throw new Error('Cole pelo menos um link do Spotify.');
    // Validar o lote inteiro antes de alterar a fila.
    const {spotifyInput}=await import('./metadata.mjs');const parsed=values.map(spotifyInput);
    for(const ref of parsed){if(this.items.some(i=>i.input===ref.url && !['failed','cancelled'].includes(i.status)))continue;this.items.push({id:randomUUID(),input:ref.url,status:'queued',progress:0,createdAt:new Date().toISOString()});}
    await this.persist();this.pump();return this.view();
  }
  async action(action,id) {
    if(action==='pause'){this.paused=true;if(this.active){this.active.interruption='pause';this.active.controller.abort();}}
    else if(action==='resume')this.paused=false;
    else {
      const item=this.items.find(i=>i.id===id);if(!item)throw new Error('Faixa não encontrada.');
      if(action==='cancel'){if(['completed','expanded'].includes(item.status))throw new Error('Este item já foi concluído.');item.status='cancelled';if(this.active?.id===id)this.active.controller.abort();}
      else if(action==='retry'){if(!['failed','cancelled'].includes(item.status))throw new Error('Esta faixa já está em andamento.');item.status='queued';item.progress=0;delete item.error;}
      else throw new Error('Ação desconhecida.');
    }
    await this.persist();this.pump();return this.view();
  }
  async pump() {
    if(this.active || this.paused)return;
    const item=this.items.find(i=>i.status==='queued');if(!item)return;
    const controller=new AbortController();this.active={id:item.id,controller};
    try{await this.processor(item,controller.signal);}catch(error){if(item.status==='cancelled'){}else if(controller.signal.aborted && (this.paused || this.active.interruption==='pause')){item.status='queued';item.progress=0;}else{item.status='failed';item.error=safeError(error);}}
    finally{this.active=null;await this.persist();this.pump();}
  }
  async update(item,changes) {Object.assign(item,changes);await this.persist();}
  async obtain(item,signal) {
    await this.update(item,{status:'reading',error:undefined});
    let tracks=item.track?[item.track]:await readSpotify(item.input,signal);
    if(signal.aborted)throw signal.reason;
    if(tracks.length>1) {
      // Expandir a lista e preservar sua origem; nunca declarar a lista como arquivo concluído.
      for(const track of tracks)if(!this.items.some(i=>i.track?.id===track.id && !['failed','cancelled'].includes(i.status)))this.items.push({id:randomUUID(),input:track.spotifyUrl,track,status:'queued',progress:0,createdAt:new Date().toISOString()});
      item.status='expanded';item.count=tracks.length;await this.persist();return;
    }
    const track=await enrichTrack(tracks[0],signal);await this.update(item,{track,status:'matching'});
    let candidate;const errors=[];
    for(const base of this.providers) {
      if(signal.aborted)throw signal.reason;
      try{candidate=await getCandidate(track,base,signal);break;}catch(error){errors.push(safeError(error));}
    }
    if(!candidate)throw new Error(errors.join(' ') || 'Nenhuma fonte disponível.');
    if(!/^[a-f0-9-]{36}$/.test(item.id))throw new Error('Identificador da fila inválido.');
    const work=path.join(this.dir,`download-${item.id}`);
    if(path.dirname(work)!==this.dir)throw new Error('Pasta temporária inválida.');
    await fs.rm(work,{recursive:true,force:true});await fs.mkdir(work,{recursive:true});
    try {
      const raw=path.join(work,candidate.type==='dash'?'segments.m4a':'audio.flac');
      let done=0,total=0;await this.update(item,{status:'downloading',source:candidate.source,identity:candidate.identity,progress:0});
      const handle=await fs.open(raw,'wx');let last=0;
      try {
        for(const url of candidate.urls) {
          const response=await remote(url,{signal,timeout:300000});total+=Number(response.headers.get('content-length') || 0);
          for await(const chunk of response.body) {
            if(signal.aborted)throw signal.reason;
            await handle.write(chunk);done+=chunk.length;
            if(Date.now()-last>750){item.bytes=done;item.progress=candidate.type==='file' && total?Math.min(95,done/total*95):Math.min(95,candidate.urls.indexOf(url)/candidate.urls.length*95);last=Date.now();}
          }
        }
      }finally{await handle.close();}
      const audio=candidate.type==='dash'?path.join(work,'audio.flac'):raw;
      if(candidate.type==='dash')await remuxFLAC(raw,audio,signal);
      await this.update(item,{status:'validating',progress:97});
      const validation=await validateAudio(audio,{duration:track.duration,bits:candidate.bits,rate:candidate.rate,signal});
      if(signal.aborted)throw signal.reason;
      const basename=`${filename(track)} [${track.id}].flac`;const destination=path.join(this.downloadRoot,basename);
      // Exclusive creation prevents replacing any existing file, including an unrelated download.
      // Stage inside the destination volume, then publish by exclusive hard link.
      const staged=path.join(this.downloadRoot,`.${item.id}.part`);
      await fs.copyFile(audio,staged,fs.constants.COPYFILE_EXCL);
      const report={track,source:candidate.source,sourceId:candidate.sourceId,identity:candidate.identity,qualityScope:candidate.qualityScope || 'Qualidade solicitada ao conector; comparação global não comprovada',audio:validation,acquiredAt:new Date().toISOString(),transport:candidate.type==='dash'?'FLAC remuxado sem recodificação':'FLAC preservado da fonte',provenance:'O formato e a integridade foram validados. A origem anterior do áudio e a equivalência do master do Spotify não foram comprovadas.'};
      let published=false;
      try {
        if(signal.aborted)throw signal.reason;
        await fs.link(staged,destination);published=true;
        await fs.writeFile(`${destination}.json`,JSON.stringify(report,null,2),{flag:'wx',mode:0o600});
      }catch(error){if(published)await fs.unlink(destination);throw error;}finally{await fs.unlink(staged);}
      await this.update(item,{status:'completed',progress:100,bytes:validation.bytes,audio:validation,file:basename,completedAt:report.acquiredAt});
    }finally{await fs.rm(work,{recursive:true,force:true});}
  }
  async close(){this.paused=true;if(this.active){this.active.interruption='pause';this.active.controller.abort();}while(this.active)await new Promise(r=>setTimeout(r,30));await this.persist();}
}
