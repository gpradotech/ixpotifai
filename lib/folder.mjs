import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
export async function browseFolders(directory) {
  const requested=directory || os.homedir();
  if(!path.isAbsolute(requested))throw new Error('Escolha uma pasta válida para salvar suas músicas.');
  try {
    const current=await fs.realpath(requested),entries=await fs.readdir(current,{withFileTypes:true});
    const folders=entries.filter(entry=>entry.isDirectory() && !entry.name.startsWith('.')).map(entry=>({name:entry.name,path:path.join(current,entry.name)})).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
    const parent=path.dirname(current);
    return {directory:current,parent:parent===current?null:parent,home:os.homedir(),folders};
  }catch{throw new Error('Não conseguimos abrir essa pasta. Confira o caminho e as permissões.');}
}
