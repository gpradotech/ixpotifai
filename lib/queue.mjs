import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {isRateLimit,rateLimitDelay} from './rate-limit.mjs';
import {readSpotify,enrichTrack,spotifyInput} from './metadata.mjs';
import {getCandidate,DEFAULT_PROVIDERS} from './provider.mjs';
import {remote,safeError} from './net.mjs';
import {validateAudio,remuxFLAC} from './audio.mjs';
import {MAX_LINKS} from '../public/list.js';

export function filename(track) {
  const stem=`${track.artist || 'Artista'} - ${track.title || 'Faixa'}`.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/,'').slice(0,140);
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(stem)?`_${stem}`:stem;
}
export async function publishDownload(staged,folder,track,signal) {
  const basename=`${filename(track)}.flac`,destination=path.join(folder,basename);
  if(signal?.aborted)throw signal.reason;
  await fs.link(staged,destination);
  return basename;
}
export class Queue {
  constructor(root,{providers=DEFAULT_PROVIDERS,downloadRoot=path.join(root,'downloads'),processor,metadataReader=readSpotify,now=Date.now,wait=(ms,signal)=>delay(ms,undefined,{signal})}={}) {
    this.root=root;this.dir=path.join(root,'.ixpotifai');this.downloadRoot=downloadRoot;this.defaultDownloadRoot=path.resolve(root,'downloads');this.providers=providers;
    this.items=[];this.clearedItems=[];this.removedItems=[];this.nextSequence=1;this.clearing=false;this.preparing=false;this.configuringFolder=false;this.paused=false;this.active=null;this.serial=Promise.resolve();this.processor=processor || this.obtain.bind(this);this.metadataReader=metadataReader;
    this.now=now;this.wait=wait;this.rateLimitUntil=0;
  }
  async init() {
    await fs.mkdir(this.dir,{recursive:true});await fs.mkdir(this.defaultDownloadRoot,{recursive:true});await fs.mkdir(this.downloadRoot,{recursive:true});
    let saved={};try{saved=JSON.parse(await fs.readFile(path.join(this.dir,'state.json'),'utf8'));this.items=saved.items || [];this.clearedItems=saved.clearedItems || [];this.removedItems=saved.removedItems || [];this.downloadRoot=saved.downloadFolder || this.downloadRoot;this.paused=saved.paused ?? true;for(const item of this.items)if(['reading','matching','downloading','validating'].includes(item.status)){item.status='queued';item.progress=0;}}catch(error){if(error.code!=='ENOENT')throw new Error('A fila salva não pôde ser lida. O arquivo foi preservado.');}
    this.rateLimitUntil=Number.isFinite(saved.rateLimitUntil)?saved.rateLimitUntil:0;
    for(const item of [...this.items,...this.clearedItems,...this.removedItems])if(Number.isSafeInteger(item.sequence) && item.sequence>0)this.nextSequence=Math.max(this.nextSequence,item.sequence+1);
    if(Number.isSafeInteger(saved.nextSequence))this.nextSequence=Math.max(this.nextSequence,saved.nextSequence);
    // Migra a fila anterior uma vez, preservando sua ordem de inclusão.
    for(const item of this.items)if(!Number.isSafeInteger(item.sequence) || item.sequence<1)item.sequence=this.nextSequence++;
    await fs.mkdir(this.downloadRoot,{recursive:true});
    await this.persist();this.pump();return this;
  }
  persist() {
    const snapshot=JSON.stringify({version:1,paused:this.paused,rateLimitUntil:this.rateLimitUntil,nextSequence:this.nextSequence,downloadFolder:this.downloadRoot,items:this.items,clearedItems:this.clearedItems,removedItems:this.removedItems},null,2);
    const task=this.serial.then(async()=>{const temp=path.join(this.dir,'state.json.tmp');await fs.writeFile(temp,snapshot,{mode:0o600});await fs.rename(temp,path.join(this.dir,'state.json'));});
    this.serial=task.catch(()=>{});return task;
  }
  view() {return {capabilities:['retry-feedback-v1'],rateLimitUntil:this.rateLimitUntil,paused:this.paused,preparing:this.preparing,readyBatches:[...new Set(this.items.filter(item=>item.status==='prepared').map(item=>item.batchId))],canUndoClear:this.clearedItems.length>0,downloadFolder:this.downloadRoot,defaultDownloadFolder:this.defaultDownloadRoot,items:this.items.map(item=>({...item,error:item.error?safeError(item.error):undefined})),providers:this.providers.map(p=>new URL(p).hostname)};}
  async setDownloadFolder(directory) {
    if(this.active || this.preparing || this.configuringFolder)throw new Error('Aguarde os downloads terminarem para escolher outra pasta.');
    this.configuringFolder=true;
    try {
      if(!path.isAbsolute(directory))throw new Error('Escolha uma pasta válida para salvar suas músicas.');
      const target=await fs.realpath(directory);if(!(await fs.stat(target)).isDirectory())throw new Error('Escolha uma pasta válida para salvar suas músicas.');
      const probe=path.join(target,`.ixpotifai-write-check-${randomUUID()}`);await fs.writeFile(probe,'',{flag:'wx'});await fs.unlink(probe);
      for(const item of [...this.items,...this.clearedItems,...this.removedItems])if(item.file && !item.downloadFolder)item.downloadFolder=this.downloadRoot;
      this.downloadRoot=target;await this.persist();return this.view();
    }finally{this.configuringFolder=false;this.pump();}
  }
  async prepare(input,{replacingId}={}) {
    if(this.preparing)throw new Error('Estamos preparando suas músicas. Aguarde um instante.');
    const replaced=this.items.find(item=>item.id===replacingId);
    if(replacingId && !this.items.some(item=>item.id===replacingId && ['failed','cancelled'].includes(item.status)))throw new Error('Esta faixa já está em andamento.');
    const values=input.split(/\s+/).filter(Boolean);if(!values.length)throw new Error('Cole pelo menos um link do Spotify.');
    if(values.length>MAX_LINKS)throw new Error('Você pode enviar até 5 links por vez. Adicione os próximos em outro envio.');
    const refs=values.map(spotifyInput),unique=new Set();
    for(const ref of refs){if(unique.has(ref.url))throw new Error('Ops! Esse link já está em outro campo.');unique.add(ref.url);if(this.items.some(item=>item.id!==replacingId && (item.input===ref.url || item.sourceInputs?.includes(ref.url))))throw new Error('Ops! Essa música já está na sua lista.');}
    const batchId=randomUUID();this.preparing=true;
    try {
      const results=await Promise.allSettled(refs.map(ref=>this.metadataReader(ref.url)));
      const tracks=new Map(),failed=[];
      results.forEach((result,index)=>{
        if(result.status==='rejected'){
          const retryAt=isRateLimit(result.reason)?this.now()+rateLimitDelay(result.reason):undefined;
          if(retryAt)this.rateLimitUntil=Math.max(this.rateLimitUntil,retryAt);
          failed.push({id:randomUUID(),input:refs[index].url,status:'failed',error:safeError(result.reason),retryAt,rateLimitSource:isRateLimit(result.reason)?result.reason.source:undefined,progress:0,createdAt:new Date().toISOString()});return;
        }
        for(const track of result.value){const url=spotifyInput(track.spotifyUrl || `https://open.spotify.com/track/${track.id}`).url;if(!track.title || !track.artist)throw new Error('Não conseguimos reconhecer essa música agora. Confira o link e tente novamente.');if(this.items.some(item=>item.id!==replacingId && item.input===url))continue;if(!tracks.has(url))tracks.set(url,{track:{...track,spotifyUrl:url},sourceInputs:[]});tracks.get(url).sourceInputs.push(refs[index].url);}
      });
      const added=[];
      for(const {track,sourceInputs} of tracks.values()) {
        const archived=[...this.clearedItems,...this.removedItems].find(item=>item.input===track.spotifyUrl && item.status==='completed');
        if(archived?.file && path.basename(archived.file)===archived.file) {
          try{const audio=await validateAudio(path.join(archived.downloadFolder || this.downloadRoot,archived.file),{duration:track.duration,bits:archived.audio?.bits,rate:archived.audio?.rate});if(archived.audio?.sha256 && audio.sha256!==archived.audio.sha256)throw new Error('O arquivo salvo foi alterado desde o último download.');added.push({...structuredClone(archived),track,audio,sourceInputs});continue;}catch(error){if(error.code!=='ENOENT')throw error;}
        }
        added.push({id:randomUUID(),input:track.spotifyUrl,track,sourceInputs,batchId,status:'prepared',progress:0,createdAt:new Date().toISOString()});
      }
      if(!added.length && !failed.length)throw new Error('Ops! Essas músicas já estão na sua lista.');
      if(replacingId)this.items=this.items.filter(item=>item.id!==replacingId);
      for(const item of [...added,...failed])item.sequence=item.input===replaced?.input?replaced.sequence:this.nextSequence++;
      this.items.push(...added,...failed);await this.persist();this.preparing=false;return this.view();
    }finally{this.preparing=false;this.pump();}
  }
  async startBatch(batchId) {
    for(const item of this.items)if(item.batchId===batchId && item.status==='prepared')item.status='queued';
    await this.persist();this.pump();return this.view();
  }
  async add(input) {
    const values=input.split(/\s+/).filter(Boolean);if(!values.length)throw new Error('Cole pelo menos um link do Spotify.');
    if(values.length>MAX_LINKS)throw new Error('Você pode enviar até 5 links por vez. Adicione os próximos em outro envio.');
    // Validar o lote inteiro antes de alterar a fila.
    const {spotifyInput}=await import('./metadata.mjs');const parsed=values.map(spotifyInput);
    for(const ref of parsed){
      if(this.items.some(i=>i.input===ref.url && !['failed','cancelled'].includes(i.status)))continue;
      const archived=[...this.clearedItems,...this.removedItems].find(item=>item.input===ref.url && item.status==='completed');
      if(archived?.file && path.basename(archived.file)===archived.file) {
        try {
          const audio=await validateAudio(path.join(archived.downloadFolder || this.downloadRoot,archived.file),{duration:archived.track?.duration,bits:archived.audio?.bits,rate:archived.audio?.rate});
          if(archived.audio?.sha256 && archived.audio.sha256!==audio.sha256)throw new Error('O arquivo salvo foi alterado desde o último download.');
          this.items.push({...structuredClone(archived),audio,sequence:this.nextSequence++});continue;
        }catch(error){if(error.code!=='ENOENT')throw error;}
      }
      this.items.push({id:randomUUID(),sequence:this.nextSequence++,input:ref.url,status:'queued',progress:0,createdAt:new Date().toISOString()});
    }
    await this.persist();this.pump();return this.view();
  }
  async action(action,id) {
    let actionResult;
    if(!['clear','undo-clear','pause','resume','retry-failed','remove','cancel','retry'].includes(action))throw new Error('Não conseguimos reconhecer este controle. Reinicie o aplicativo e atualize a página.');
    if(action==='clear') {
      if(this.preparing)throw new Error('Estamos preparando suas músicas. Aguarde um instante.');
      if(this.clearing)throw new Error('A lista já está sendo limpa.');
      if(!this.items.length)return this.view();
      this.clearing=true;
      const removed=this.items,interrupted=this.active?.id;
      const recover=item=>item.id===interrupted && item.status!=='completed'?{...item,status:'queued',progress:0,error:undefined}:item;
      this.clearedItems=structuredClone(removed).map(recover);this.items=[];
      try {
        if(this.active){removed.find(item=>item.id===interrupted).status='cancelled';this.active.controller.abort();}
        await this.persist();
        while(this.active)await new Promise(resolve=>setTimeout(resolve,30));
        this.clearedItems=structuredClone(removed).map(recover);
      }finally{this.clearing=false;}
    }
    else if(action==='undo-clear') {
      if(this.clearing)throw new Error('Aguarde a limpeza terminar.');
      const ids=new Set(this.items.map(item=>item.id));
      this.items=[...this.clearedItems.filter(item=>!ids.has(item.id)),...this.items];this.clearedItems=[];
      for(const item of this.items)if(!Number.isSafeInteger(item.sequence) || item.sequence<1)item.sequence=this.nextSequence++;
    }
    else if(action==='pause'){this.paused=true;if(this.active){this.active.interruption='pause';this.active.controller.abort();}}
    else if(action==='resume')this.paused=false;
    else if(action==='retry-failed') {
      if(this.preparing || this.clearing)throw new Error('Aguarde a preparação da lista terminar.');
      const retried=this.items.filter(item=>item.status==='failed');
      for(const item of retried) {
        item.status='queued';item.progress=0;item.rateLimitAttempts=0;delete item.rateLimitExhausted;delete item.error;
      }
      actionResult={type:'retry-failed',ids:retried.map(item=>item.id),count:retried.length};
      this.paused=false;
    }
    else {
      const item=this.items.find(i=>i.id===id);if(!item)throw new Error('Faixa não encontrada.');
      if(action==='remove'){
        if(this.active?.id===id){item.status='cancelled';this.active.controller.abort();while(this.active?.id===id)await new Promise(resolve=>setTimeout(resolve,30));}
        this.items=this.items.filter(current=>current.id!==id);this.removedItems=this.removedItems.filter(current=>current.id!==id);this.removedItems.push(structuredClone(item));
      }
      else if(action==='cancel'){if(['completed','expanded'].includes(item.status))throw new Error('Este item já foi concluído.');item.status='cancelled';if(this.active?.id===id)this.active.controller.abort();}
      else if(action==='retry'){if(!['failed','cancelled'].includes(item.status))throw new Error('Esta faixa já está em andamento.');if(!item.track?.cover)return this.prepare(item.input,{replacingId:item.id});item.status='queued';item.progress=0;item.rateLimitAttempts=0;delete item.rateLimitExhausted;delete item.error;}
      else throw new Error('Ação desconhecida.');
    }
    await this.persist();this.pump();return {...this.view(),...(actionResult?{actionResult}:{})};
  }
  async pump() {
    if(this.active || this.paused || this.clearing || this.preparing || this.configuringFolder)return;
    const item=this.items.find(i=>['queued','waiting'].includes(i.status));if(!item)return;
    const controller=new AbortController();this.active={id:item.id,controller};
    try {
      while(true) {
        while(Math.max(this.rateLimitUntil,item.retryAt || 0)>this.now()) {
          const until=Math.max(this.rateLimitUntil,item.retryAt || 0);
          await this.update(item,{status:'waiting',retryAt:until,error:undefined});
          await this.wait(Math.max(0,Math.min(until-this.now(),2147483647)),controller.signal);
        }
        if(controller.signal.aborted)throw controller.signal.reason;
        delete item.retryAt;
        try{await this.processor(item,controller.signal);delete item.rateLimitAttempts;break;}
        catch(error) {
          if(controller.signal.aborted || !isRateLimit(error))throw error;
          const attempt=(item.rateLimitAttempts || 0)+1;
          item.rateLimitSource=error.source;
          this.rateLimitUntil=this.now()+rateLimitDelay(error,attempt);
          item.retryAt=this.rateLimitUntil;
          if(attempt>3){item.rateLimitExhausted=true;this.paused=true;throw error;}
          await this.update(item,{status:'waiting',rateLimitAttempts:attempt,retryAt:this.rateLimitUntil,error:undefined,progress:0});
        }
      }
    }catch(error){if(item.status==='cancelled'){}else if(controller.signal.aborted && (this.paused || this.active.interruption==='pause')){item.status='queued';item.progress=0;}else{item.status='failed';item.error=safeError(error);}}
    finally{this.active=null;await this.persist();this.pump();}
  }
  async update(item,changes) {Object.assign(item,changes);await this.persist();}
  async obtain(item,signal) {
    await this.update(item,{status:'reading',error:undefined});
    let tracks=item.track?[item.track]:await readSpotify(item.input,signal);
    if(signal.aborted)throw signal.reason;
    if(tracks.length>1) {
      // Expandir a lista e preservar sua origem; nunca declarar a lista como arquivo concluído.
      for(const track of tracks)if(!this.items.some(i=>i.track?.id===track.id && !['failed','cancelled'].includes(i.status)))this.items.push({id:randomUUID(),sequence:this.nextSequence++,input:track.spotifyUrl,track,status:'queued',progress:0,createdAt:new Date().toISOString()});
      item.status='expanded';item.count=tracks.length;await this.persist();return;
    }
    const track=await enrichTrack(tracks[0],signal);await this.update(item,{track,status:'matching'});
    let candidate;const errors=[];
    for(const base of this.providers) {
      if(signal.aborted)throw signal.reason;
      try{candidate=await getCandidate(track,base,signal);break;}catch(error){if(isRateLimit(error) || signal.aborted)throw error;errors.push(safeError(error));}
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
      // Exclusive creation prevents replacing any existing file, including an unrelated download.
      // Stage inside the destination volume, then publish by exclusive hard link.
      const staged=path.join(this.downloadRoot,`.${item.id}.part`);
      await fs.copyFile(audio,staged,fs.constants.COPYFILE_EXCL);
      const report={track,source:candidate.source,sourceId:candidate.sourceId,identity:candidate.identity,qualityScope:candidate.qualityScope || 'Qualidade solicitada ao conector; comparação global não comprovada',audio:validation,acquiredAt:new Date().toISOString(),transport:candidate.type==='dash'?'FLAC remuxado sem recodificação':'FLAC preservado da fonte',provenance:'O formato e a integridade foram validados. A origem anterior do áudio e a equivalência do master do Spotify não foram comprovadas.'};
      let basename;
      try {
        basename=await publishDownload(staged,this.downloadRoot,track,signal);
      }finally{await fs.unlink(staged);}
      await this.update(item,{status:'completed',progress:100,bytes:validation.bytes,audio:validation,report,file:basename,downloadFolder:this.downloadRoot,completedAt:report.acquiredAt});
    }finally{await fs.rm(work,{recursive:true,force:true});}
  }
  async close(){this.paused=true;if(this.active){this.active.interruption='pause';this.active.controller.abort();}while(this.active)await new Promise(r=>setTimeout(r,30));await this.persist();}
}
