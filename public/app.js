import {friendlyError} from './errors.js';
import {MAX_LINKS,listPage,spotifyLinkKey,formatDuration,STATUS_LABELS,SORT_LABELS,nextListSort,sortDownloads} from './list.js';

const $=id=>document.getElementById(id);
const session=document.querySelector('meta[name="ixpotifai-session"]').content;
let state={items:[],paused:false},signature='';
let showClearNotice=false;
let currentPage=1;
let listSort=null;
let composerSubmitting=false;
const previewRequests=new WeakMap();
const uniqueValues=new WeakMap(),startingBatches=new Set();
const dismissedErrors=new Map();
const player=$('track-player');
let playingId=null;
let choosingFolder=false;
let folderState=null,folderBusy=false;
const labels=STATUS_LABELS;
async function api(route,data,signal){const response=await fetch(`/api/${route}`,data?{method:'POST',signal,headers:{'Content-Type':'application/json','X-ixpotifai-Token':session},body:JSON.stringify(data)}:{});const body=await response.json();if(!response.ok)throw new Error(friendlyError(body.error));return body;}
function showMessage(container,text,bad=false,onClose){
  container.classList.add('dismissible-message');container.classList.toggle('bad',bad);
  if(!text){container.hidden=true;container.replaceChildren();delete container.dataset.dismissed;return;}
  if(container.dataset.dismissed===text){container.hidden=true;return;}
  delete container.dataset.dismissed;const content=document.createElement('span');content.className='message-text';content.textContent=text;
  const close=document.createElement('button');close.type='button';close.className='message-close';close.setAttribute('aria-label','Fechar mensagem');close.append(phosphorIcon('x'));
  close.onclick=()=>{container.hidden=true;container.dataset.dismissed=text;onClose?.();};container.replaceChildren(content,close);container.hidden=false;
}
function message(text,bad=false){showMessage($('message'),text,bad);}
async function action(action,id){try{state=await api('action',{action,id});if(action==='clear'){showClearNotice=state.canUndoClear;currentPage=1;}if(action==='undo-clear')showClearNotice=false;render();await startPreparedDownloads();}catch(error){message(friendlyError(error),true);}}
function badge(parent,text,style){const span=document.createElement('span');span.textContent=text;if(style)span.className=style;parent.append(span);}
function phosphorIcon(name){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('class','download-icon');svg.setAttribute('viewBox','0 0 256 256');svg.setAttribute('aria-hidden','true');const use=document.createElementNS('http://www.w3.org/2000/svg','use');use.setAttribute('href',`#ph-${name}`);svg.append(use);return svg;}
function downloadIcon(){return phosphorIcon('download-simple');}
function updatePlayback(){
  const playing=!player.paused && !player.ended && player.readyState>=2;
  document.querySelectorAll('#queue .track').forEach(row=>{const active=row.dataset.id===playingId && playing;row.classList.toggle('is-playing',active);const button=row.querySelector('.track-toggle');button.setAttribute('aria-label',`${active?'Pausar':'Reproduzir'} ${row.querySelector('h3').textContent}`);button.title=active?'Pausar':'Reproduzir arquivo baixado';});
}
function stopPlayback(){playingId=null;player.pause();player.removeAttribute('src');player.load();updatePlayback();}
async function togglePlayback(item){
  try{
    if(playingId!==item.id){player.pause();playingId=item.id;player.src=`/api/audio/${item.id}?session=${encodeURIComponent(session)}`;}
    else if(!player.paused){player.pause();return;}
    await player.play();
  }catch(error){if(playingId===item.id && error.name!=='AbortError')message('Não conseguimos reproduzir esse arquivo. Confira se ele está na pasta de saída.',true);}
}
for(const event of ['playing','pause','ended','waiting','emptied'])player.addEventListener(event,updatePlayback);
player.addEventListener('error',()=>{updatePlayback();if(playingId)message('Não conseguimos reproduzir esse arquivo. Confira se ele está na pasta de saída.',true);});
function updateDownloadButton(){const inputs=Array.from($('link-inputs').querySelectorAll('input')),filled=inputs.filter(input=>input.value.trim());$('add-button').disabled=composerSubmitting || !filled.length || inputs.some(input=>!input.validity.valid) || filled.some(input=>!spotifyLinkKey(input.value) || duplicateMessage(input,input.value));}
function numberLinkRows(){$('link-inputs').querySelectorAll('.link-row').forEach((row,index)=>{const input=row.querySelector('input'),label=row.querySelector('label'),feedback=row.querySelector('.link-feedback'),clear=row.querySelector('.clear-link'),remove=row.querySelector('.delete-link');input.id=`spotify-link-${index+1}`;input.required=index===0;feedback.id=`link-feedback-${index+1}`;input.setAttribute('aria-describedby',feedback.id);label.htmlFor=input.id;label.textContent=`Link do Spotify ${index+1}`;clear.setAttribute('aria-label',`Limpar campo ${index+1}`);clear.title='Limpar campo';clear.hidden=!input.value.trim();remove.setAttribute('aria-label',`Excluir campo ${index+1}`);remove.title='Excluir campo';remove.disabled=composerSubmitting || ($('link-inputs').children.length===1 && !input.value.trim());});updateDownloadButton();}
function newLinkRow(){return $('link-row-template').content.firstElementChild.cloneNode(true);}
function ensureNextLink(){const rows=Array.from($('link-inputs').children),last=rows.at(-1);if(composerSubmitting || rows.length>=MAX_LINKS || rows.some(row=>!row.querySelector('input').value.trim()) || last?.dataset.recognized!=='true')return;$('link-inputs').append(newLinkRow());numberLinkRows();}
function removeLinkRow(row){const replenish=row!==$('link-inputs').lastElementChild || !!row.querySelector('input').value.trim();stopPreview(row);row.remove();if(!$('link-inputs').children.length)$('link-inputs').append(newLinkRow());if(replenish)ensureNextLink();numberLinkRows();}
function composerBusy(busy){composerSubmitting=busy;$('add-button').textContent=busy?'Preparando músicas…':'Fazer download';$('link-inputs').querySelectorAll('input,button').forEach(control=>{control.disabled=busy;});numberLinkRows();if(!busy)ensureNextLink();}
$('link-inputs').onclick=event=>{
  const clear=event.target.closest('.clear-link'),remove=event.target.closest('.delete-link');
  if(clear && !clear.disabled){const input=clear.closest('.link-row').querySelector('input');input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();}
  if(remove && !remove.disabled){const row=remove.closest('.link-row'),next=row.nextElementSibling || row.previousElementSibling;removeLinkRow(row);(next?.isConnected?next:$('link-inputs').lastElementChild).querySelector('input').focus();}
};
$('link-inputs').addEventListener('focusout',event=>{
  const row=event.target.closest('.link-row');if(!row || row.contains(event.relatedTarget))return;
  // Aguarda o clique de limpar devolver o foco ao campo antes de remover um vazio.
  setTimeout(()=>{if(!row.isConnected || row.contains(document.activeElement) || composerSubmitting || row===$('link-inputs').lastElementChild || row.querySelector('input').value.trim())return;removeLinkRow(row);},0);
});
function artwork(container,title,cover){container.replaceChildren();const fallback=()=>{const symbol=document.createElement('span');symbol.textContent='♫';container.replaceChildren(symbol);};if(!cover){fallback();return;}const image=document.createElement('img');image.alt=`Capa de ${title}`;image.src=cover;image.onload=()=>image.classList.add('loaded');image.onerror=fallback;container.append(image);}
function stopPreview(row){const request=previewRequests.get(row);if(request){clearTimeout(request.timer);request.controller.abort();}previewRequests.delete(row);}
function duplicateMessage(input,value) {
  const key=spotifyLinkKey(value);if(!key)return null;
  if(Array.from($('link-inputs').querySelectorAll('input')).some(other=>other!==input && spotifyLinkKey(other.value)===key))return 'Ops! Esse link já está em outro campo.';
  if(state.items.some(item=>spotifyLinkKey(item.input)===key || item.sourceInputs?.some(value=>spotifyLinkKey(value)===key)))return 'Ops! Essa música já está na sua lista.';
  return null;
}
function showDuplicate(input,text){showMessage(input.closest('.link-row').querySelector('.link-feedback'),text,true);}
$('link-inputs').onpaste=event=>{if(event.target.name!=='spotify-link')return;const text=event.clipboardData?.getData('text') || '';const duplicate=duplicateMessage(event.target,text);if(duplicate){event.preventDefault();showDuplicate(event.target,duplicate);}};
$('link-inputs').oninput=event=>{
  if(event.target.name!=='spotify-link')return;
  const row=event.target.closest('.link-row'),input=event.target,field=row.querySelector('.link-field'),preview=row.querySelector('.link-preview'),feedback=row.querySelector('.link-feedback');
  const duplicate=duplicateMessage(input,input.value);
  if(duplicate){input.value=uniqueValues.get(input) || '';input.title=input.value;showDuplicate(input,duplicate);numberLinkRows();return;}
  uniqueValues.set(input,input.value);
  delete row.dataset.recognized;numberLinkRows();
  stopPreview(row);preview.hidden=true;field.classList.remove('has-preview');showMessage(feedback,'');
  const value=input.value.trim();input.title=value;if(!value)return;
  const request={controller:new AbortController()};previewRequests.set(row,request);
  request.timer=setTimeout(async()=>{
    showMessage(feedback,'Reconhecendo link…');
    try {
      const metadata=await api('preview',{input:value},request.controller.signal);
      if(!row.isConnected || previewRequests.get(row)!==request || input.value.trim()!==value)return;
      preview.querySelector('h3').textContent=metadata.title;preview.querySelector('.artist').textContent=metadata.artist;
      artwork(preview.querySelector('.artwork'),metadata.title,metadata.cover);preview.hidden=false;showMessage(feedback,'');field.classList.add('has-preview');row.dataset.recognized='true';ensureNextLink();
    }catch(error){if(request.controller.signal.aborted || !row.isConnected || previewRequests.get(row)!==request)return;showMessage(feedback,friendlyError(error),true);}
  },400);
};
function renderSortControls(){
  $('download-columns').querySelectorAll('[data-sort]').forEach(button=>{
    const column=button.dataset.sort,active=listSort?.column===column,key=active?listSort.key:column;
    const label=SORT_LABELS[key];if(column==='title')button.querySelector('.column-label').textContent=label;
    button.disabled=state.items.length===0;button.setAttribute('aria-pressed',String(active));button.setAttribute('aria-label',`Ordenar por ${label.toLocaleLowerCase('pt-BR')}`);
    const next=nextListSort(listSort,column),numeric=['sequence','duration'].includes(next?.key);
    button.title=next?`Ordenar ${SORT_LABELS[next.key].toLocaleLowerCase('pt-BR')}: ${numeric?(next.direction==='asc'?'menor para maior':'maior para menor'):(next.direction==='asc'?'A–Z':'Z–A')}`:'Desativar ordenação';
    const indicator=button.querySelector('.sort-indicator');indicator.replaceChildren();if(active)indicator.append(phosphorIcon(listSort.direction==='asc'?'caret-up':'caret-down'));
  });
}
$('download-columns').onclick=event=>{
  const button=event.target.closest('[data-sort]');if(!button || button.disabled)return;
  listSort=nextListSort(listSort,button.dataset.sort);currentPage=1;
  $('sort-announcement').textContent=listSort?`Lista ordenada por ${SORT_LABELS[listSort.key]}, ${['sequence','duration'].includes(listSort.key)?(listSort.direction==='asc'?'do menor para o maior':'do maior para o menor'):(listSort.direction==='asc'?'de A a Z':'de Z a A')}.`:'Ordenação desativada. Exibindo as músicas mais recentes primeiro.';
  render();
};
function render(){
  updateDownloadButton();
  if(playingId && !state.items.some(item=>item.id===playingId && item.status==='completed' && item.file))stopPlayback();
  for(const item of state.items)if(!item.error)dismissedErrors.delete(item.id);
  $('queued-count').textContent=state.items.filter(i=>['prepared','queued','reading','matching','downloading','validating'].includes(i.status)).length;
  $('completed-count').textContent=state.items.filter(i=>i.status==='completed').length;
  $('failed-count').textContent=state.items.filter(i=>i.status==='failed').length;
  $('pause-button').textContent=`${state.paused?'Retomar':'Pausar'} ${state.items.length===1?'download':'downloads'}`;
  $('pause-button').disabled=!state.items.some(item=>['queued','reading','matching','downloading','validating'].includes(item.status));
  $('clear-button').disabled=state.items.length===0 || state.preparing;
  if(state.items.length)showClearNotice=false;
  $('clear-notice').hidden=!showClearNotice || !state.canUndoClear;
  $('download-folder').textContent=state.downloadFolder || 'downloads';
  $('download-folder').disabled=choosingFolder || state.preparing || state.items.some(item=>['reading','matching','downloading','validating'].includes(item.status));
  $('download-folder').title=$('download-folder').disabled?'Aguarde os downloads terminarem para trocar a pasta.':'Clique para escolher outra pasta de destino';
  renderSortControls();
  const page=listPage(sortDownloads(state.items,listSort),currentPage);currentPage=page.page;
  const items=page.items;
  $('list-summary').textContent=page.total?`${page.total} ${page.total===1?'item':'itens'}${state.paused?' · fila pausada':''}`:'';
  $('list-summary').hidden=!page.total;
  $('pagination').hidden=page.pages<=1;
  $('page-summary').textContent=`${page.start}–${page.end} de ${page.total} músicas`;
  $('page-number').textContent=`${page.page} de ${page.pages}`;
  $('previous-page').disabled=page.page===1;$('next-page').disabled=page.page===page.pages;
  const next=JSON.stringify({items,page:page.page,total:page.total,paused:state.paused,sort:listSort});if(next===signature)return;signature=next;
  const container=$('queue');container.replaceChildren();
  if(!items.length){const empty=document.createElement('div');empty.className='empty';const symbol=document.createElement('div');symbol.className='empty-symbol';symbol.append(downloadIcon());const title=document.createElement('h3');title.textContent='Sua lista de downloads está vazia.';const text=document.createElement('p');text.textContent='Adicione um link acima e clique em Fazer download para começar sua próxima seleção.';empty.append(symbol,title,text);container.append(empty);return;}
  for(const [index,item] of items.entries()){const node=$('item-template').content.cloneNode(true),row=node.querySelector('.track');row.dataset.id=item.id;node.querySelector('h3').textContent=item.track?.title || (item.input?.includes('/playlist/')?'Playlist do Spotify':item.input?.includes('/album/')?'Álbum do Spotify':'Faixa do Spotify');node.querySelector('.artist').textContent=item.track?.artist || item.input;
    node.querySelector('.track-number').textContent=listSort?page.start+index:item.sequence;
    const play=node.querySelector('.track-toggle'),playable=item.status==='completed' && !!item.file;row.classList.toggle('can-play',playable);play.hidden=!playable;play.onclick=event=>{if(event.detail>0){event.currentTarget.blur();row.classList.add('suppress-hover');}togglePlayback(item);};row.onpointerleave=()=>row.classList.remove('suppress-hover');
    const album=node.querySelector('.track-album');album.textContent=item.track?.album || 'Álbum não informado';album.title=album.textContent;
    const duration=node.querySelector('.track-duration'),seconds=item.track?.duration ?? item.audio?.duration;duration.textContent=formatDuration(seconds);if(Number.isFinite(seconds) && seconds>=0)duration.dateTime=`PT${Math.floor(seconds)}S`;
    const remove=node.querySelector('.remove-track');remove.setAttribute('aria-label',`Remover ${node.querySelector('h3').textContent} da lista`);remove.title='Remover da lista';remove.onclick=()=>action('remove',item.id);
    node.querySelector('h3').title=node.querySelector('h3').textContent;node.querySelector('.artist').title=node.querySelector('.artist').textContent;
    if(item.track?.cover && item.track.id)artwork(node.querySelector('.artwork'),item.track.title,`/api/cover/track/${item.track.id}`);
    const details=node.querySelector('.details');if(item.audio){badge(details,`${item.audio.format} · ${item.audio.bits} bits / ${item.audio.rate/1000} kHz`);badge(details,`${(item.audio.bytes/1048576).toFixed(1)} MB`);}if(item.count)badge(details,`${item.count} faixas adicionadas`);
    const status=node.querySelector('.status');status.textContent=labels[item.status] || item.status;status.classList.add(item.status);const progress=node.querySelector('.progress');progress.hidden=!['downloading','validating'].includes(item.status);progress.firstElementChild.style.width=`${item.progress || 0}%`;
    const error=node.querySelector('.error'),errorText=item.error?friendlyError(item.error):'';
    showMessage(error,errorText,true,()=>dismissedErrors.set(item.id,errorText));if(dismissedErrors.get(item.id)===errorText)error.hidden=true;
    const actions=node.querySelector('.actions');if(item.status==='completed'){actions.hidden=true;}else if(['failed','cancelled'].includes(item.status)){const retry=document.createElement('button');retry.type='button';retry.textContent='Tentar novamente';retry.onclick=()=>action('retry',item.id);actions.append(retry);}else if(item.status!=='expanded'){const cancel=document.createElement('button');cancel.type='button';cancel.className='cancel';cancel.textContent='Cancelar';cancel.onclick=()=>action('cancel',item.id);actions.append(cancel);}container.append(node);
  }
  updatePlayback();
}
async function startPreparedDownloads() {
  for(const batchId of state.readyBatches || []) {
    if(startingBatches.has(batchId))continue;startingBatches.add(batchId);
    try {
      await Promise.all(Array.from(document.querySelectorAll('#queue .artwork img'),image=>image.decode().catch(()=>{})));
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      state=await api('start-batch',{batchId});render();
    }catch(error){message(friendlyError(error),true);}finally{startingBatches.delete(batchId);}
  }
}
$('add-form').onsubmit=async event=>{event.preventDefault();if($("add-button").disabled)return;const links=Array.from($('link-inputs').querySelectorAll('input'),input=>input.value.trim()).filter(Boolean);composerBusy(true);let added=false;try{state=await api('add',{input:links.join('\n')});currentPage=1;$('link-inputs').querySelectorAll('.link-row').forEach(stopPreview);$('link-inputs').replaceChildren(newLinkRow());numberLinkRows();added=true;message('Músicas preparadas. O download será feito na pasta escolhida.');render();await startPreparedDownloads();if(state.paused){state=await api('action',{action:'resume'});render();}}catch(error){message(friendlyError(error),true);}finally{composerBusy(false);if(added)$('link-inputs').querySelector('input').focus();}};
$('pause-button').onclick=()=>action(state.paused?'resume':'pause');
$('clear-button').onclick=async()=>{$('clear-button').disabled=true;await action('clear');};
$('undo-clear').onclick=()=>action('undo-clear');
$('dismiss-clear-notice').onclick=()=>{showClearNotice=false;render();};
$('previous-page').onclick=()=>{currentPage--;render();document.querySelector('.queue-section').scrollIntoView({block:'start'});};
$('next-page').onclick=()=>{currentPage++;render();document.querySelector('.queue-section').scrollIntoView({block:'start'});};
function folderMessage(text,bad=false){showMessage($('folder-message'),text,bad);}
function folderControls(busy){const typedPath=$('folder-path').value.trim();folderBusy=busy;$('folder-select').disabled=busy || !folderState || typedPath!==folderState.directory;$('folder-open-path').disabled=busy || !typedPath;$('folder-up').disabled=busy || !folderState?.parent;$('folder-root').disabled=busy || !state.defaultDownloadFolder || (folderState?.directory===state.defaultDownloadFolder && typedPath===state.defaultDownloadFolder);$('folder-list').querySelectorAll('button').forEach(button=>button.disabled=busy);}
async function openFolder(directory){
  if(folderBusy)return;folderControls(true);folderMessage('Abrindo pasta…');
  try {
    folderState=await api('folders',{directory});$('folder-path').value=folderState.directory;
    const list=$('folder-list');list.replaceChildren();
    for(const folder of folderState.folders){const button=document.createElement('button');button.type='button';button.className='folder-entry';const icon=phosphorIcon('folder');icon.classList.add('folder-entry-icon');const name=document.createElement('span');name.textContent=folder.name;button.append(icon,name);button.onclick=()=>openFolder(folder.path);list.append(button);}
    if(!folderState.folders.length){const empty=document.createElement('p');empty.textContent='Nenhuma subpasta aqui. Você pode usar esta pasta como destino.';list.append(empty);}
    folderMessage('');
    return folderState;
  }catch(error){folderMessage(friendlyError(error),true);}finally{folderControls(false);}
}
$('download-folder').onclick=()=>{folderState=null;folderControls(false);$('folder-list').replaceChildren();$('folder-dialog').showModal();openFolder(state.downloadFolder);};
$('folder-path-form').onsubmit=event=>{event.preventDefault();openFolder($('folder-path').value.trim());};
$('folder-path').oninput=()=>folderControls(folderBusy);
$('folder-up').onclick=()=>openFolder(folderState.parent);
$('folder-root').onclick=()=>openFolder(state.defaultDownloadFolder);
for(const id of ['folder-close','folder-cancel'])$(id).onclick=()=>{if(!choosingFolder)$('folder-dialog').close();};
$('folder-select').onclick=async()=>{
  if(folderBusy || !folderState)return;choosingFolder=true;folderControls(true);render();
  try{state=await api('folder',{directory:folderState.directory});render();$('folder-dialog').close();message('Pasta de saída atualizada. Os próximos downloads serão salvos nela.');}
  catch(error){folderMessage(friendlyError(error),true);}finally{choosingFolder=false;folderControls(false);render();}
};
async function refresh(){try{state=await api('state');render();await startPreparedDownloads();}catch{message('O aplicativo local foi desconectado. Reinicie o ixpotifai para continuar.',true);}}
numberLinkRows();refresh();setInterval(refresh,1500);
