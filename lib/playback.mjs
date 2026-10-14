import fs from 'node:fs/promises';
import path from 'node:path';

export function byteRange(value,size){
  if(value===undefined)return {start:0,end:size-1,partial:false};
  const match=String(value).match(/^bytes=(\d*)-(\d*)$/);
  if(!match || (!match[1] && !match[2]))return null;
  let start,end;
  if(!match[1]){const suffix=Number(match[2]);if(!Number.isSafeInteger(suffix) || suffix<=0)return null;start=Math.max(0,size-suffix);end=size-1;}
  else {start=Number(match[1]);end=match[2]?Number(match[2]):size-1;}
  if(!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start>=size || start<0 || end<start)return null;
  return {start,end:Math.min(end,size-1),partial:true};
}
export async function streamAudio(req,res,item,fallbackFolder){
  if(item.status!=='completed' || !item.file || path.basename(item.file)!==item.file || !/\.(flac|wav)$/i.test(item.file))throw new Error('Não conseguimos encontrar o áudio para reprodução.');
  const folder=await fs.realpath(item.downloadFolder || fallbackFolder),file=await fs.realpath(path.join(folder,item.file));
  if(path.dirname(file)!==folder)throw new Error('Não conseguimos encontrar o áudio para reprodução.');
  const handle=await fs.open(file,'r');
  try {
    const stat=await handle.stat();if(!stat.isFile())throw new Error('Não conseguimos encontrar o áudio para reprodução.');
    const range=byteRange(req.headers.range,stat.size);
    if(!range){res.writeHead(416,{'Content-Range':`bytes */${stat.size}`,'Content-Length':0});res.end();await handle.close();return;}
    const headers={'Content-Type':/\.wav$/i.test(item.file)?'audio/wav':'audio/flac','Accept-Ranges':'bytes','Content-Length':stat.size?range.end-range.start+1:0};
    if(range.partial)headers['Content-Range']=`bytes ${range.start}-${range.end}/${stat.size}`;
    res.writeHead(range.partial?206:200,headers);
    if(req.method==='HEAD' || !stat.size){res.end();await handle.close();return;}
    const stream=handle.createReadStream({start:range.start,end:range.end});stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
  }catch(error){await handle.close();throw error;}
}
