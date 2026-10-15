import fs from 'node:fs/promises';
import path from 'node:path';
import {remote,smallBody} from './net.mjs';
import {newerVersion,MAX_PACKAGE_BYTES} from './update-package.mjs';
import {prepareUpdate,updateHome,readJSON,writeJSON} from './update-installer.mjs';
import {retryAfterMilliseconds} from './rate-limit.mjs';

export const RELEASE_API='https://api.github.com/repos/gpradotech/ixpotifai/releases/latest';
export const CHECK_INTERVAL=6*60*60*1000;
export function releaseCandidate(data,current) {
  if(!data || data.draft || data.prerelease || !/^v\d+\.\d+\.\d+$/.test(data.tag_name || '') || !newerVersion(data.tag_name,current))return null;
  const version=data.tag_name.slice(1),name=`ixpotifai-${version}.update.json.gz`;
  const asset=data.assets?.find(item=>item.name===name && item.state==='uploaded');
  const url=`https://github.com/gpradotech/ixpotifai/releases/download/v${version}/${name}`;
  if(!asset || asset.browser_download_url!==url || !/^sha256:[a-f0-9]{64}$/.test(asset.digest || '') || !Number.isSafeInteger(asset.size) || asset.size<1 || asset.size>MAX_PACKAGE_BYTES)return null;
  return {version,url,digest:asset.digest.slice(7),bytes:asset.size,notes:String(data.body || '').slice(0,4000)};
}
export class UpdateManager {
  constructor(root,queue,{request=remote,now=Date.now,autoCheck=process.env.IXPOTIFAI_UPDATE_CHECKS!=='0',managed=process.env.IXPOTIFAI_MANAGED_RUNNER==='1',onRestart}={}) {
    this.root=root;this.queue=queue;this.request=request;this.now=now;this.autoCheck=autoCheck;this.managed=managed;this.onRestart=onRestart;
    this.enabled=false;this.phase='idle';this.progress=0;this.available=null;this.checkedAt=null;this.checkError='';this.error='';this.checking=false;this.nextCheckAt=0;this.prefs={};this.closed=false;
  }
  async init() {
    let pkg;try{pkg=JSON.parse(await fs.readFile(path.join(this.root,'package.json'),'utf8'));}catch(error){if(error.code==='ENOENT')return this;throw error;}
    if(pkg.name!=='ixpotifai')return this;
    this.root=await fs.realpath(this.root);this.version=pkg.version;this.home=await updateHome(this.root);this.enabled=true;
    this.prefs=await readJSON(path.join(this.home,'preferences.json'),{});
    this.checkedAt=this.prefs.checkedAt || null;this.nextCheckAt=this.prefs.nextCheckAt || 0;this.retryCheckAt=this.prefs.retryCheckAt || 0;
    this.available=releaseCandidate(this.prefs.release,this.version);
    const result=await readJSON(path.join(this.home,'result.json'));
    if(result?.phase==='restored'){this.phase='restored';this.error=result.message;}
    else if(result?.phase==='updated' && result.version===this.version)this.phase='updated';
    if(process.env.IXPOTIFAI_UPDATE_BOOT==='1')this.phase='restarting';
    this.gitCopy=await fs.lstat(path.join(this.root,'.git')).then(()=>true,error=>{if(error.code==='ENOENT')return false;throw error;});
    if(this.autoCheck){this.timer=setInterval(()=>{if(this.now()>=this.nextCheckAt)this.check().catch(()=>{});},60000);this.timer.unref();this.check().catch(()=>{});}
    return this;
  }
  busy(){return !!(this.queue.active || this.queue.preparing || this.queue.configuringFolder || (!this.queue.paused && this.queue.items.some(item=>['prepared','queued','waiting','reading','matching','downloading','validating'].includes(item.status))));}
  view() {
    return {enabled:this.enabled,currentVersion:this.version || null,available:this.available?{version:this.available.version,notes:this.available.notes}:null,checkedAt:this.checkedAt,checking:this.checking,checkError:this.checkError,phase:this.phase,progress:this.progress,error:this.error,dismissedVersion:this.prefs.dismissedVersion || null,busy:this.enabled?this.busy():false,canInstall:!!(this.managed && !this.gitCopy && this.onRestart),installNotice:this.gitCopy?'Esta cópia de desenvolvimento é atualizada pelo Git. A atualização pelo aplicativo está disponível na instalação extraída do ZIP.':!this.managed?'Feche o aplicativo e abra pelo launcher para habilitar a atualização com reinício automático.':''};
  }
  async check({manual=false}={}) {
    if(!this.enabled || this.closed || this.checking || ['downloading','waiting-downloads','restarting'].includes(this.phase))return this.view();
    if(this.now()<this.retryCheckAt){this.checkError='Não conseguimos verificar agora: o serviço de atualizações pediu uma pausa. Tente novamente mais tarde.';return this.view();}
    if(this.now()<this.nextCheckAt && (!manual || this.now()-(this.checkedAt || 0)<60000))return this.view();
    this.checking=true;this.checkError='';
    try {
      const headers={Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
      if(this.prefs.etag && !/[\r\n]/.test(this.prefs.etag))headers['If-None-Match']=this.prefs.etag;
      const response=await this.request(RELEASE_API,{timeout:15000,headers,acceptStatuses:[304,404,403,429]});
      this.checkedAt=this.now();this.nextCheckAt=this.now()+CHECK_INTERVAL;
      if([403,429].includes(response.status)) {
        const after=retryAfterMilliseconds(response.headers.get('retry-after'),this.now()) || 60000;
        const reset=Number(response.headers.get('x-ratelimit-reset'))*1000;
        this.nextCheckAt=Math.max(this.now()+after,Number.isFinite(reset)?reset:0);
        this.retryCheckAt=this.nextCheckAt;
        this.checkError='Não conseguimos verificar agora: o serviço de atualizações pediu uma pausa. Tente novamente mais tarde.';
        await response.body?.cancel();
      }else if(response.status===404){this.available=null;this.prefs.release=null;delete this.prefs.etag;await response.body?.cancel();}
      else if(response.status===304){await response.body?.cancel();}
      else {
        const data=JSON.parse(await smallBody(response,2*1024*1024));
        this.available=releaseCandidate(data,this.version);this.prefs.release=data;
        this.prefs.etag=response.headers.get('etag')?.slice(0,512);
      }
    }catch{this.checkedAt=this.now();this.nextCheckAt=this.now()+60000;this.checkError='Não conseguimos verificar atualizações agora. Seus downloads podem continuar normalmente.';}
    finally {
      this.checking=false;this.prefs.checkedAt=this.checkedAt;this.prefs.nextCheckAt=this.nextCheckAt;this.prefs.retryCheckAt=this.retryCheckAt;
      await writeJSON(path.join(this.home,'preferences.json'),this.prefs);
    }
    return this.view();
  }
  async dismiss(version) {
    if(this.available?.version===version){this.prefs.dismissedVersion=version;await writeJSON(path.join(this.home,'preferences.json'),this.prefs);}
    return this.view();
  }
  async start(version) {
    if(!this.enabled || !this.view().canInstall)throw new Error(this.view().installNotice || 'Não conseguimos atualizar esta instalação.');
    if(this.operation || ['downloading','waiting-downloads','restarting'].includes(this.phase))return this.view();
    if(!this.available || version!==this.available.version)throw new Error('Não conseguimos encontrar essa atualização. Verifique novamente.');
    this.phase='downloading';this.progress=0;this.error='';this.controller=new AbortController();
    this.operation=this.download(this.available,this.controller.signal).catch(async error=>{
      if(this.closed)return;
      this.phase=this.controller.signal.aborted?'idle':'error';
      this.error=this.controller.signal.aborted?'':'Não conseguimos preparar a atualização. Sua instalação foi preservada. Tente novamente.';
      await fs.unlink(path.join(this.home,'pending.json')).catch(()=>{});
    }).finally(()=>{this.operation=null;});
    return this.view();
  }
  async download(candidate,signal) {
    const response=await this.request(candidate.url,{signal,timeout:300000});let size=0;const chunks=[];
    for await(const value of response.body){if(signal.aborted)throw signal.reason;size+=value.length;if(size>MAX_PACKAGE_BYTES || size>candidate.bytes)throw new Error('Pacote maior que o anunciado.');chunks.push(Buffer.from(value));this.progress=Math.floor(size/candidate.bytes*100);}
    if(size!==candidate.bytes)throw new Error('Pacote incompleto.');
    await prepareUpdate(this.root,Buffer.concat(chunks),candidate);
    if(signal.aborted)throw signal.reason;
    this.phase='waiting-downloads';this.progress=100;
    this.waitTimer=setInterval(()=>this.maybeRestart().catch(()=>{this.phase='error';this.error='Não conseguimos reiniciar para atualizar. Feche e abra o aplicativo e tente novamente.';}),500);this.waitTimer.unref();
    await this.maybeRestart();
  }
  async maybeRestart() {
    if(this.closed || this.phase!=='waiting-downloads' || this.busy())return;
    this.phase='restarting';clearInterval(this.waitTimer);
    // Give the browser time to display the restart state before closing the server.
    this.restartTimer=setTimeout(()=>this.onRestart().catch(()=>{this.phase='error';this.error='Não conseguimos reiniciar para atualizar. Tente novamente.';}),750);
  }
  async cancel() {
    if(!['downloading','waiting-downloads'].includes(this.phase))return this.view();
    this.controller?.abort();clearInterval(this.waitTimer);
    if(this.operation)await this.operation;
    await fs.unlink(path.join(this.home,'pending.json')).catch(error=>{if(error.code!=='ENOENT')throw error;});
    this.phase='idle';this.progress=0;this.error='';return this.view();
  }
  close(){this.closed=true;clearInterval(this.timer);clearInterval(this.waitTimer);clearTimeout(this.restartTimer);this.controller?.abort();}
}
