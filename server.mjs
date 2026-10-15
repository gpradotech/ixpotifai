import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {spawn} from 'node:child_process';
import {Queue} from './lib/queue.mjs';
import {safeError} from './lib/net.mjs';
import {previewStore} from './lib/preview.mjs';
import {browseFolders} from './lib/folder.mjs';
import {streamAudio} from './lib/playback.mjs';
import {UpdateManager} from './lib/updates.mjs';

export async function createApp({root=path.dirname(fileURLToPath(import.meta.url)),queue,previewOptions,updateOptions}={}) {
  const token=randomBytes(32).toString('hex');let origin,previews,updates,choosingFolder=false;
  const server=http.createServer(async(req,res)=>{
    const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      if(!queue)return send(503,{error:'O aplicativo está iniciando.'});
      if(req.headers.host!==new URL(origin).host)return send(403,{error:'Origem não autorizada.'});
      if(req.headers.origin && req.headers.origin!==origin)return send(403,{error:'Origem não autorizada.'});
      const url=new URL(req.url,origin);
      if(req.method==='POST') {
        const supplied=String(req.headers['x-ixpotifai-token'] || '');
        if(supplied.length!==token.length || !timingSafeEqual(Buffer.from(supplied),Buffer.from(token)))return send(403,{error:'Sessão inválida. Reabra o aplicativo.'});
        let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>1024*1024)return send(413,{error:'Envie este lote em partes menores.'});}
        const data=JSON.parse(body || '{}');
        if(url.pathname==='/api/updates/check')return send(200,await updates.check({manual:true}));
        if(url.pathname==='/api/updates/dismiss')return send(200,await updates.dismiss(data.version));
        if(url.pathname==='/api/updates/install')return send(200,await updates.start(data.version));
        if(url.pathname==='/api/updates/cancel')return send(200,await updates.cancel());
        if(updates?.phase==='restarting')return send(409,{error:'Estamos instalando a atualização. Aguarde o aplicativo reiniciar.'});
        if(url.pathname==='/api/preview')return send(200,await previews.get(String(data.input || '')));
        if(url.pathname==='/api/add')return send(200,await queue.prepare(String(data.input || '')));
        if(url.pathname==='/api/start-batch')return send(200,await queue.startBatch(String(data.batchId || '')));
        if(url.pathname==='/api/folders')return send(200,await browseFolders(String(data.directory || queue.downloadRoot)));
        if(url.pathname==='/api/folder') {
          if(choosingFolder)throw new Error('O seletor de pasta já está aberto.');
          if(queue.active || queue.preparing)throw new Error('Aguarde os downloads terminarem para escolher outra pasta.');
          choosingFolder=true;
          try{return send(200,await queue.setDownloadFolder(String(data.directory || '')));}finally{choosingFolder=false;}
        }
        if(url.pathname==='/api/action')return send(200,await queue.action(data.action,data.id));
        return send(404,{error:'Rota inexistente.'});
      }
      const audio=url.pathname.match(/^\/api\/audio\/([a-f0-9-]{36})$/);
      if(audio && ['GET','HEAD'].includes(req.method)){
        const supplied=url.searchParams.get('session') || '';
        if(!/^[a-f0-9]{64}$/.test(supplied) || !timingSafeEqual(Buffer.from(supplied),Buffer.from(token)))return send(403,{error:'Sessão inválida. Reabra o aplicativo.'});
        const item=queue.items.find(item=>item.id===audio[1] && item.status==='completed');if(!item)return send(404,{error:'Áudio não disponível.'});
        await streamAudio(req,res,item,queue.downloadRoot);return;
      }
      if(req.method!=='GET')return send(405,{error:'Método não permitido.'});
      if(url.pathname==='/api/state')return send(200,queue.view());
      if(url.pathname==='/api/updates')return send(200,updates.view());
      const cover=url.pathname.match(/^\/api\/cover\/(track|album|playlist)\/([a-zA-Z0-9]{22})$/);
      if(cover){const image=await previews.cover(cover[1],cover[2]);res.writeHead(200,{'Content-Type':image.type,'Content-Length':image.bytes.length,'Cache-Control':'private, max-age=600'});res.end(image.bytes);return;}
      const names={'/':'index.html','/app.js':'app.js','/updates.js':'updates.js','/errors.js':'errors.js','/list.js':'list.js','/style.css':'style.css','/spotify-logo.png':'spotify-logo.png'};
      if(!names[url.pathname])return send(404,{error:'Rota inexistente.'});
      let content=await fs.readFile(path.join(path.dirname(fileURLToPath(import.meta.url)),'public',names[url.pathname]));
      if(url.pathname==='/')content=Buffer.from(content.toString().replace('__SESSION__',token));
      res.writeHead(200,{'Content-Type':url.pathname==='/'?'text/html; charset=utf-8':url.pathname.endsWith('.js')?'text/javascript; charset=utf-8':url.pathname.endsWith('.png')?'image/png':'text/css; charset=utf-8'});res.end(content);
    }catch(error){if(!res.headersSent)send(400,{error:safeError(error)});else res.destroy();}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(Number(process.env.IXPOTIFAI_PORT || 4317),'127.0.0.1',resolve);});
  origin=`http://127.0.0.1:${server.address().port}`;
  try{queue ||= await new Queue(root,{providers:process.env.IXPOTIFAI_PROVIDER?[process.env.IXPOTIFAI_PROVIDER]:undefined,downloadRoot:process.env.IXPOTIFAI_DOWNLOAD_DIR}).init();}catch(error){await new Promise(r=>server.close(r));throw error;}
  previews=previewStore(queue,previewOptions);
  try{updates=await new UpdateManager(root,queue,updateOptions).init();}catch(error){await queue.close();await new Promise(r=>server.close(r));throw error;}
  return {server,queue,updates,url:origin,close:async()=>{updates.close();await queue.close();await new Promise(resolve=>{server.close(resolve);const timer=setTimeout(()=>server.closeAllConnections(),2000);timer.unref();server.once('close',()=>clearTimeout(timer));});}};
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const open=url=>{
    const command=process.platform==='win32'?'cmd.exe':process.platform==='darwin'?'open':'xdg-open';
    const args=process.platform==='win32'?['/d','/s','/c','start','""',url]:[url];
    spawn(command,args,{windowsHide:true,stdio:'ignore'}).on('error',()=>{});
  };
  try {
    let app,closing=false;
    const shutdown=async(code=0)=>{if(closing)return;closing=true;const paused=app.queue.paused;await app.close();if(code===75){app.queue.paused=paused;await app.queue.persist();}process.exit(code);};
    app=await createApp({updateOptions:{onRestart:()=>shutdown(75)}});console.log(`ixpotifai disponível em ${app.url}`);
    if(process.connected)process.send({type:'ready',version:app.updates.version});
    process.on('message',message=>{if(message?.type==='shutdown')shutdown();if(message?.type==='update-confirmed')app.updates.phase='updated';});
    if(process.env.IXPOTIFAI_OPEN==='1')open(app.url);
    for(const event of ['SIGINT','SIGTERM'])process.once(event,()=>shutdown());
  }catch(error){
    if(error.code==='EADDRINUSE'){const url=`http://127.0.0.1:${Number(process.env.IXPOTIFAI_PORT || 4317)}`;console.log(`Já existe um aplicativo usando ${url}.`);if(process.env.IXPOTIFAI_OPEN==='1')open(url);}
    else{console.error(safeError(error));process.exitCode=1;}
  }
}
