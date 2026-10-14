import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {command,validateAudio,readAudioHeader,remuxFLAC} from '../lib/audio.mjs';

test('FLAC: integridade PCM, resolução e duração; rejeita truncamento, HTML e resolução inferior',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'skeeter-audio-'));
  try {
    const file=path.join(dir,'original.flac');
    await command(['-v','error','-f','lavfi','-i','sine=frequency=997:sample_rate=48000:duration=2','-ac','2','-c:a','flac','-sample_fmt','s32',file]);
    const audio=await validateAudio(file,{duration:2,bits:24,rate:48000});assert.equal(audio.bits,24);assert.equal(audio.decodedSamples,96000);assert.equal(audio.pcmMD5,audio.streamMD5);assert.equal(audio.sha256.length,64);
    await assert.rejects(validateAudio(file,{bits:32}),/inferior/);await assert.rejects(validateAudio(file,{duration:10}),/duração/);
    const content=await fs.readFile(file);await fs.writeFile(path.join(dir,'broken.flac'),content.subarray(0,content.length-2000));await assert.rejects(validateAudio(path.join(dir,'broken.flac')));
    await fs.writeFile(path.join(dir,'fake.flac'),'<html>not audio</html>');await assert.rejects(readAudioHeader(path.join(dir,'fake.flac')),/não é FLAC/);
    const remux=path.join(dir,'remux.flac');await remuxFLAC(file,remux);const copied=await validateAudio(remux);assert.equal(copied.pcmMD5,audio.pcmMD5);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('WAV PCM validado sem alterações e sem confiar apenas na extensão',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'skeeter-wav-'));
  try{const file=path.join(dir,'pcm.wav');await command(['-v','error','-f','lavfi','-i','sine=duration=1','-c:a','pcm_s16le',file]);const audio=await validateAudio(file,{duration:1});assert.equal(audio.format,'WAV');assert.equal(audio.bits,16);const b=await fs.readFile(file);await fs.writeFile(file,b.subarray(0,b.length-100));await assert.rejects(validateAudio(file),/truncado/);}finally{await fs.rm(dir,{recursive:true,force:true});}
});
