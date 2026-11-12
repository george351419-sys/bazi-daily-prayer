// Approved user-facing copy. One description paragraph per state.
const STATUS_COPY = {
  "S01": {
    "title": "正在连接画屏",
    "detail": "正在读取画屏状态，请稍候。"
  },
  "S02": {
    "title": "先许愿，生成你的祈福图",
    "detail": ""
  },
  "S03": {
    "title": "当前画屏使用自定义照片",
    "detail": "若要显示祈福画，请到「自定义」切换为祈福图并保存。"
  },
  "S04": {
    "title": "正在准备这幅画的同步内容",
    "detail": "准备好后会自动安排同步，请稍候。"
  },
  "S05": {
    "title": "内容准备暂未完成 · 后台正在重试",
    "detail": "恢复后会继续准备内容；画屏会保留原有画面，暂时不用操作。"
  },
  "S06": {
    "title": "正在排队准备画屏内容",
    "detail": "准备好后会自动安排同步，暂时不用连接画屏。"
  },
  "S07": {
    "title": "正在准备今日和明日的画作",
    "detail": "画作准备好后会自动转换并安排同步，请稍候。"
  },
  "S08": {
    "title": "正在制作画屏内容",
    "detail": "正在生成适合画屏显示的画面与微行动，请稍候。"
  },
  "S09": {
    "title": "正在保存画屏内容包 · {percent}%",
    "detail": "正在保存画屏内容，完成后画屏联网即可自动领取。"
  },
  "S10": {
    "title": "画屏内容已准备好 · 请先绑定画屏",
    "detail": "请前往「链接神物」连接并绑定画屏。绑定完成后，设备联网会自动领取内容。"
  },
  "S11": {
    "title": "画屏内容已就绪 · 正在安排下发",
    "detail": "内容已准备好，正在发布到画屏。发布完成后，画屏联网会自动领取，请稍候。"
  },
  "S12": {
    "title": "正在准备画屏内容",
    "detail": "内容正在准备，完成后画屏联网会自动领取，请稍候。"
  },
  "S13": {
    "title": "请先更新画屏固件",
    "detail": "当前固件不能接收这份内容，请到「链接神物」更新固件。"
  },
  "S14": {
    "title": "内容已就绪 · 等待画屏领取",
    "detail": "请唤醒画屏并保持 Wi-Fi 联网，设备会自动检查并领取新内容。"
  },
  "S15": {
    "title": "等待画屏检查新内容",
    "detail": "还没有收到这份内容的最新设备回报。请唤醒画屏并保持 Wi-Fi 联网，设备会自动检查并领取；无需重新生成或重复配网。"
  },
  "S16": {
    "title": "画屏已联网 · 正在确认当前内容",
    "detail": "画屏已联网，正在核对这次内容，请稍候。"
  },
  "S17": {
    "title": "正在传输到画屏 · {percent}%",
    "detail": "请保持画屏联网。内容保存后会提示你去画屏查看。"
  },
  "S18": {
    "title": "正在传输到画屏 · {percent}%",
    "detail": "这是画屏最近回报的下载进度，请保持联网；内容保存后即可去画屏查看。"
  },
  "S19": {
    "title": "下载完成 · 正在确认内容已保存",
    "detail": "画屏已完成下载，正在确认内容保存结果。请稍候，无需重新生成或重新连接。"
  },
  "S20": {
    "title": "内容已保存 · 现在可以进入画面",
    "detail": "请在画屏上选择「画面」并按确认键查看。设备回报刷新后，网页或小程序会自动更新状态。"
  },
  "S21": {
    "title": "新内容已在画屏刷新",
    "detail": "画屏已回报新内容刷新完成。现在可以进入「画面」查看。"
  },
  "S22": {
    "title": "内容已保存 · 现在可以进入画面",
    "detail": "请在画屏上选择「画面」并按确认键查看。设备回报刷新后，网页或小程序会自动更新状态。"
  },
  "S23": {
    "title": "新内容已在画屏刷新",
    "detail": "画屏已回报新内容刷新完成。现在可以进入「画面」查看。"
  },
  "S24": {
    "title": "同步暂未完成 · 设备会重试",
    "detail": "请保持画屏开机并联网，设备会再次尝试领取；无需重新生成内容。"
  },
  "S25": {
    "title": "画屏已联网 · 正在确认同步结果",
    "detail": "画屏已联网，正在核对内容保存和画面刷新状态。请稍候，无需重新连接或重复发送。"
  },
  "S26": {
    "title": "新画正在生成 · 画屏暂时显示上一幅",
    "detail": "新画完成后会自动准备并同步。现在不用操作，也不必重新连接画屏。"
  }
};
function copyState(id,phase,step=0,percent=null){
 const text=STATUS_COPY[id],title=text.title.replace(' · {percent}%',percent===null?'':' · '+percent+'%');
 return {phase,title,detail:text.detail,step,percent};
}
function completed(id,phase,step,report){
 return {...copyState(id,phase,step),completedAt:report?.lastSeen||null};
}
export function transferStatus(result = {}, artworkId = null, generating = false) {
 result = result ?? {};
 // 用户正在重新生成新画：此刻后端 plan/build/deviceReport 仍是上一幅画的快照，
 // 任何 stored/delivered 完成态都属于旧画，必须先于一切判定短路成"新画生成中"，
 // 否则上一幅的"✓ 本次同步已完成"会串台到正在生成的新画上（带旧回执时间）。
 if(generating)return copyState('S26','generating');
if(result.syncConfigured===undefined)return copyState('S01','checking');
 if(!result.syncConfigured&&!result.plan)return copyState('S02','unbound');
 if(artworkId&&result.plan?.contentMode==='photo')return copyState('S03','photo');
 if(artworkId&&!result.plan?.artworkIds?.includes(artworkId))return copyState('S04','preparing');
 if(result.preparation?.stage==='retrying'||(result.build?.status==='retrying'&&(!result.build.attemptedRevision||result.build.attemptedRevision===result.plan?.revision))){
  const stage=result.build?.failure?.stage;
  const titles={uploading:'内容包上传失败 · 后台正在重试',publishing:'内容包发布失败 · 后台正在重试',encoding:'图片转换暂未完成 · 后台正在重试',images:'读取原图暂未完成 · 后台正在重试'};
  if(titles[stage])return {...copyState('S05','retrying'),title:titles[stage],detail:['uploading','publishing'].includes(stage)?'已完成的内容会继续复用，恢复后自动继续；无需重新上传照片或重新配网。':'后台会继续处理，画屏保留原有画面。',failureStage:stage,action:null,retryAt:result.build.nextAttemptAt||null};
  return copyState('S05','retrying');
 }
 const prep=result.preparation;
 if(prep&&!prep.ready){
  const stage=prep.stage,count=prep.progress,percent=stage==='uploading'&&count?.total>0?Math.round(count.completed/count.total*100):null;
  return {...copyState({queued:'S06',images:'S07',encoding:'S08',uploading:'S09'}[stage]||'S06','preparing',0,percent),preparation:true,preparationStep:{queued:0,images:0,encoding:1,uploading:2}[stage]||0};
 }
 if(!result.syncConfigured)return prep?.ready?copyState('S10','connect',1):copyState('S02','unbound');
 // prep.ready 已蕴含 current 或 prepared（两者都不含 bindingId）。pendingUpdate 会因重连
 // 翻新 bindingId 而翻转，但不代表内容退回"安排下发"阶段：只要 build 已 published，
 // 就交给下方设备回执判定，避免 S11「正在安排下发」↔ S15「等待检查」来回跳。
 if(prep?.ready&&result.build?.status!=='published')return copyState('S11','publishing',1);
 // 只有内容尚未为当前计划准备好（prep.ready 为假，重连不会改变它）才留在准备态。
 // 已 ready 的内容即使 pendingUpdate 因重连翻 true，也应落到下方设备回执判定。
 if(!prep?.ready&&(result.pendingUpdate||result.build?.status!=='published'))return copyState('S12','preparing');
 const report=result.deviceReport;
 if(report?.firmwareUpdateRequired)return copyState('S13','firmware',1);
 if(!report)return copyState('S14','waiting',1);
 const knownTarget=!!result?.build?.sha256,matchesTarget=!knownTarget||report.targetSha===result?.build?.sha256,samePackage=knownTarget&&matchesTarget;
 const fresh=!report.stale&&!(Date.parse(report.lastSeen)<Date.parse(result.build?.publishedAt));
 if(samePackage&&report.renderedCurrent&&report.renderReport)return completed('S21','rendered',4,report);
 if(samePackage&&report.stored)return completed('S20','stored',3,report);
 if(!fresh)return copyState('S15','waiting',1);
 if(matchesTarget&&report.stored&&!report.showingPrevious&&report.renderReport)return completed('S23','rendered',4,report);
 if(matchesTarget&&report.stored)return completed('S22','stored',3,report);
 if(!matchesTarget)return copyState('S16','confirming',1);
 if(report.downloadState===2)return copyState('S19','confirming',2);
 if(report.downloadState===3)return copyState('S24','retrying',1);
 if(report.downloadState===1){const percent=Number.isFinite(report.downloadProgress)?Math.max(0,Math.min(100,report.downloadProgress)):null;return copyState('S17','downloading',2,percent);}
 return copyState('S25','confirming',1);
}

export function transferAction(state){
 if(state.action!==undefined)return state.action;
 if(state.step<1||state.preparation)return null;
 if(['connect','waiting'].includes(state.phase))return 'connect';
 if(state.phase==='retrying')return 'connect';
 return null;
}

// Live Wi-Fi confirmation is connectivity evidence, not a content-storage receipt.
export function withConnection(state,result={},connection,now=Date.now(),artworkId=null){
 state=state.connectionBase||state;
 // 正在生成新画：旧画的送达确认与蓝牙连接提示都不得把"新画生成中"改写成完成态或其他态。
 if(state.phase==='generating'||state.failureStage)return {...state,action:null};
 // 手机已确认设备收到本次内容（BLE 观测到下载完成，或用户亲眼看到新画后手动标记）：
 // 这是比陈旧云端回执更强的地面真相，不受 6 秒蓝牙新鲜度窗口限制，也不被“尚未收到回报”覆盖。
 // artworkId 把送达确认锁定到“当前这幅画”：换了生辰/愿望重新生成后，上一幅的送达确认不得回灌到新画。
 if(connection?.delivered&&connection.delivered.targetSha===result?.build?.sha256&&connection.delivered.deviceId===result.device?.id&&(!artworkId||connection.delivered.artworkId===artworkId)&&!(result.deviceReport?.targetSha&&result.deviceReport.targetSha!==connection.delivered.targetSha)){
  if(connection.delivered.evidence==='user-confirmed')return {...copyState('S20','user-confirmed',4),title:'你已确认画屏显示新画',detail:'这是你的手动确认；设备尚未回报当前画面已刷新。',manualConfirmed:true,connectionBase:state};
  return {...copyState('S20','stored',3),connectionBase:state};
 }
 if(!connection?.paired||!Number.isFinite(connection.receivedAt)||now-connection.receivedAt>6000||!result?.device?.id||connection.deviceId!==result.device.id)return {...state,action:transferAction(state)};
 if(state.step<1||state.preparation||['stored','rendered','firmware','publishing'].includes(state.phase))return {...state,action:transferAction(state)};
 if(['waiting','syncing'].includes(state.phase)){
  if(!connection.wifiConnected)return {...state,connectionBase:state,phase:'wifi',title:'蓝牙已连接 · 请连接画屏 Wi-Fi',detail:'请在「链接神物」填写 Wi-Fi 信息；已保存的网络会优先自动连接。',action:'wifi'};
  const requested=connection.requestedSha===result?.build?.sha256&&connection.syncRequestedAt;
  const overdue=requested&&now-requested>=20000;
  return {...state,connectionBase:state,phase:'syncing',title:overdue?'画屏已联网 · 尚未收到本次内容回报':'画屏已联网 · 正在检查新内容',detail:overdue?'请点击重新检查同步；无需重新连接蓝牙或填写 Wi-Fi。':'正在自动检查并同步本次内容，请稍候。',action:overdue?'check':null};
 }
 return {...state,action:state.phase==='retrying'?'check':null};
}

export function renderTransfer(host, state) {
 host.hidden = false;
 host.classList.add('transfer-status');
 host.dataset.phase = state.phase;
 const completed=['rendered','user-confirmed'].includes(state.phase);
 if(completed)host.dataset.complete='true';else delete host.dataset.complete;
 host.replaceChildren();
 const heading = document.createElement('strong');heading.textContent = state.title;
 if(completed){const badge=document.createElement('span');badge.className='transfer-complete-badge';badge.textContent=state.phase==='rendered'?'✓ 画屏已回报显示当前内容':'✓ 你已确认画屏显示新画';heading.prepend(badge);}
 host.append(heading);
 if(state.detail){const detail=document.createElement('p');detail.textContent=state.detail;host.append(detail);}
 if(completed){
  const note=document.createElement('p');note.className='transfer-complete-note';
  const stamp=Date.parse(state.completedAt||'');
  note.textContent=state.phase==='user-confirmed'?'这是你的手动确认；设备尚未回报当前画面已刷新。':Number.isFinite(stamp)?'画屏已回报当前画面 · 设备回报时间 '+new Date(stamp).toLocaleString('zh-CN')+'。':'画屏已回报当前画面已刷新。';
  host.append(note);
 }
 const action=transferAction(state);
 if(action==='connect'||action==='wifi'){const link=document.createElement('a');link.className='primary';link.href='#network-onboarding';link.textContent=action==='wifi'?'配置画屏 Wi-Fi':'去链接神物并同步';host.append(link);}
 else if(action==='check'){const check=document.createElement('button');check.type='button';check.className='secondary';check.textContent='重新检查同步';check.onclick=()=>document.dispatchEvent(new CustomEvent('prayer:ark-sync'));host.append(check);}
 const steps = document.createElement('ol');steps.setAttribute('aria-label', '画面同步阶段');
 // 完成态只展示已真实发生的三步：画屏上屏回报是另一回事，不能把第 4 步也画成已完成。
 const labels = state.preparation?['两日画作','转换画屏格式','保存内容包','准备完成']:completed?['内容就绪','设备下载','内容包已保存','当前画面已确认']:state.phase==='stored'?['内容就绪','设备下载','内容包已保存']:['内容就绪','设备下载','传输完成','画屏刷新'];
 for (const [index, label] of labels.entries()) {
  const item = document.createElement('li');item.textContent = label;
  const position=state.preparation?state.preparationStep:state.step;
  item.classList.toggle('complete', index < position);
  if (!completed&&!state.preparation&&index === position) item.setAttribute('aria-current', 'step');
  steps.append(item);
 }
 host.append(steps);
 if (state.percent !== null) {
  const progress = document.createElement('progress');progress.max = 100;progress.value = state.percent;progress.setAttribute('aria-label', state.preparation?'内容包保存进度':'设备下载进度');host.append(progress);
 }
}

// BLE download replies carry no package hash: require a current cloud target first.
export function withLiveDownload(state,result,live,now=Date.now()){
 if(!live||now-live.receivedAt>6000||result?.pendingUpdate||result?.build?.status!=='published'||!result.build.sha256||result.device?.id!==live.deviceId||result.deviceReport?.targetSha!==result.build.sha256||result.deviceReport?.stale||Date.parse(result.deviceReport?.lastSeen)<Date.parse(result.build.publishedAt)||!['downloading','confirming','waiting'].includes(state.phase))return state;
 // 设备回报“下载完成”时，不再继续显示旧的百分比进度。
 if(live.state===2)return {...state,...copyState('S19','confirming',2)};
 if(live.state!==1||!Number.isFinite(live.progress))return state;
 const percent=Math.max(0,Math.min(100,live.progress));
 return {...state,...copyState('S18','downloading',2,percent)};
}
