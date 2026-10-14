import test from 'node:test';
import assert from 'node:assert/strict';
import {nextListSort,sortDownloads,listPage} from '../public/list.js';

test('ciclo de Título alterna as duas direções e Artista antes de desativar; outras colunas têm três cliques',()=>{
  let sort=null;
  const expected=[['title','asc'],['title','desc'],['artist','asc'],['artist','desc']];
  for(const [key,direction] of expected){sort=nextListSort(sort,'title');assert.equal(sort.key,key);assert.equal(sort.direction,direction);}
  assert.equal(nextListSort(sort,'title'),null);
  for(const column of ['sequence','album','duration','status']){
    let current=nextListSort(sort,column);assert.equal(current.key,column);assert.equal(current.direction,'asc');
    current=nextListSort(current,column);assert.equal(current.direction,'desc');assert.equal(nextListSort(current,column),null);
  }
  assert.equal(nextListSort(nextListSort(null,'album'),'title').step,0);
});

test('ordena metadados em português, duração e status visível; ausentes ficam por último sem alterar números',()=>{
  const items=[
    {sequence:1,track:{title:'Zebra',artist:'Álvaro',album:'Zero',duration:125},status:'failed'},
    {sequence:2,track:{title:'Água',artist:'Zeca',album:'Álbum',duration:65},status:'completed'},
    {sequence:3,track:{title:'barco',artist:'Bia',album:'Barco'},audio:{duration:95},status:'downloading'},
    {sequence:4,track:{title:'água',artist:'Ana',album:'Álbum',duration:125},status:'queued'},
    {sequence:5,status:'cancelled'}
  ];
  const order=(key,direction='asc')=>sortDownloads(items,{key,direction}).map(item=>item.sequence);
  assert.deepEqual(order('title'),[4,2,3,1,5]);assert.deepEqual(order('title','desc'),[1,3,4,2,5]);
  assert.deepEqual(order('artist'),[1,4,3,2,5]);assert.deepEqual(order('artist','desc'),[2,3,4,1,5]);
  assert.deepEqual(order('album'),[4,2,3,1,5]);assert.deepEqual(order('album','desc'),[1,3,4,2,5]);
  assert.deepEqual(order('duration'),[2,3,4,1,5]);assert.deepEqual(order('duration','desc'),[4,1,3,2,5]);
  assert.deepEqual(order('status'),[3,5,2,4,1]);assert.deepEqual(order('status','desc'),[1,4,2,5,3]);
  assert.deepEqual(order('sequence'),[1,2,3,4,5]);assert.deepEqual(order('sequence','desc'),[5,4,3,2,1]);
  assert.deepEqual(sortDownloads(items,null).map(item=>item.sequence),[5,4,3,2,1]);assert.deepEqual(items.map(item=>item.sequence),[1,2,3,4,5]);
});

test('ordena a lista inteira antes de paginar, incluindo novas músicas sob ordenação ativa',()=>{
  const items=Array.from({length:23},(_,i)=>({sequence:i+1,track:{title:'Faixa '+(23-i)}}));
  const sort=nextListSort(null,'title');
  assert.deepEqual(listPage(sortDownloads(items,sort),1).items.map(item=>item.track.title),Array.from({length:10},(_,i)=>'Faixa '+(i+1)));
  assert.equal(listPage(sortDownloads(items,sort),3).items.at(-1).track.title,'Faixa 23');
  items.push({sequence:24,track:{title:'Faixa 0'}});assert.equal(listPage(sortDownloads(items,sort),1).items[0].sequence,24);
});
