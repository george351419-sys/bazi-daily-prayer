// Approved user-facing copy. One description paragraph per state.
const STATUS_COPY = {
  "S01": {
    "title": "正在连接画屏",
    "detail": "稍等片刻。"
  },
  "S02": {
    "title": "先许愿，生成你的祈福图",
    "detail": ""
  },
  "S03": {
    "title": "当前画屏正在使用自定义照片",
    "detail": "若要显示新祈福画，请在「自定义」切换为祈福图并保存。"
  },
  "S04": {
    "title": "正在准备这幅画的同步内容",
    "detail": "请耐心等待，暂不需要操作。"
  },
  "S05": {
    "title": "灵魂画师爆肝中",
    "detail": "画屏会保留已下载的内容，恢复后继续同步。"
  },
  "S06": {
    "title": "等待后台准备内容",
    "detail": "等会再链接画屏，不着急~"
  },
  "S07": {
    "title": "正在读取两日画作",
    "detail": "正在读取画作，随后转换为画屏格式，等会再链接画屏。"
  },
  "S08": {
    "title": "正在转换画屏内容",
    "detail": "正在制作墨水屏画面与微行动，等会再链接画屏。"
  },
  "S09": {
    "title": "正在保存画屏内容包 · {percent}%",
    "detail": "正在保存已转换的内容，完成后即可连接画屏。"
  },
  "S10": {
    "title": "画屏内容已准备好 · 去链接神物吧",
    "detail": "点击下方按钮前往「链接神物」，绑定后即可领取已准备的内容。"
  },
  "S11": {
    "title": "画屏内容已就绪 · 正在安排下发",
    "detail": "无需重新生成或配网，请等待“传输完成”后，再在画屏选择“画面”并按确认键查看新内容。"
  },
  "S12": {
    "title": "正在准备画屏内容",
    "detail": "请耐心等待，暂不需要操作。"
  },
  "S13": {
    "title": "请先更新画屏固件",
    "detail": "当前固件不能接收这份内容，请到「链接神物」更新固件。"
  },
  "S14": {
    "title": "内容已就绪 · 等待设备联网检查",
    "detail": "请唤醒画屏并连接 Wi-Fi，或在蓝牙连接后点击“立即检查同步”。蓝牙连接成功不等于新内容已下载。"
  },
  "S15": {
    "title": "内容已就绪 · 等待最新设备检查",
    "detail": "尚无当前内容的近期回执。请唤醒画屏，保持 Wi-Fi 联网，并在蓝牙连接后点击“立即检查同步”；无需重新生成画作。"
  },
  "S16": {
    "title": "画屏已联网 · 正在确认当前内容",
    "detail": "正在等待当前内容的下载或刷新回执。"
  },
  "S17": {
    "title": "正在传输到画屏 · {percent}%",
    "detail": "请保持画屏联网。"
  },
  "S18": {
    "title": "正在传输到画屏 · {percent}%",
    "detail": "设备通过蓝牙回报的下载进度，请保持画屏联网。"
  },
  "S19": {
    "title": "画屏已回报下载完成 · 正在核对内容",
    "detail": "画屏已完成本次内容下载，云端正在核对保存结果。稍候即可看到「传输完成」，无需重新生成或重复连接。"
  },
  "S20": {
    "title": "传输完成 · 新画已存入画屏",
    "detail": "本次内容已完整送达画屏，网页这边已经结束，无需再操作。到画屏按「IMG」→ 确认键即可看到新画。"
  },
  "S21": {
    "title": "同步完成 · 画屏已回报刷新",
    "detail": "画屏已回报本次内容的显示结果。如停在 Home，可选「画面」并按确认键查看。"
  },
  "S22": {
    "title": "传输完成 · 新画已存入画屏",
    "detail": "本次内容已完整送达画屏，网页这边已经结束，无需再操作。按画屏确认键进入「画面」即可看到新画。"
  },
  "S23": {
    "title": "同步完成 · 画屏已回报刷新",
    "detail": "本次内容已送达并回报刷新，网页这边已经结束。按画屏确认键进入「画面」即可查看。"
  },
  "S24": {
    "title": "传输暂未成功 · 等待重试",
    "detail": "请检查画屏 Wi-Fi 并保持开机，设备将重新领取内容。"
  },
  "S25": {
    "title": "画屏已联网 · 正在确认同步结果",
    "detail": "云端内容已就绪，但当前内容包的下载或刷新回执尚不完整；如画屏已显示新画，无需重复推送。"
  },
  "S26": {
    "title": "新画正在生成 · 画屏仍是上一幅",
    "detail": "新画还在绘制，完成后会自动准备并同步到画屏。此刻画屏显示的仍是上一幅已存入的内容，无需操作，也不用重新连接。"
  }
};
function copyState(id,phase,step=0,percent=null){
 const text=STATUS_COPY[id],title=text.title.replace(' · {percent}%',percent===null?'':' · '+percent+'%');
 return {phase,title,detail:text.detail,step,percent};
}
function completed(id,phase,step,report){
 return {...copyState(id,phase,step),completedAt:report?.lastSeen||null};
}
function transferStatus(result = {}, artworkId = null, generating = false) {
 result = result ?? {};
 // 用户正在重新生成新画：此刻后端 plan/build/deviceReport 仍是上一幅画的快照，
 // 任何 stored/delivered 完成态都属于旧画，必须先于一切判定短路成"新画生成中"，
 // 否则上一幅的"✓ 本次同步已完成"会串台到正在生成的新画上（带旧回执时间）。
 if(generating)return copyState('S26','generating');
if(result.syncConfigured===undefined)return copyState('S01','checking');
 if(!result.syncConfigured&&!result.plan&&!result.preparation)return copyState('S02','unbound');
 if(artworkId&&result.plan?.contentMode==='photo')return copyState('S03','photo');
 if(artworkId&&!result.plan?.artworkIds?.includes(artworkId))return copyState('S04','preparing');
 if(result.preparation?.stage==='retrying'||(!result.preparation&&result.build?.status==='retrying'))return copyState('S05','retrying');
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
 if(samePackage&&report.stored)return completed('S20','stored',4,report);
 if(!fresh)return copyState('S15','waiting',1);
 if(matchesTarget&&report.stored&&!report.showingPrevious&&report.renderReport)return completed('S23','rendered',4,report);
 if(matchesTarget&&report.stored)return completed('S22','stored',4,report);
 if(!matchesTarget)return copyState('S16','confirming',1);
 if(report.downloadState===2)return copyState('S19','confirming',2);
 if(report.downloadState===3)return copyState('S24','retrying',1);
 if(report.downloadState===1){const percent=Number.isFinite(report.downloadProgress)?Math.max(0,Math.min(100,report.downloadProgress)):null;return copyState('S17','downloading',2,percent);}
 return copyState('S25','confirming',1);
}

function transferAction(state){
 if(state.action!==undefined)return state.action;
 if(state.step<1||state.preparation)return null;
 if(['connect','waiting'].includes(state.phase))return 'connect';
 if(state.phase==='retrying')return 'connect';
 return null;
}

// Live Wi-Fi confirmation is connectivity evidence, not a content-storage receipt.
function withConnection(state,result={},connection,now=Date.now(),artworkId=null){
 state=state.connectionBase||state;
 // 正在生成新画：旧画的送达确认与蓝牙连接提示都不得把"新画生成中"改写成完成态或其他态。
 if(state.phase==='generating')return {...state,action:null};
 // 手机已确认设备收到本次内容（BLE 观测到下载完成，或用户亲眼看到新画后手动标记）：
 // 这是比陈旧云端回执更强的地面真相，不受 6 秒蓝牙新鲜度窗口限制，也不被“尚未收到回报”覆盖。
 // artworkId 把送达确认锁定到“当前这幅画”：换了生辰/愿望重新生成后，上一幅的送达确认不得回灌到新画（与网页端对齐）。
 if(connection?.delivered&&connection.delivered.targetSha===result?.build?.sha256&&connection.delivered.deviceId===result.device?.id&&(!artworkId||connection.delivered.artworkId===artworkId)&&!(result.deviceReport?.targetSha&&result.deviceReport.targetSha!==connection.delivered.targetSha))return {...copyState('S20','stored',4),connectionBase:state};
 if(connection?.paired&&!connection.wifiConnected&&state.phase==='connect')return {...state,connectionBase:state,phase:'wifi',title:'蓝牙已连接 · 请确认画屏 Wi-Fi',detail:'已保存的网络会自动尝试连接；尚未收到联网确认时，可在下方检查网络。',action:'wifi'};
 if(connection&&connection.paired===false&&state.phase==='connect')return {...state,connectionBase:state,title:'画屏内容已准备好 · 请连接画屏蓝牙',detail:'当前手机未连接画屏蓝牙。请在「链接神物」页唤醒并连接画屏蓝牙，连上后会自动认主并下发内容；画屏自身联网不代表已认主。',action:'connect'};
 if(connection?.paired&&!result?.syncConfigured&&state.phase==='connect')return {...state,connectionBase:state,phase:'binding',title:connection.deviceId?'画屏已连接 · 正在关联当前账户':'画屏已连接 · 正在核验设备身份',detail:connection.deviceId?'账户关联由程序自动完成，完成后会领取已准备的内容。':'设备联网后会自动核验身份并关联账户，无需填写设备编号。',action:null};
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

// BLE download replies carry no package hash: require a current cloud target first.
function withLiveDownload(state,result,live,now=Date.now()){
 if(!live||now-live.receivedAt>6000||result?.pendingUpdate||result?.build?.status!=='published'||!result.build.sha256||result.device?.id!==live.deviceId||result.deviceReport?.targetSha!==result.build.sha256||result.deviceReport?.stale||Date.parse(result.deviceReport?.lastSeen)<Date.parse(result.build.publishedAt)||!['downloading','confirming','waiting'].includes(state.phase))return state;
 // 设备回报“下载完成”时，不再继续显示旧的百分比进度。
 if(live.state===2)return {...state,...copyState('S19','confirming',2)};
 if(live.state!==1||!Number.isFinite(live.progress))return state;
 const percent=Math.max(0,Math.min(100,live.progress));
 return {...state,...copyState('S18','downloading',2,percent)};
}

function receiptTime(value){const stamp=Date.parse(value);return Number.isFinite(stamp)?new Date(stamp+8*3600000).toISOString().slice(0,19).replace('T',' '):'';}
module.exports={transferStatus,receiptTime,withLiveDownload,withConnection,transferAction};
