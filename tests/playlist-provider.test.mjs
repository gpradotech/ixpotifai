import test from 'node:test';
import assert from 'node:assert/strict';
import {publicPlaylistData,completePlaylist,entityMetadata} from '../lib/metadata.mjs';
import {monochromeCandidate} from '../lib/provider.mjs';
import {friendlyError} from '../public/errors.js';

const id='2364CtKIeJNVUnZZHKrzIr',other='0000000000000000000002';
const row=(id)=>({id,title:'Faixa',artist:'Artista',artists:['Artista']});
test('playlist pública confirma o total e combina as faixas sem descartar entradas',()=>{
  const entity={content:{totalCount:2,items:[{itemV2:{data:{__typename:'Track',uri:'spotify:track:'+id,name:'Faixa',artists:{items:[{profile:{name:'Artista'}}]},duration:{totalMilliseconds:1000},contentRating:{label:'EXPLICIT'},albumOfTrack:{coverArt:{sources:[{width:640,url:'https://i.scdn.co/cover'}]}}}}}]}};
  const state={session:{accessToken:'must-not-retain'},entities:{items:{['spotify:playlist:'+other]:entity}}};
  const html=`<script id="initialState" type="text/plain">${Buffer.from(JSON.stringify(state)).toString('base64')}</script>`;
  const page=publicPlaylistData(html,other),tracks=completePlaylist([row(id),row(other)],page);
  assert.equal(tracks.length,2);assert.equal(tracks[0].cover,'https://i.scdn.co/cover');assert.equal(tracks[0].explicit,true);
  assert.equal(JSON.stringify(page).includes('must-not-retain'),false);
  assert.throws(()=>completePlaylist([row(id)],page),/confirmar todas/);
  assert.throws(()=>completePlaylist([row(other),row(id)],page),/confirmar todas/);
  assert.deepEqual(entityMetadata({title:'Faixa',subtitle:'Artista,\u00a0Convidado'}).artists,['Artista','Convidado']);
});
test('playlist completa na página dispensa embed parcial; metadados indisponíveis não são ignorados',()=>{
  assert.equal(completePlaylist([row(id)],{total:2,tracks:[row(id),row(other)]}).length,2);
  assert.throws(()=>publicPlaylistData('<html></html>',other),/confirmar todas/);
  const state={entities:{items:{['spotify:playlist:'+other]:{content:{totalCount:1,items:[{itemV2:{data:{__typename:'Episode',uri:'spotify:episode:'+id}}}]}}}}};
  assert.throws(()=>publicPlaylistData(`<script id="initialState">${Buffer.from(JSON.stringify(state)).toString('base64')}</script>`,other),/não conseguimos importar/);
});
function header(){const b=Buffer.alloc(42);b.write('fLaC');b[4]=128;b.writeUIntBE(34,5,3);b.writeBigUInt64BE((44100n<<44n)|(1n<<41n)|(15n<<36n)|441000n,18);return b;}
test('busca alternativa amplia a cobertura sem aceitar outro ISRC ou áudio de qualidade inferior',async()=>{
  const queries=[],ref={title:'Faixa',artist:'Artista, Convidado',artists:['Artista','Convidado'],duration:10,isrc:'BR1234567890',explicit:true};
  const dependencies={readJSON:async url=>{const query=new URL(url).searchParams.get('q');queries.push(query);return {tracks:query==='Artista Faixa'?[{id:'123',title:'Faixa',artistNames:['Artista','Convidado'],duration:10000,isrc:ref.isrc,explicit:true}]:[]};},request:async()=>new Response(header())};
  const result=await monochromeCandidate(ref,'https://tracks.monochrome.st',undefined,dependencies);
  assert.deepEqual(queries,['Artista, Convidado Faixa','Artista Faixa']);assert.equal(result.bits,16);assert.equal(result.rate,44100);
  let requests=0;await assert.rejects(monochromeCandidate(ref,'https://tracks.monochrome.st',undefined,{readJSON:async()=>({tracks:[{id:'other',isrc:'DIFFERENT'}]}),request:async()=>{requests++;return new Response(header());}}),/não está disponível/);assert.equal(requests,0);
  assert.equal(friendlyError('Essa gravação ainda não está disponível na fonte de áudio atual.'),'Essa gravação ainda não está disponível na fonte de áudio atual.');
});
