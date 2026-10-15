import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildPackage} from '../lib/update-package.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const result=await buildPackage(root);
const directory=path.join(root,'dist');await fs.mkdir(directory,{recursive:true});
const name=`ixpotifai-${result.version}.update.json.gz`;
await fs.writeFile(path.join(directory,name),result.compressed);
await fs.writeFile(path.join(directory,name+'.sha256'),`${result.digest}  ${name}\n`);
console.log(JSON.stringify({version:result.version,files:result.files,bytes:result.compressed.length,digest:result.digest,file:path.join(directory,name)},null,2));
