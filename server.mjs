import http from 'node:http';
import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {spawn} from 'node:child_process';
import {Queue} from './lib/queue.mjs';
import {safeError} from './lib/net.mjs';

export async function createApp({root=path.dirname(fileURLToPath(import.meta.url)),queue}={}) {
  const token=randomBytes(32).toString('hex');let origin;
  const server=http.createServer(async(req,res)=>{
    const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      if(!queue)return send(503,{error:'O aplicativo está iniciando.'});
      if(req.headers.host!==new URL(origin).host)return send(403,{error:'Origem não autorizada.'});
      if(req.headers.origin && req.headers.origin!==origin)return send(403,{error:'Origem não autorizada.'});
      const url=new URL(req.url,origin);
      if(req.method==='POST') {
        const supplied=String(req.headers['x-skeeter-token'] || '');
        if(supplied.length!==token.length || !timingSafeEqual(Buffer.from(supplied),Buffer.from(token)))return send(403,{error:'Sessão inválida. Reabra o aplicativo.'});
        let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>1024*1024)return send(413,{error:'Envie este lote em partes menores.'});}
        const data=JSON.parse(body || '{}');
        if(url.pathname==='/api/add')return send(200,await queue.add(String(data.input || '')));
        if(url.pathname==='/api/action')return send(200,await queue.action(data.action,data.id));
        return send(404,{error:'Rota inexistente.'});
      }
      if(req.method!=='GET')return send(405,{error:'Método não permitido.'});
      if(url.pathname==='/api/state')return send(200,queue.view());
      if(url.pathname.startsWith('/files/')) {
        const id=url.pathname.slice(7);const item=queue.items.find(i=>i.id===id && i.status==='completed');
        if(!item || !item.file || path.basename(item.file)!==item.file)return send(404,{error:'Arquivo não encontrado.'});
        const file=path.join(queue.downloadRoot,item.file);const stat=await fs.stat(file);
        res.writeHead(200,{'Content-Type':'audio/flac','Content-Length':stat.size,'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(item.file)}`});
        createReadStream(file).on('error',()=>res.destroy()).pipe(res);return;
      }
      const names={'/':'index.html','/app.js':'app.js','/style.css':'style.css'};
      if(!names[url.pathname])return send(404,{error:'Rota inexistente.'});
      let content=await fs.readFile(path.join(path.dirname(fileURLToPath(import.meta.url)),'public',names[url.pathname]));
      if(url.pathname==='/')content=Buffer.from(content.toString().replace('__SESSION__',token));
      res.writeHead(200,{'Content-Type':url.pathname==='/'?'text/html; charset=utf-8':url.pathname.endsWith('.js')?'text/javascript; charset=utf-8':'text/css; charset=utf-8'});res.end(content);
    }catch(error){if(!res.headersSent)send(400,{error:safeError(error)});else res.destroy();}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(Number(process.env.SKEETER_PORT || 4317),'127.0.0.1',resolve);});
  origin=`http://127.0.0.1:${server.address().port}`;
  try{queue ||= await new Queue(root,{providers:process.env.SKEETER_PROVIDER?[process.env.SKEETER_PROVIDER]:undefined,downloadRoot:process.env.SKEETER_DOWNLOAD_DIR}).init();}catch(error){await new Promise(r=>server.close(r));throw error;}
  return {server,queue,url:origin,close:async()=>{await queue.close();await new Promise(r=>server.close(r));}};
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const open=url=>{
    const command=process.platform==='win32'?'cmd.exe':process.platform==='darwin'?'open':'xdg-open';
    const args=process.platform==='win32'?['/d','/s','/c','start','""',url]:[url];
    spawn(command,args,{windowsHide:true,stdio:'ignore'}).on('error',()=>{});
  };
  try {
    const app=await createApp();console.log(`Skeeter disponível em ${app.url}`);
    if(process.env.SKEETER_OPEN==='1')open(app.url);
    for(const event of ['SIGINT','SIGTERM'])process.once(event,async()=>{await app.close();process.exit(0);});
  }catch(error){
    if(error.code==='EADDRINUSE'){const url=`http://127.0.0.1:${Number(process.env.SKEETER_PORT || 4317)}`;console.log(`Já existe um aplicativo usando ${url}.`);if(process.env.SKEETER_OPEN==='1')open(url);}
    else{console.error(safeError(error));process.exitCode=1;}
  }
}
