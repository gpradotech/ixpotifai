import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {gzipSync} from 'node:zlib';
import {buildPackage,sha256} from '../lib/update-package.mjs';

export async function fixture(version='0.1.1',{server=`export const version=${JSON.stringify(version)};\n`,dependency='1'}={}) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'ixpotifai-update-'));
  for(const name of ['scripts','lib','public','node_modules','.ixpotifai','downloads'])await fs.mkdir(path.join(root,name));
  const pkg={name:'ixpotifai',version,engines:{node:'>=22.19.0'},dependencies:dependency?{example:dependency}:{}};
  const lock={name:'ixpotifai',version,lockfileVersion:3,packages:{'':{name:'ixpotifai',version,dependencies:pkg.dependencies}}};
  await fs.writeFile(path.join(root,'package.json'),JSON.stringify(pkg));await fs.writeFile(path.join(root,'package-lock.json'),JSON.stringify(lock));
  await fs.writeFile(path.join(root,'server.mjs'),server);
  await fs.writeFile(path.join(root,'scripts/run.mjs'),'// launcher\n');await fs.writeFile(path.join(root,'lib/update-installer.mjs'),'// installer\n');
  await fs.writeFile(path.join(root,'public/app.js'),`// ${version}\n`);
  await fs.writeFile(path.join(root,'node_modules/preserve.txt'),'dependencies');
  await fs.writeFile(path.join(root,'.ixpotifai/state.json'),JSON.stringify({paused:true,downloadFolder:path.join(root,'downloads'),items:[{id:'preserved',status:'completed'}]}));
  await fs.writeFile(path.join(root,'downloads/preserve.flac'),'audio untouched');
  return root;
}
export async function artifact(version='0.1.2',options) {
  const root=await fixture(version,options);
  try{return await buildPackage(root);}finally{await fs.rm(root,{recursive:true,force:true});}
}
export function release(data) {return {tag_name:'v'+data.version,draft:false,prerelease:false,body:'Melhorias de atualização.',assets:[{name:`ixpotifai-${data.version}.update.json.gz`,state:'uploaded',digest:'sha256:'+data.digest,size:data.compressed.length,browser_download_url:`https://github.com/gpradotech/ixpotifai/releases/download/v${data.version}/ixpotifai-${data.version}.update.json.gz`}]};}
export function mutatedPackage(data,mutate) {
  mutate(data);const compressed=gzipSync(JSON.stringify(data));return {compressed,digest:sha256(compressed),version:data.version};
}
export const waitFor=async condition=>{const deadline=Date.now()+5000;while(!condition()){if(Date.now()>deadline)throw new Error('Estado esperado não chegou');await new Promise(resolve=>setTimeout(resolve,10));}};
