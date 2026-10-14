import fs from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';

const require=createRequire(import.meta.url);
export function ffmpegPath() {
  if(process.env.SKEETER_FFMPEG)return process.env.SKEETER_FFMPEG;
  try{return require('ffmpeg-static');}catch{return 'ffmpeg';}
}
export function command(args,signal) {
  return new Promise((resolve,reject)=>{
    const child=spawn(ffmpegPath(),args,{windowsHide:true,signal,stdio:['ignore','pipe','pipe']});let stderr='',stdout='';
    child.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-16000);});child.stdout.on('data',chunk=>{stdout=(stdout+chunk).slice(-10000);});
    child.on('error',error=>reject(error.code==='ENOENT'?new Error('FFmpeg não encontrado. Execute a instalação indicada no README.'):error));
    child.on('close',code=>code===0?resolve({stderr,stdout}):reject(new Error('O áudio não passou pela decodificação integral.')));
  });
}
export async function readAudioHeader(file) {
  const handle=await fs.open(file,'r');
  try {
    const bytes=Buffer.alloc(65536);const {bytesRead}=await handle.read(bytes,0,bytes.length,0);const b=bytes.subarray(0,bytesRead);
    if(b.toString('ascii',0,4)==='fLaC')return flacHeader(b);
    if(b.toString('ascii',0,4)==='RIFF' && b.toString('ascii',8,12)==='WAVE') {
      let pos=12,format=null,dataSize=null;
      while(pos+8<=b.length) {const name=b.toString('ascii',pos,pos+4),size=b.readUInt32LE(pos+4);if(name==='fmt '){const code=b.readUInt16LE(pos+8);format={code,channels:b.readUInt16LE(pos+10),rate:b.readUInt32LE(pos+12),align:b.readUInt16LE(pos+20),bits:b.readUInt16LE(pos+22)};if(code===65534 && size>=40)format.code=b.readUInt16LE(pos+32);}if(name==='data'){dataSize=size;break;}pos+=8+size+(size%2);}
      if(!format || ![1,3].includes(format.code) || !dataSize || !format.align)throw new Error('WAV sem PCM válido.');
      const stat=await handle.stat();if(stat.size<pos+8+dataSize)throw new Error('WAV truncado.');
      return {format:'WAV',rate:format.rate,bits:format.bits,channels:format.channels,duration:dataSize/format.align/format.rate};
    }
    throw new Error('O arquivo recebido não é FLAC nem WAV sem perdas.');
  }finally{await handle.close();}
}
export function flacHeader(b) {
  if(b.length<42 || b.toString('ascii',0,4)!=='fLaC' || (b[4]&127)!==0 || b.readUIntBE(5,3)!==34)throw new Error('STREAMINFO do FLAC inválido.');
  const packed=b.readBigUInt64BE(18);const rate=Number(packed>>44n),channels=Number((packed>>41n)&7n)+1,bits=Number((packed>>36n)&31n)+1,samples=Number(packed&0xfffffffffn);
  if(rate<8000 || rate>768000 || bits<8 || bits>32 || !samples)throw new Error('Parâmetros FLAC inválidos.');
  return {format:'FLAC',rate,channels,bits,duration:samples/rate,samples,streamMD5:b.subarray(26,42).toString('hex')};
}
export async function decodeIntegrity(file,audio,signal) {
  const width=audio.format==='FLAC' && [16,24,32].includes(audio.bits)?audio.bits/8:4;
  const format=`s${width*8}le`,md5=createHash('md5');let bytes=0;
  await new Promise((resolve,reject)=>{
    const child=spawn(ffmpegPath(),['-hide_banner','-v','error','-xerror','-err_detect','crccheck+explode','-i',file,'-map','0:a:0','-acodec',`pcm_${format}`,'-f',format,'-'],{windowsHide:true,signal,stdio:['ignore','pipe','pipe']});
    child.stdout.on('data',chunk=>{bytes+=chunk.length;md5.update(chunk);});child.stderr.resume();
    child.on('error',reject);child.on('close',code=>code===0?resolve():reject(new Error('O áudio não passou pela decodificação integral.')));
  });
  const samples=bytes/width/audio.channels;
  if(Math.abs(samples-Math.round(audio.duration*audio.rate))>1)throw new Error('O áudio está truncado ou diverge da duração declarada no arquivo.');
  const checksum=md5.digest('hex');
  if(audio.format==='FLAC' && width===audio.bits/8 && audio.streamMD5!=='00000000000000000000000000000000' && checksum!==audio.streamMD5)throw new Error('A integridade PCM do FLAC diverge do checksum original.');
  return {decodedSamples:samples,pcmMD5:checksum};
}
export async function validateAudio(file,{duration,bits,rate,signal}={}) {
  const audio=await readAudioHeader(file);
  if(duration && Math.abs(audio.duration-duration)>1.5)throw new Error('O arquivo não corresponde à duração da faixa escolhida.');
  if(bits && audio.bits<bits || rate && audio.rate<rate)throw new Error('O arquivo tem resolução inferior à anunciada.');
  const integrity=await decodeIntegrity(file,audio,signal);
  const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);
  return {...audio,...integrity,sha256:hash.digest('hex'),bytes:(await fs.stat(file)).size,validation:'Arquivo sem perdas decodificado integralmente'};
}
export async function remuxFLAC(input,output,signal) {await command(['-hide_banner','-v','error','-xerror','-i',input,'-map','0:a:0','-c:a','copy','-f','flac',output],signal);}
