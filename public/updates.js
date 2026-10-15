let state={enabled:false,phase:'idle'},pending=false,shownVersion=null,reloading=false,lastConnection=Date.now();
const active=()=>['downloading','waiting-downloads','restarting'].includes(state.phase);
export const isUpdateRestarting=()=>state.phase==='restarting' || !!sessionStorage.getItem('ixpotifai-update-target');
export function initUpdates() {
  const $=id=>document.getElementById(id),dialog=$('update-dialog');
  const token=document.querySelector('meta[name="ixpotifai-session"]').content;
  async function request(action,data={}) {
    const response=await fetch(`/api/updates${action?'/'+action:''}`,action?{method:'POST',headers:{'Content-Type':'application/json','X-ixpotifai-Token':token},body:JSON.stringify(data)}:{});
    const body=await response.json();if(!response.ok)throw new Error(body.error || 'Não conseguimos concluir a atualização agora.');return body;
  }
  function show(){if(!dialog.open)dialog.showModal();}
  function render() {
    $('update-check').hidden=!state.enabled;$('update-check').textContent=`Versão ${state.currentVersion || ''} · Verificar atualizações`;
    $('update-banner').hidden=!state.available || active();
    $('update-banner-button').textContent=state.available?`Versão ${state.available.version} disponível`:'';
    $('update-current').textContent=`Versão instalada: ${state.currentVersion || '—'}`;
    $('update-title').textContent=active()?'Atualizando ixpotifai':state.available?'Nova versão disponível':'Atualizações';
    $('update-notes').textContent=state.available?.notes || '';$('update-notes').hidden=!state.available?.notes || active();
    let message=state.available?`A versão ${state.available.version} está disponível. Suas músicas, lista e configurações serão preservadas.`:'Você está usando a versão mais recente disponível.';
    if(state.checking)message='Verificando atualizações…';
    if(state.checkError && !state.available)message=state.checkError;
    if(state.phase==='downloading')message=`Baixando e verificando a atualização… ${state.progress}%`;
    if(state.phase==='waiting-downloads')message='Atualização pronta. A instalação começará quando os downloads terminarem. Você pode pausar os downloads para atualizar agora.';
    if(state.phase==='restarting')message='Instalando e reiniciando… Mantenha esta página e a janela do aplicativo abertas. Isso pode levar alguns minutos.';
    if(state.phase==='updated')message=`Atualização concluída. Você está usando a versão ${state.currentVersion}.`;
    if(state.error)message=state.error;
    $('update-feedback').textContent=message;
    $('update-feedback').classList.toggle('bad',!!state.error || (!!state.checkError && !state.available));
    $('update-progress').hidden=state.phase!=='downloading';$('update-progress').value=state.progress || 0;
    $('update-install').hidden=!state.available || active();
    $('update-install').disabled=pending || !state.canInstall;
    $('update-install').textContent=state.busy?'Atualizar ao terminar os downloads':'Atualizar e reiniciar';
    $('update-notice').textContent=state.available && !state.canInstall?state.installNotice:'';$('update-notice').hidden=!$('update-notice').textContent;
    $('update-manual-check').hidden=active();$('update-manual-check').disabled=pending || state.checking;
    $('update-later').hidden=active();$('update-later').textContent=state.available?'Mais tarde':'Fechar';
    $('update-close').disabled=active() || pending;
    $('update-cancel').hidden=!['downloading','waiting-downloads'].includes(state.phase);$('update-cancel').disabled=pending;
    if(state.available && !active() && state.dismissedVersion!==state.available.version && shownVersion!==state.available.version) {shownVersion=state.available.version;show();}
  }
  async function refresh() {
    if(reloading)return;
    try {
      state=await request();lastConnection=Date.now();
      const target=sessionStorage.getItem('ixpotifai-update-target');
      if(target && state.currentVersion===target && state.phase!=='restarting') {sessionStorage.removeItem('ixpotifai-update-target');sessionStorage.setItem('ixpotifai-update-complete',target);reloading=true;location.reload();return;}
      if(target && ['restored','error'].includes(state.phase)){sessionStorage.removeItem('ixpotifai-update-target');show();}
      if(sessionStorage.getItem('ixpotifai-update-complete')===state.currentVersion){sessionStorage.removeItem('ixpotifai-update-complete');state.phase='updated';show();}
      render();
    }catch {
      if(isUpdateRestarting()) {
        $('update-feedback').textContent=Date.now()-lastConnection<10*60*1000?'Instalando e reiniciando… O aplicativo reconectará esta página automaticamente.':'O aplicativo ainda não reconectou. Confira a janela do aplicativo antes de fechá-la; seus dados e backups foram preservados.';
      }
    }
  }
  async function perform(action,data={}) {
    if(pending)return;pending=true;if(action==='check')state.checking=true;render();
    try {
      state=await request(action,data);
      if(action==='install' && active())sessionStorage.setItem('ixpotifai-update-target',state.available.version);
      if(action==='cancel')sessionStorage.removeItem('ixpotifai-update-target');
    }catch(error){state.error=error.message;}
    finally{pending=false;if(action==='check')state.checking=false;render();}
  }
  async function later(){if(active() || pending)return;if(state.available)await perform('dismiss',{version:state.available.version});dialog.close();}
  $('update-check').onclick=()=>{show();perform('check');};
  $('update-manual-check').onclick=()=>perform('check');
  $('update-banner-button').onclick=()=>{show();render();};
  $('update-install').onclick=()=>perform('install',{version:state.available?.version});
  $('update-cancel').onclick=()=>perform('cancel');
  $('update-later').onclick=later;$('update-close').onclick=later;
  dialog.addEventListener('cancel',event=>{event.preventDefault();later();});
  refresh();setInterval(refresh,2000);
}
