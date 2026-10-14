import {remote,smallBody,jsonURL} from './net.mjs';

export function spotifyInput(value) {
  const raw=value.trim();
  const uri=raw.match(/^spotify:(track|album|playlist):([A-Za-z0-9]{22})$/);
  if(uri)return {type:uri[1],id:uri[2],url:`https://open.spotify.com/${uri[1]}/${uri[2]}`};
  let url;try{url=new URL(raw);}catch{throw new Error('Cole um link de faixa, álbum ou playlist do Spotify.');}
  if(url.hostname!=='open.spotify.com' || url.protocol!=='https:' || url.username || url.password || url.port)throw new Error('O link precisa ser do Spotify, usando HTTPS, sem credenciais ou porta personalizada.');
  const match=url.pathname.match(/^\/(?:intl-[a-z-]+\/)?(track|album|playlist)\/([A-Za-z0-9]{22})\/?$/i);
  if(!match)throw new Error('Link de música, álbum ou playlist inválido.');
  return {type:match[1],id:match[2],url:`https://open.spotify.com/${match[1]}/${match[2]}`};
}
export function nextData(html) {
  const match=html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/);
  if(!match)throw new Error('A estrutura de metadados da fonte mudou.');
  return JSON.parse(match[1]);
}
export function entityMetadata(entity) {
  return {id:entity.id || entity.uri?.split(':').at(-1),title:entity.title || entity.name,
    artist:(entity.artists || []).map(a=>a.name).join(', ') || entity.subtitle || '',
    artists:(entity.artists || []).map(a=>a.name),
    duration:entity.duration ? entity.duration/1000 : null,explicit:entity.isExplicit,
    releaseDate:entity.releaseDate?.isoString?.slice(0,10),
    cover:entity.visualIdentity?.image?.at(-1)?.url || null};
}
export async function readSpotify(input,signal) {
  const parsed=spotifyInput(input);
  const html=await smallBody(await remote(`https://open.spotify.com/embed/${parsed.type}/${parsed.id}`,{signal}));
  const entity=nextData(html)?.props?.pageProps?.state?.data?.entity;
  if(!entity)throw new Error('Não foi possível ler os metadados desta referência.');
  if(parsed.type==='track')return [{...entityMetadata(entity),spotifyUrl:parsed.url}];
  if(parsed.type==='playlist' && !entity.totalTracks && !entity.tracks?.total)throw new Error('O Spotify não informou o total desta playlist no acesso público. A importação foi interrompida para evitar uma lista incompleta; cole os links das faixas.');
  const items=entity.trackList || entity.tracks?.items || [];
  const tracks=items.map(row=>row.track || row).map(row=>({...entityMetadata(row),spotifyUrl:`https://open.spotify.com/track/${row.id || row.uri?.split(':').at(-1)}`})).filter(row=>row.id && row.title);
  if(!tracks.length)throw new Error('Esta lista não disponibiliza faixas no acesso público. Cole os links individuais.');
  const total=entity.totalTracks || entity.tracks?.total;
  if((total && total>tracks.length) || (!total && tracks.length>=100))throw new Error('A fonte pode ter entregado apenas parte da lista. Use links individuais para não perder faixas.');
  return tracks;
}
export function parseSonglink(data) {
  const page=data?.props?.pageProps?.pageData;
  if(!page)return null;
  const links={};for(const section of page.sections || [])for(const item of section.links || [])if(item.url)links[item.platform]=item.url;
  return {isrc:page.entityData?.isrc?.toUpperCase(),tidalId:links.tidal?.match(/\/track\/(\d+)/)?.[1],deezerUrl:links.deezer};
}
export async function enrichTrack(track,signal) {
  const html=await smallBody(await remote(`https://song.link/s/${track.id}`,{signal}));
  const mapping=parseSonglink(nextData(html));
  if(!mapping)throw new Error('Não foi possível correlacionar esta faixa entre os serviços.');
  const enriched={...track,...mapping};
  if(mapping.deezerUrl) {
    try{
      const id=new URL(mapping.deezerUrl).pathname.match(/\/track\/(\d+)/)?.[1];
      if(id){const data=await jsonURL(`https://api.deezer.com/track/${id}`,{signal});enriched.album=data.album?.title;enriched.isrc ||= data.isrc;}
    }catch{/* A correlação existente continua disponível; não inventar valores. */}
  }
  if(!enriched.isrc)throw new Error('Não foi possível obter um ISRC para correlacionar a gravação.');
  return enriched;
}
