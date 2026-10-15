export const MAX_LINKS=5;
export const PAGE_SIZE=10;
export const STATUS_LABELS={prepared:'Pronta para baixar',queued:'Na fila',waiting:'Aguardando a fonte',reading:'Preparando download',matching:'Preparando download',downloading:'Baixando',validating:'Validando áudio',completed:'Concluído',failed:'Precisa de atenção',cancelled:'Cancelado',expanded:'Lista adicionada'};
export function retryFeedback(item,paused,now=Date.now()) {
  if(item.status==='waiting') {
    const seconds=Math.max(0,Math.ceil(((item.retryAt || now)-now)/1000));
    const attempt=item.rateLimitAttempts?` Tentativa automática ${item.rateLimitAttempts} de 3.`:'';
    return `A fonte limitou os pedidos. ${paused?'Downloads pausados.':seconds?`Nova tentativa em ${seconds}s.`:'Preparando nova tentativa…'}${attempt}`;
  }
  if(item.status==='failed' && item.rateLimitExhausted)return 'A fonte continua limitando os pedidos após 3 novas tentativas. A fila foi pausada. Tente novamente mais tarde.';
  return '';
}
export const SORT_LABELS={sequence:'Número',title:'Título',artist:'Artista',album:'Álbum',duration:'Duração',status:'Status'};
export function downloadControl({items,paused,preparing}) {
  const pending=items.some(item=>['prepared','queued','waiting','reading','matching','downloading','validating'].includes(item.status));
  const failed=items.some(item=>item.status==='failed');
  const noun=items.length===1?'download':'downloads';
  if(pending)return {label:`${paused?'Retomar':'Pausar'} ${noun}`,action:paused?(failed?'retry-failed':'resume'):'pause',disabled:!!preparing};
  if(failed)return {label:'Tentar novamente',action:'retry-failed',disabled:!!preparing};
  return {label:`${paused?'Retomar':'Pausar'} ${noun}`,action:'resume',disabled:true};
}
const alphabet=new Intl.Collator('pt-BR',{sensitivity:'base',numeric:true});
export function nextListSort(current,column){
  const cycle=column==='title'?['title','title','artist','artist']:[column,column];
  const step=current?.column===column?current.step+1:0;
  return step>=cycle.length?null:{column,key:cycle[step],direction:step%2===0?'asc':'desc',step};
}
function sortValue(item,key){
  if(key==='sequence')return item.sequence;
  if(key==='duration')return item.track?.duration ?? item.audio?.duration;
  if(key==='status')return STATUS_LABELS[item.status] || item.status;
  return item.track?.[key];
}
export function sortDownloads(items,sort){
  const order=(a,b)=>(b.sequence || 0)-(a.sequence || 0);
  if(!sort)return items.slice().sort((a,b)=>(a.sequence || 0)-(b.sequence || 0));
  const numeric=['sequence','duration'].includes(sort.key),direction=sort.direction==='asc'?1:-1;
  return items.slice().sort((a,b)=>{
    const av=sortValue(a,sort.key),bv=sortValue(b,sort.key);
    const missing=value=>numeric?!Number.isFinite(value):typeof value!=='string' || !value.trim();
    const am=missing(av),bm=missing(bv);
    // Metadados ausentes ficam no final nas duas direções.
    if(am!==bm)return am?1:-1;
    const compared=am?0:numeric?av-bv:alphabet.compare(av,bv);
    return compared*direction || order(a,b);
  });
}
export function formatDuration(seconds){if(!Number.isFinite(seconds) || seconds<0)return '—';const total=Math.floor(seconds),minutes=Math.floor(total/60),rest=String(total%60).padStart(2,'0');return minutes<60?`${minutes}:${rest}`:`${Math.floor(minutes/60)}:${String(minutes%60).padStart(2,'0')}:${rest}`;}
export function spotifyLinkKey(value) {
  const raw=String(value || '').trim();
  const uri=raw.match(/^spotify:(track|album|playlist):([A-Za-z0-9]{22})$/);
  if(uri)return `${uri[1]}/${uri[2]}`;
  try{const url=new URL(raw);if(url.protocol!=='https:' || url.hostname!=='open.spotify.com')return null;const match=url.pathname.match(/^\/(?:intl-[a-z-]+\/)?(track|album|playlist)\/([A-Za-z0-9]{22})\/?$/i);return match?`${match[1].toLowerCase()}/${match[2]}`:null;}catch{return null;}
}
export function listPage(items,page=1) {
  const total=items.length,pages=Math.max(1,Math.ceil(total/PAGE_SIZE));
  const current=Math.max(1,Math.min(Number.isInteger(page)?page:1,pages));
  const start=(current-1)*PAGE_SIZE;
  return {page:current,pages,total,start:total?start+1:0,end:Math.min(start+PAGE_SIZE,total),items:items.slice(start,start+PAGE_SIZE)};
}
