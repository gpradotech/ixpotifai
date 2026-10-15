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
  const artists=(entity.artists || []).map(a=>a.name).filter(Boolean);
  if(!artists.length && entity.subtitle)artists.push(...entity.subtitle.split(',').map(s=>s.trim()).filter(Boolean));
  return {id:entity.id || entity.uri?.split(':').at(-1),title:entity.title || entity.name,
    artist:artists.join(', '),artists,
    duration:entity.duration ? entity.duration/1000 : null,explicit:entity.isExplicit,
    releaseDate:entity.releaseDate?.isoString?.slice(0,10),
    cover:entity.visualIdentity?.image?.at(-1)?.url || null,album:entity.album?.name || entity.album?.title || entity.albumName || null};
}
async function spotifyEntity(input,signal) {
  const parsed=spotifyInput(input);
  const html=await smallBody(await remote(`https://open.spotify.com/embed/${parsed.type}/${parsed.id}`,{signal}));
  const entity=nextData(html)?.props?.pageProps?.state?.data?.entity;
  if(!entity)throw new Error('Não foi possível ler os metadados desta referência.');
  return {parsed,entity};
}
export async function previewSpotify(input,signal) {
  const {parsed,entity}=await spotifyEntity(input,signal);
  return {...entityMetadata(entity),type:parsed.type,id:parsed.id,spotifyUrl:parsed.url};
}
function publicEntity(html,type,id) {
  const encoded=html.match(/<script[^>]*id=["']initialState["'][^>]*>([\s\S]*?)<\/script>/)?.[1];
  if(!encoded)return null;
  return JSON.parse(Buffer.from(encoded,'base64').toString('utf8')).entities?.items?.[`spotify:${type}:${id}`] || null;
}
export function publicTrackAlbum(html,id){return publicEntity(html,'track',id)?.albumOfTrack?.name || null;}
export function publicPlaylistData(html,id) {
  const encoded=html.match(/<script[^>]*id=["']initialState["'][^>]*>([\s\S]*?)<\/script>/)?.[1];
  if(!encoded)throw new Error('Não conseguimos confirmar todas as faixas desta playlist.');
  const state=JSON.parse(Buffer.from(encoded,'base64').toString('utf8'));
  const entity=state.entities?.items?.[`spotify:playlist:${id}`];
  const total=entity?.content?.totalCount;
  if(!Number.isInteger(total) || total<0)throw new Error('Não conseguimos confirmar todas as faixas desta playlist.');
  const tracks=(entity.content.items || []).map(item=>{
    const track=item.itemV2?.data;
    if(track?.__typename!=='Track' || !/^spotify:track:[a-zA-Z0-9]{22}$/.test(track.uri || ''))throw new Error('Esta playlist contém um item que não conseguimos importar.');
    const id=track.uri.split(':').at(-1),artists=(track.artists?.items || []).map(a=>a.profile?.name).filter(Boolean);
    const cover=(track.albumOfTrack?.coverArt?.sources || []).slice().sort((a,b)=>(b.width || 0)-(a.width || 0))[0]?.url;
    return {id,title:track.name,artist:artists.join(', '),artists,album:track.albumOfTrack?.name || null,duration:track.duration?.totalMilliseconds/1000,explicit:track.contentRating?.label==='EXPLICIT',cover:cover || null,spotifyUrl:`https://open.spotify.com/track/${id}`};
  });
  // Only return public musical metadata; session fields are never retained.
  return {total,tracks};
}
export function completePlaylist(embedTracks,page) {
  if(page.tracks.length===page.total)return page.tracks;
  if(embedTracks.length!==page.total || page.tracks.some((track,index)=>embedTracks[index]?.id!==track.id))throw new Error('Não conseguimos confirmar todas as faixas desta playlist. Ela pode ter mudado ou estar incompleta.');
  return embedTracks.map((track,index)=>page.tracks[index] || track);
}
async function fillTrackMetadata(tracks,signal) {
  let cursor=0;const completed=new Map();
  await Promise.all(Array.from({length:Math.min(4,tracks.length)},async()=>{
    while(cursor<tracks.length){const index=cursor++,track=tracks[index];
      if(track.cover && track.artists?.length && track.album)continue;
      if(!completed.has(track.id))completed.set(track.id,readSpotify(track.spotifyUrl,signal).then(rows=>rows[0]));
      tracks[index]=await completed.get(track.id);
    }
  }));
  return tracks;
}
export async function readSpotify(input,signal) {
  const {parsed,entity}=await spotifyEntity(input,signal);
  if(parsed.type==='track'){
    const track={...entityMetadata(entity),spotifyUrl:parsed.url};
    if(!track.album)try{track.album=publicTrackAlbum(await smallBody(await remote(parsed.url,{signal})),parsed.id);}catch(error){if(signal?.aborted || error.status===429)throw signal?.aborted?signal.reason:error;}
    return [track];
  }
  const items=entity.trackList || entity.tracks?.items || [];
  const tracks=items.map(row=>row.track || row).map(row=>({...entityMetadata(row),spotifyUrl:`https://open.spotify.com/track/${row.id || row.uri?.split(':').at(-1)}`})).filter(row=>row.id && row.title);
  if(parsed.type==='playlist') {
    const html=await smallBody(await remote(parsed.url,{signal}));
    const page=publicPlaylistData(html,parsed.id);
    const complete=completePlaylist(tracks,page);
    if(!complete.length)throw new Error('Esta playlist está vazia. Adicione músicas antes de baixar.');
    return fillTrackMetadata(complete,signal);
  }
  if(parsed.type==='album')for(const track of tracks){track.cover ||= entityMetadata(entity).cover;track.album ||= entity.title || entity.name || null;}
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
      if(id){const data=await jsonURL(`https://api.deezer.com/track/${id}`,{signal});enriched.album ||= data.album?.title;enriched.isrc ||= data.isrc;}
    }catch(error){if(error.status===429 || signal?.aborted)throw error;/* A correlação existente continua disponível; não inventar valores. */}
  }
  if(!enriched.isrc)throw new Error('Não foi possível obter um ISRC para correlacionar a gravação.');
  return enriched;
}
