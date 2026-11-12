import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {transferStatus,withConnection,withLiveDownload} from '../public/transfer-status.js';

class Element {
 constructor(tag){this.tagName=tag;this.children=[];this.dataset={};}
 append(...items){this.children.push(...items);}
 replaceChildren(...items){this.children=items;}
 setAttribute(){}
}
const all=root=>[root,...root.children.flatMap(child=>typeof child==='object'?all(child):[])];
async function harness(){
 const root=new Element('root'),events=[],listeners=new Map(),timers=new Map(),requests=[];let timerId=0;
 let status={syncConfigured:true,plan:{revision:'old',contentMode:'photo',artworkIds:['photo'],rotationStartDate:'2026-11-12'},preparation:{ready:true},build:{status:'published',sha256:'old'},pendingUpdate:false};
 const photo={id:'photo',source:'upload',status:'complete',title:'照片',image:'/photo'};
 const request=async(url,body)=>{
  requests.push({url,body});
  if(url==='/api/account/artworks')return{items:[photo]};
  if(url==='/api/account/ritual/prepare')return{status:'ready',artworkIds:['today','tomorrow']};
  if(body){status={syncConfigured:true,plan:{...body,revision:body.contentMode+'-new',rotationStartDate:'2026-11-12'},preparation:{ready:false,stage:'queued'},pendingUpdate:true};}
  return status;
 };
 const document={querySelector:s=>s==='#custom-content'?root:null,createElement:t=>new Element(t),createTextNode:text=>({textContent:text,children:[]}),addEventListener:(name,fn)=>listeners.set(name,fn),dispatchEvent:e=>events.push(e)};
 const sandbox={document,URL:{revokeObjectURL(){}},Date,Map,Set,CustomEvent:class{constructor(type,{detail}){this.type=type;this.detail=detail;}},setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id),transferStatus,withConnection,withLiveDownload,renderTransfer:(host,state)=>{host.state=state;host.replaceChildren();},preparePhoto:async()=>{}};
 const source=readFileSync(new URL('../public/custom-photo.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace('export function setupCustomPhoto','function setupCustomPhoto');
 vm.runInNewContext(source+'\nthis.setup=setupCustomPhoto;',sandbox);
 const api=sandbox.setup({request,fetchImage:async()=>'/preview',getUser:()=>({id:'user'})});
 const flush=async()=>{for(let i=0;i<6;i++)await new Promise(resolve=>setImmediate(resolve));};
 await api.refresh();await flush();
 return{root,events,listeners,requests,api,flush,setStatus:value=>status=value,find:text=>all(root).find(e=>e.textContent===text)};
}
test('Web photo save shows new preparation immediately and offers connection during compilation',async()=>{
 const h=await harness();
 const form=all(h.root).find(e=>e.tagName==='form');form.onsubmit({preventDefault(){}});await h.flush();
 const post=h.requests.find(r=>r.body?.contentMode==='photo');assert.deepEqual(Array.from(post.body.artworkIds),['photo']);
 const event=h.events.at(-1);assert.equal(event.detail.result.plan.revision,'photo-new');assert.equal(event.detail.state.phase,'preparing');
 assert.ok(h.find('连接画屏蓝牙与 Wi-Fi'));
 h.api.reset();
});
test('Web switching back to prayer tracks the new plan instead of waiting for old photo revision',async()=>{
 const h=await harness();h.find('切换回祈福图').onclick();await h.flush();
 assert.equal(h.events.at(-1).detail.result.plan.revision,'prayer-new');
 assert.equal(h.events.at(-1).detail.result.plan.contentMode,'prayer');
 h.api.reset();
});
test('Web photo page uses live device progress when package identity matches',async()=>{
 const h=await harness(),now=Date.now();
 const status={syncConfigured:true,device:{id:'112233445566'},plan:{contentMode:'photo',artworkIds:['photo']},preparation:{ready:true},build:{status:'published',sha256:'current',publishedAt:new Date(now-1000).toISOString()},deviceReport:{targetSha:'current',lastSeen:new Date(now).toISOString(),downloadState:1,downloadProgress:10,stale:false},pendingUpdate:false};
 h.setStatus(status);await h.api.refresh();await h.flush();
 h.listeners.get('prayer:ark-download')({detail:{deviceId:'112233445566',state:1,progress:57}});
 assert.equal(h.events.at(-1).detail.state.percent,57);
 h.api.reset();
});

test('companion transfer publisher cannot overwrite photo progress with remembered prayer or failure',()=>{
 const source=readFileSync(new URL('../public/ritual-ui.js',import.meta.url),'utf8');
 const start=source.indexOf(' function updateTransfer('),end=source.indexOf('\n async function refresh()',start),events=[];
 const context={transferStatus,withConnection,withLiveDownload,Date,document:{querySelector:()=>null,dispatchEvent:e=>events.push(e)},CustomEvent:class{constructor(type,{detail}){this.type=type;this.detail=detail;}}};
 vm.runInNewContext(`let lastTransferResult=null,latestGenerated={id:'old-prayer'},generatedArtwork={id:'older-prayer'},prepareFailure={phase:'retrying'},preparing=false,generating=false,connection=null,liveDownload=null,transferPending=false,shell=null;${source.slice(start,end)};this.update=updateTransfer;`,context);
 context.update({syncConfigured:true,plan:{contentMode:'photo',artworkIds:['photo']},preparation:{ready:false,stage:'queued'}});
 assert.equal(events.at(-1).detail.state.phase,'preparing');
});

test('Web refresh preserves removals that have not yet been saved',async()=>{
 const h=await harness();h.find('移除').onclick();await h.api.refresh();await h.flush();
 assert.equal(all(h.root).filter(e=>e.tagName==='article').length,0);
 assert.ok(h.find('轮播有未保存的修改，请点击下方「保存并更新内容」。'));
 h.api.reset();
});
