import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';

export const MAX_PACKAGE_BYTES=32*1024*1024;
const MAX_CONTENT_BYTES=96*1024*1024;
const top=new Set(['README.md','package.json','package-lock.json','server.mjs','start.command','Iniciar ixpotifai.cmd','.gitignore','.gitattributes']);
const roots=new Set(['lib','public','scripts','docs','tests']);
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export function versionParts(value){const match=String(value).match(/^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);return match?match.slice(1).map(Number):null;}
export function newerVersion(candidate,current){const a=versionParts(candidate),b=versionParts(current);if(!a || !b)return false;for(let i=0;i<3;i++)if(a[i]!==b[i])return a[i]>b[i];return false;}
export function managedPath(name) {
  if(typeof name!=='string' || name.length>240 || name.includes('\\') || name.includes(':') || /[\x00-\x1f]/.test(name))return false;
  const parts=name.split('/');
  if(parts.some(part=>!part || part==='.' || part==='..' || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)))return false;
  if(parts.some(part=>/^\.(?:git|ixpotifai|env)(?:$|\.)/i.test(part)) && !top.has(name))return false;
  if(/\.(flac|wav|mp3|m4a|ogg|part)$/i.test(name))return false;
  return top.has(name) || (parts.length>1 && roots.has(parts[0]));
}
export async function safeTarget(root,name) {
  if(!managedPath(name))throw new Error('Não conseguimos validar os arquivos da atualização.');
  let current=root;
  for(const part of name.split('/')) {
    current=path.join(current,part);
    try{const stat=await fs.lstat(current);if(stat.isSymbolicLink())throw new Error('Não conseguimos atualizar uma instalação com atalhos nos arquivos do aplicativo.');}
    catch(error){if(error.code!=='ENOENT')throw error;}
  }
  return current;
}
export function decodePackage(compressed,{digest,version}={}) {
  if(compressed.length>MAX_PACKAGE_BYTES || !/^[a-f0-9]{64}$/.test(digest || '') || sha256(compressed)!==digest)throw new Error('Não conseguimos confirmar a integridade da atualização. Tente novamente.');
  let data;try{data=JSON.parse(gunzipSync(compressed,{maxOutputLength:MAX_CONTENT_BYTES}).toString('utf8'));}catch{throw new Error('Não conseguimos abrir o pacote de atualização.');}
  if(data.format!==1 || data.version!==version || !versionParts(data.version) || !Array.isArray(data.files) || data.files.length<5 || data.files.length>2000)throw new Error('Não conseguimos validar esta versão do aplicativo.');
  const names=new Set(),caseNames=new Set();let bytes=0;
  for(const file of data.files) {
    if(!managedPath(file.path) || caseNames.has(file.path.toLowerCase()) || ![0o644,0o755].includes(file.mode) || typeof file.content!=='string' || !/^[a-f0-9]{64}$/.test(file.sha256 || ''))throw new Error('Não conseguimos validar os arquivos da atualização.');
    const content=Buffer.from(file.content,'base64');bytes+=content.length;
    if(content.toString('base64')!==file.content || bytes>MAX_CONTENT_BYTES || sha256(content)!==file.sha256)throw new Error('Não conseguimos confirmar a integridade dos arquivos da atualização.');
    names.add(file.path);caseNames.add(file.path.toLowerCase());
  }
  for(const required of ['package.json','package-lock.json','server.mjs','scripts/run.mjs','lib/update-installer.mjs'])if(!names.has(required))throw new Error('Não conseguimos encontrar todos os arquivos da atualização.');
  const json=name=>JSON.parse(Buffer.from(data.files.find(file=>file.path===name).content,'base64').toString('utf8'));
  const pkg=json('package.json'),lock=json('package-lock.json');
  if(pkg.name!=='ixpotifai' || pkg.version!==version || lock.version!==version || lock.packages?.['']?.version!==version || data.runnerProtocol!==1)throw new Error('Não conseguimos confirmar a versão do pacote de atualização.');
  const minimum=pkg.engines?.node?.match(/^>=(\d+\.\d+\.\d+)$/)?.[1];
  if(!minimum || newerVersion(minimum,process.versions.node))throw new Error('Esta atualização precisa de uma versão mais recente do Node.js. Atualize o Node.js antes de continuar.');
  return data;
}
export async function buildPackage(root) {
  const files=[];
  async function add(name) {
    const target=roots.has(name)?path.join(root,name):await safeTarget(root,name),stat=await fs.lstat(target);
    if(stat.isSymbolicLink())throw new Error('O pacote não pode conter atalhos.');
    if(stat.isDirectory()){for(const entry of (await fs.readdir(target)).sort())await add(`${name}/${entry}`);return;}
    if(!stat.isFile())throw new Error('O pacote só pode conter arquivos comuns.');
    const content=await fs.readFile(target);
    files.push({path:name,mode:name==='start.command'?0o755:0o644,sha256:sha256(content),content:content.toString('base64')});
  }
  for(const name of [...top,...roots].sort())try{await add(name);}catch(error){if(error.code!=='ENOENT')throw error;}
  const version=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8')).version;
  const compressed=gzipSync(JSON.stringify({format:1,runnerProtocol:1,version,files}),{level:9});
  const digest=sha256(compressed);decodePackage(compressed,{digest,version});
  return {version,compressed,digest,files:files.length};
}
