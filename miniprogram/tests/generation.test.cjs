const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
test('today image appears before background preparation completes and reopening never generates twice',async()=>{
 let finish;const pending=new Promise(r=>finish=r),calls=[],app={globalData:{user:{id:'u'}}},ctx={module:{exports:{}},getApp:()=>app,Set,JSON,Error,require:()=>({request:async(url,body)=>{calls.push({url,body});if(url.endsWith('/profile'))return {profile:body};if(url==='/api/analyze')return {id:'job',token:'token'};if(url.includes('/image'))return {id:'art',token:'saved-token',image:'image'};return pending;},image:async()=>'/tmp/today.jpg'})};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../utils/generation.js'),'utf8'),ctx);const g=ctx.module.exports,profile={artStyle:'spirit'},run=g.start(profile);for(let i=0;i<15;i++)await Promise.resolve();assert.equal(g.current().image,'/tmp/today.jpg');assert.equal(g.current().preparing,true);assert.equal(calls.find(c=>c.url.includes('/image')).body.prepareNext,true);await g.start(profile);assert.equal(calls.filter(c=>c.url==='/api/analyze').length,1);finish({status:'queued'});await run;await g.start(profile);assert.equal(calls.filter(c=>c.url==='/api/analyze').length,1);
});
test('reopening the same profile never redraws; only the dedicated redraw action creates B',async()=>{
 let count=0;const app={globalData:{user:{id:'u'}}},calls=[];const ctx={module:{exports:{}},getApp:()=>app,Set,JSON,Error,require:()=>({request:async(url,body)=>{calls.push({url,body});if(url.endsWith('/profile'))return {profile:body};if(url==='/api/analyze')return {id:'job'+(++count),token:'token'};if(url.includes('/image'))return {id:'art'+count,date:'2026-11-13',token:'saved',image:'image'+count};return {status:'queued'};},image:async p=>p})};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../utils/generation.js'),'utf8'),ctx);const g=ctx.module.exports,p={artStyle:'cute'};
 await g.start(p,{requestId:'click-A'});assert.equal(g.current().record.id,'art1');await g.start(p,{requestId:'click-A'});assert.equal(count,1);
 await g.start(p,{requestId:'click-B'});assert.equal(count,1);await g.start(p,{force:true});assert.equal(count,2);assert.equal(g.current().record.id,'art2');assert.equal(app.globalData.pendingPrayerArtwork.id,'art2');await g.start(p,{requestId:'click-B'});assert.equal(count,2);
});
test('photo mode waits for explicit choice, then activates B and offers connection',async()=>{
 const calls=[],app={globalData:{user:{id:'u'}}};let rejectSwitch=false;
 const ctx={module:{exports:{}},getApp:()=>app,Set,JSON,Error,require:()=>({request:async(url,body)=>{calls.push({url,body});if(url.endsWith('/profile'))return {profile:body};if(url==='/api/analyze')return {id:'job',token:'token'};if(url.includes('/image'))return {id:'B',image:'B'};if(url==='/api/account/ritual')return {plan:{contentMode:'photo'}};return body.activatePrayer&&!rejectSwitch?{status:'queued'}:{status:'photo'};},image:async p=>p})};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../utils/generation.js'),'utf8'),ctx);const g=ctx.module.exports;await g.start({artStyle:'cute'},{requestId:'B'});
 assert.equal(calls.some(c=>c.body?.activatePrayer),false);assert.equal(g.current().requiresSwitch,true);assert.equal(app.globalData.pendingPrayerArtwork,undefined);
 rejectSwitch=true;assert.equal(await g.activatePrayer(),false);assert.equal(g.current().requiresSwitch,true);assert.equal(app.globalData.pendingPrayerArtwork,undefined);
 rejectSwitch=false;assert.equal(await g.activatePrayer(),true);assert.equal(g.current().requiresSwitch,false);assert.equal(app.globalData.pendingPrayerArtwork.id,'B');
 await g.refreshMode();assert.equal(g.current().requiresSwitch,false,'confirmed queued switch still offers connection');
 app.globalData.pendingPrayerArtwork=null;await g.refreshMode();assert.equal(g.current().requiresSwitch,true,'manual switch back to photos requires a new explicit choice');
});

test('wish order and object key order do not turn viewing into regeneration',async()=>{
 let count=0;const app={globalData:{user:{id:'u'}}},ctx={module:{exports:{}},getApp:()=>app,Set,JSON,Error,require:()=>({request:async(url,body)=>url.endsWith('/profile')?{profile:body}:url==='/api/analyze'?{id:'job'+(++count),token:'token'}:url.includes('/image')?{id:'art'+count,image:'image'}:{status:'queued'},image:async p=>p})};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../utils/generation.js'),'utf8'),ctx);const g=ctx.module.exports;
 await g.start({artStyle:'cute',wishes:['W02','W20'],birthDate:'1990-01-01'});const pending=app.globalData.pendingPrayerArtwork;await g.start({birthDate:'1990-01-01',wishes:['W20','W02'],artStyle:'cute'});assert.equal(count,1);assert.equal(app.globalData.pendingPrayerArtwork,pending);
 await g.start({birthDate:'1990-01-01',wishes:['W20','W02'],artStyle:'folk'});assert.equal(count,2);
});
