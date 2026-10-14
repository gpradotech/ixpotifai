import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Queue} from '../lib/queue.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const run=path.join(root,'.ixpotifai',`verification-${Date.now()}`);
const queue=await new Queue(run).init();
try {
  await queue.add(process.argv[2] || 'https://open.spotify.com/track/7iL6o9tox1zgHpKUfh9vuC');
  const deadline=Date.now()+180000;
  while(queue.active || queue.items.some(i=>i.status==='queued')){if(Date.now()>deadline)throw new Error('O teste excedeu três minutos.');await new Promise(r=>setTimeout(r,500));}
  const item=queue.items[0];if(item.status!=='completed')throw new Error(item.error || item.status);
  const proof={testedAt:new Date().toISOString(),title:item.track.title,isrc:item.track.isrc,source:item.source,audio:item.audio,identity:item.identity,file:path.relative(root,path.join(queue.downloadRoot,item.file))};
  await fs.writeFile(path.join(root,'docs','VERIFICACAO-LIVE.json'),JSON.stringify(proof,null,2));
  console.log(JSON.stringify(proof,null,2));
}finally{await queue.close();}
