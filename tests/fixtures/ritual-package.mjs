export function packageFixture(){
 const n=64+2*172832+16*7680+100*4800,b=Buffer.alloc(n);b.write('RITUAL1\0','binary');[n,Date.parse('2026-10-29T01:00:00+08:00')/1000,1,100,64,345728,468608,1].forEach((v,i)=>b.writeUInt32LE(v,8+i*4));
 for(const off of [64,64+172832]){b.writeUInt32LE(172800,off);b.writeUInt16LE(720,off+4);b.writeUInt16LE(480,off+6);b[off+8]=6;Buffer.from([0,255,252,224,3,28]).copy(b,off+16);}
 return b;
}
