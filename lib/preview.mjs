import {previewSpotify,spotifyInput} from './metadata.mjs';
import {remote} from './net.mjs';

export async function readCover(value) {
  const url=new URL(value);
  if(!['i.scdn.co','image-cdn-ak.spotifycdn.com','image-cdn-fa.spotifycdn.com','mosaic.scdn.co'].includes(url.hostname))throw new Error('Servidor de capas não reconhecido.');
  const response=await remote(url,{timeout:15000});
  const type=response.headers.get('content-type')?.split(';')[0];
  if(!['image/jpeg','image/png','image/webp','image/avif'].includes(type)){await response.body.cancel();throw new Error('Formato de capa não suportado.');}
  const chunks=[];let size=0;
  for await(const chunk of response.body){size+=chunk.length;if(size>2*1024*1024)throw new Error('A capa excedeu o tamanho permitido.');chunks.push(Buffer.from(chunk));}
  return {type,bytes:Buffer.concat(chunks)};
}
export function previewStore(queue,{reader=previewSpotify,coverReader=readCover}={}) {
  const entries=new Map();
  const key=ref=>`${ref.type}/${ref.id}`;
  function remember(ref,metadata){const entry={metadata,expires:Date.now()+600000};entries.set(key(ref),entry);if(entries.size>50)entries.delete(entries.keys().next().value);return entry;}
  async function get(input) {
    const ref=spotifyInput(input);let entry=entries.get(key(ref));
    if(!entry || entry.expires<Date.now()) {
      const track=ref.type==='track'?queue.items.find(item=>item.track?.id===ref.id)?.track:null;
      entry=remember(ref,track?.title && track?.cover?track:await reader(ref.url));
    }
    const metadata=entry.metadata;
    return {id:ref.id,type:ref.type,title:metadata.title,artist:metadata.artist,cover:metadata.cover?`/api/cover/${key(ref)}`:null};
  }
  async function cover(type,id) {
    const ref=spotifyInput(`https://open.spotify.com/${type}/${id}`);
    let entry=entries.get(key(ref));
    if(!entry){await get(ref.url);entry=entries.get(key(ref));}
    if(!entry.metadata.cover)throw new Error('Capa não disponível.');
    entry.image ||= await coverReader(entry.metadata.cover);
    return entry.image;
  }
  return {get,cover};
}
