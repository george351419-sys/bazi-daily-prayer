import {packageFixture} from './ritual-package.mjs';
export function packageZiFixture(){
 const old=packageFixture(),answer=64+2*172832+90*7680,b=Buffer.alloc(answer+100*5500);old.copy(b,0,0,64+2*172832);b.writeUInt32LE(b.length,8);b.writeUInt32LE(answer,32);b.writeUInt32LE(5,36);
 for(let a=0;a<100;a++){const off=answer+a*5500;b.writeUInt32LE(300,off);for(let i=0;i<150;i++){b[off+4+i*2]=255;b[off+5+i*2]=0;}}
 return b;
}
