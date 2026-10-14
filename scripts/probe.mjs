import {readSpotify,enrichTrack} from '../lib/metadata.mjs';
import {getCandidate,DEFAULT_PROVIDERS} from '../lib/provider.mjs';
import {safeError} from '../lib/net.mjs';
for(const reference of await readSpotify(process.argv[2] || 'https://open.spotify.com/track/7iL6o9tox1zgHpKUfh9vuC')) {
  const track=await enrichTrack(reference);
  console.log(JSON.stringify({title:track.title,artist:track.artist,duration:track.duration,isrc:track.isrc,tidalId:track.tidalId}));
  for(const base of DEFAULT_PROVIDERS)try{const c=await getCandidate(track,base);console.log(JSON.stringify({source:c.source,type:c.type,bits:c.bits,rate:c.rate,quality:c.quality,master:c.identity.master}));}catch(error){console.log(JSON.stringify({source:new URL(base).hostname,error:safeError(error)}));process.exitCode=1;}
}
