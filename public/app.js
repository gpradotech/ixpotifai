const $=id=>document.getElementById(id);
const session=document.querySelector('meta[name="skeeter-session"]').content;
let state={items:[],paused:false},filter='all',signature='';
const labels={queued:'Na fila',reading:'Lendo referência',matching:'Encontrando fonte',downloading:'Baixando',validating:'Validando áudio',completed:'Concluído',failed:'Precisa de atenção',cancelled:'Cancelado',expanded:'Lista adicionada'};
async function api(route,data){const response=await fetch(`/api/${route}`,data?{method:'POST',headers:{'Content-Type':'application/json','X-Skeeter-Token':session},body:JSON.stringify(data)}:{});const body=await response.json();if(!response.ok)throw new Error(body.error);return body;}
function message(text,bad=false){$('message').textContent=text;$('message').classList.toggle('bad',bad);$('message').hidden=!text;}
async function action(action,id){try{state=await api('action',{action,id});render();}catch(error){message(error.message,true);}}
function badge(parent,text,style){const span=document.createElement('span');span.textContent=text;if(style)span.className=style;parent.append(span);}
function render(){
  $('queued-count').textContent=state.items.filter(i=>['queued','reading','matching','downloading','validating'].includes(i.status)).length;
  $('completed-count').textContent=state.items.filter(i=>i.status==='completed').length;
  $('failed-count').textContent=state.items.filter(i=>i.status==='failed').length;
  $('pause-button').textContent=state.paused?'Retomar fila':'Pausar fila';
  $('folder').textContent=`Pasta de saída: ${state.downloadFolder || 'downloads'}`;
  $('list-title').textContent=filter==='completed'?'Biblioteca':'Downloads';
  const items=state.items.filter(i=>filter==='all' || i.status==='completed').slice().reverse();
  $('list-summary').textContent=items.length?`${items.length} ${items.length===1?'item':'itens'}${state.paused?' · fila pausada':''}`:'Sua seleção começa aqui';
  const next=JSON.stringify({items,filter,paused:state.paused});if(next===signature)return;signature=next;
  const container=$('queue');container.replaceChildren();
  if(!items.length){const empty=document.createElement('div');empty.className='empty';const symbol=document.createElement('div');symbol.className='empty-symbol';symbol.textContent='♫';const title=document.createElement('h3');title.textContent=filter==='completed'?'Sua biblioteca está a caminho':'Um bom set começa com uma boa seleção.';const text=document.createElement('p');text.textContent=filter==='completed'?'Os arquivos validados aparecerão aqui.':'Adicione um link acima para começar. Cada arquivo passa por uma verificação de integridade.';empty.append(symbol,title,text);container.append(empty);return;}
  for(const item of items){const node=$('item-template').content.cloneNode(true);node.querySelector('h3').textContent=item.track?.title || (item.input?.includes('/playlist/')?'Playlist do Spotify':item.input?.includes('/album/')?'Álbum do Spotify':'Faixa do Spotify');node.querySelector('.artist').textContent=item.track?.artist || item.input;
    const details=node.querySelector('.details');if(item.source)badge(details,item.source);if(item.audio){badge(details,`${item.audio.format} · ${item.audio.bits} bits / ${item.audio.rate/1000} kHz`);badge(details,`${(item.audio.bytes/1048576).toFixed(1)} MB`);}if(item.identity)badge(details,`Master: ${item.identity.master.toLowerCase()}`,'master');if(item.count)badge(details,`${item.count} faixas adicionadas`);
    const status=node.querySelector('.status');status.textContent=labels[item.status] || item.status;status.classList.add(item.status);const progress=node.querySelector('.progress');progress.hidden=!['downloading','validating'].includes(item.status);progress.firstElementChild.style.width=`${item.progress || 0}%`;
    const error=node.querySelector('.error');error.textContent=item.error || '';error.hidden=!item.error;
    const actions=node.querySelector('.actions');if(item.status==='completed'){const link=document.createElement('a');link.href=`/files/${item.id}`;link.textContent='Salvar arquivo ↗';actions.append(link);}else if(['failed','cancelled'].includes(item.status)){const retry=document.createElement('button');retry.type='button';retry.textContent='Tentar novamente';retry.onclick=()=>action('retry',item.id);actions.append(retry);}else if(item.status!=='expanded'){const cancel=document.createElement('button');cancel.type='button';cancel.className='cancel';cancel.textContent='Cancelar';cancel.onclick=()=>action('cancel',item.id);actions.append(cancel);}container.append(node);
  }
}
$('add-form').onsubmit=async event=>{event.preventDefault();$('add-button').disabled=true;try{state=await api('add',{input:$('links').value});$('links').value='';message('Links adicionados. Você pode continuar montando sua seleção.');render();}catch(error){message(error.message,true);}finally{$('add-button').disabled=false;}};
$('pause-button').onclick=()=>action(state.paused?'resume':'pause');
document.querySelectorAll('[data-filter]').forEach(button=>button.onclick=()=>{filter=button.dataset.filter;document.querySelectorAll('[data-filter]').forEach(b=>b.classList.toggle('active',b===button));render();});
async function refresh(){try{state=await api('state');render();}catch{message('O aplicativo local foi desconectado. Reinicie o Skeeter para continuar.',true);}}
refresh();setInterval(refresh,1500);
