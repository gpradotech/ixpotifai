import {jsonURL,remote} from './net.mjs';
import {flacHeader} from './audio.mjs';

export const DEFAULT_PROVIDERS=['https://tracks.monochrome.st'];
export function compatibleRecording(reference,source) {
  const norm=s=>String(s || '').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  if(norm(reference.title)!==norm(source.title))throw new Error('A fonte retornou outra versão ou título.');
  const artists=(source.artists || [source.artist]).filter(Boolean).map(a=>norm(a.name)).join(' ');
  const firstArtist=reference.artists?.[0] || reference.artist;
  if(firstArtist && !artists.includes(norm(firstArtist)))throw new Error('A fonte retornou outro artista.');
  if(reference.isrc && source.isrc && reference.isrc.toUpperCase()!==source.isrc.toUpperCase())throw new Error('O identificador da gravação diverge.');
  if(reference.explicit!==undefined && source.explicit!==undefined && reference.explicit!==source.explicit)throw new Error('A versão explícita/clean diverge.');
  if(reference.duration && source.duration && Math.abs(reference.duration-source.duration)>1.5)throw new Error('A duração diverge da referência; edição não confirmada.');
  return {recording:reference.isrc && source.isrc ? 'ISRC e metadados correlacionados' : 'Metadados correlacionados',master:'Não comprovado'};
}
export function parseManifest(payload) {
  const data=payload.data || payload;
  if(data.assetPresentation && data.assetPresentation!=='FULL')throw new Error('A fonte forneceu apenas uma prévia.');
  if(!['LOSSLESS','HI_RES_LOSSLESS'].includes(data.audioQuality))throw new Error('A fonte não confirmou áudio sem perdas.');
  let decoded;try{decoded=Buffer.from(data.manifest,'base64').toString('utf8');}catch{throw new Error('Manifesto inválido.');}
  if(decoded.trim().startsWith('{')) {
    const manifest=JSON.parse(decoded);
    if(manifest.encryptionType && manifest.encryptionType!=='NONE')throw new Error('Este conector não processa arquivos protegidos por criptografia.');
    if(!String(manifest.codecs || manifest.mimeType).toLowerCase().includes('flac'))throw new Error('O arquivo ofertado não contém FLAC.');
    if(manifest.urls?.length!==1)throw new Error('Manifesto de arquivo não suportado.');
    return {type:'file',urls:manifest.urls,bits:data.bitDepth,rate:data.sampleRate,quality:data.audioQuality};
  }
  if(/<ContentProtection\b/i.test(decoded))throw new Error('Este conector não processa manifests protegidos.');
  if(!/codecs=["']flac["']/i.test(decoded))throw new Error('O áudio segmentado não é FLAC.');
  const tag=decoded.match(/<SegmentTemplate\b([^>]*)>/i)?.[1];
  const attr=name=>tag?.match(new RegExp(`${name}=["']([^"']+)["']`))?.[1]?.replaceAll('&amp;','&');
  const initialization=attr('initialization'),media=attr('media');
  if(!initialization || !media || !media.includes('$Number$'))throw new Error('Manifesto segmentado não suportado.');
  let count=0;
  for(const match of decoded.matchAll(/<S\s+([^>]+)\/?\s*>/g)) {const repeat=Number(match[1].match(/\br=["'](-?\d+)["']/)?.[1] || 0);if(repeat<0)throw new Error('Timeline indefinida não suportada.');count+=repeat+1;}
  if(count<1 || count>10000)throw new Error('Timeline inválida.');
  const start=Number(attr('startNumber') || 1);
  return {type:'dash',urls:[initialization,...Array.from({length:count},(_,i)=>media.replaceAll('$Number$',String(start+i)))],bits:data.bitDepth,rate:data.sampleRate,quality:data.audioQuality};
}
export async function getCandidate(track,base,signal) {
  const root=base.replace(/\/$/,'');
  if(new URL(root).hostname==='tracks.monochrome.st')return monochromeCandidate(track,root,signal);
  if(!track.tidalId)throw new Error('Esta faixa não tem correspondência Tidal.');
  const infoPayload=await jsonURL(`${root}/info/?id=${track.tidalId}`,{signal});
  const info=infoPayload.data || infoPayload;
  const identity=compatibleRecording(track,info);
  const payload=await jsonURL(`${root}/track/?id=${track.tidalId}&quality=HI_RES_LOSSLESS`,{signal,timeout:60000});
  const manifest=parseManifest(payload);
  if(info.mediaMetadata?.tags?.includes('HIRES_LOSSLESS') && manifest.quality!=='HI_RES_LOSSLESS')throw new Error('Existe versão de maior resolução, mas a fonte não a entregou.');
  return {...manifest,identity,source:new URL(root).hostname};
}

export async function monochromeCandidate(track,base,signal) {
  const data=await jsonURL(`${base}/search/tracks?q=${encodeURIComponent(`${track.artist} ${track.title}`)}&limit=100`,{signal});
  // A title match is insufficient. Require an exact recording identifier here.
  if(!track.isrc)throw new Error('Falta o ISRC para escolher uma gravação nesta fonte.');
  const matches=(data.tracks || []).filter(t=>t.playable!==false && t.isrc?.toUpperCase()===track.isrc.toUpperCase());
  const candidates=[];
  for(const item of matches) {
    try {
      const identity=compatibleRecording(track,{title:item.title,artists:(item.artistNames || []).map(name=>({name})),duration:item.duration/1000,isrc:item.isrc,explicit:item.explicit});
      if(!/^[a-zA-Z0-9_-]+$/.test(String(item.id)))continue;
      candidates.push({type:'file',urls:[`${base}/track/${item.id}`],quality:'LOSSLESS',identity,source:new URL(base).hostname,sourceId:String(item.id),resolutionClaim:'Não informada pela fonte'});
    }catch{/* Rejeitar versões que divergem; não aceitar outro ISRC como fallback. */}
  }
  if(!candidates.length)throw new Error('Esta fonte não tem uma versão compatível com o ISRC e a duração escolhidos.');
  for(const candidate of candidates) {
    const response=await remote(candidate.urls[0],{signal,headers:{Range:'bytes=0-4095'}});
    const reader=response.body.getReader();const chunks=[];let count=0;
    try{while(count<42){const {done,value}=await reader.read();if(done)break;chunks.push(Buffer.from(value));count+=value.length;}}finally{await reader.cancel();}
    const audio=flacHeader(Buffer.concat(chunks));
    if(Math.abs(audio.duration-track.duration)>1.5)throw new Error('Um arquivo da fonte diverge da duração da gravação.');
    Object.assign(candidate,{bits:audio.bits,rate:audio.rate,channels:audio.channels,resolutionClaim:'Cabeçalho FLAC conferido'});
  }
  const best=candidates.find(a=>candidates.every(b=>a.bits>=b.bits && a.rate>=b.rate));
  if(!best)throw new Error('As resoluções da fonte são diferentes e não há uma versão superior em todos os parâmetros.');
  return {...best,qualityScope:'Maior resolução entre os arquivos compatíveis que esta fonte retornou'};
}
