// Derive progress only from the requested plan and its device report.
export function transferStatus(result = {}, artworkId = null) {
 const state = (phase, title, detail, step = 0, percent = null) => ({phase, title, detail, step, percent});
 if (result.syncConfigured === undefined) return state('checking', '正在确认画屏连接', '画作已完成，正在读取同步状态。');
 if (!result.syncConfigured) return state('unbound', '画作已完成 · 请先绑定画屏', '在「链接神物」连接并绑定设备后，即可同步画面。');
 if (result.plan?.contentMode === 'photo') return state('photo', '当前画屏使用自定义照片', '若要显示新祈福画，请在「自定义」切换为祈福图并保存。');
 if (artworkId && !result.plan?.artworkIds?.includes(artworkId)) return state('preparing', '正在准备这幅画的同步内容', '正在将新画作加入两日画屏计划。');
 if (result.build?.status === 'retrying') return state('retrying', '内容准备暂未成功 · 后台正在重试', '画屏会保留已下载的内容，恢复后继续同步。');
 if (result.pendingUpdate || result.build?.status !== 'published') return state('preparing', '正在准备画屏内容', '正在准备两日画作与微行动，完成后即可供画屏领取。');
 const report = result.deviceReport;
 if (report?.firmwareUpdateRequired) return state('firmware', '请先更新画屏固件', '当前固件不能接收这份内容，请到「链接神物」更新固件。', 1);
 if (!report || report.stale) return state('waiting', '内容已就绪 · 等待最新设备回报', '尚未收到近期同步回报；如画屏已显示新画，无需重复推送，网页会在回报更新后确认。', 1);
 const knownTarget = !!result.build?.sha256;
 const matchesTarget = !knownTarget || report.targetSha === result.build.sha256;
 if (report.renderedCurrent && report.renderReport) return state('rendered', '传输完成 · 画屏已回报刷新', '设备已回报当前内容包的刷新状态，现在可以查看画屏画面。', 4);
 if ((!knownTarget || !matchesTarget) && Date.parse(report.lastSeen) < Date.parse(result.build?.publishedAt)) return state('waiting', '内容已就绪 · 等待最新设备回报', '当前回报早于内容发布，正在等待新回执；画屏已显示新画时无需重复推送。', 1);
 if (matchesTarget && report.stored && !report.showingPrevious && report.renderReport) return state('rendered', '传输完成 · 画屏已回报刷新', '现在可以查看画屏上的画面；刷新完成时间以设备实际显示为准。', 4);
 if (matchesTarget && report.stored) return state('stored', '传输完成 · 等待画屏刷新', '画面内容已保存到设备，画屏将刷新显示；正在等待刷新回报。', 3);
 if (!matchesTarget) return state('confirming', '画屏已联网 · 正在确认当前内容', '最近回报对应其他内容包，正在等待当前内容的下载或刷新回执；无需重新生成图片。', 1);
 if (report.downloadState === 2) return state('confirming', '设备已回报下载完成 · 等待内容核验', '正在确认当前内容包的保存与刷新结果；如画屏已显示新画，无需重复推送。', 2);
 if (report.downloadState === 3) return state('retrying', '传输暂未成功 · 等待重试', '请检查画屏 Wi-Fi 并保持开机，设备将重新领取内容。', 1);
 if (report.downloadState === 1) {
  const percent = Number.isFinite(report.downloadProgress) ? Math.max(0, Math.min(100, report.downloadProgress)) : null;
  return state('downloading', '正在传输到画屏' + (percent === null ? '' : ' · ' + percent + '%'), '这是设备最近回报的下载进度，请保持画屏联网。', 2, percent);
 }
 return state('confirming', '画屏已联网 · 正在确认同步结果', '云端内容已就绪，但当前内容包的下载或刷新回执尚不完整；如画屏已显示新画，无需重复推送。', 1);
}

export function renderTransfer(host, state) {
 host.hidden = false;
 host.classList.add('transfer-status');
 host.dataset.phase = state.phase;
 host.replaceChildren();
 const heading = document.createElement('strong');heading.textContent = state.title;
 const detail = document.createElement('p');detail.textContent = state.detail;
 host.append(heading, detail);
 const steps = document.createElement('ol');steps.setAttribute('aria-label', '画面同步阶段');
 for (const [index, label] of ['内容就绪', '设备下载', '传输完成', '画屏刷新'].entries()) {
  const item = document.createElement('li');item.textContent = label;item.classList.toggle('complete', index < state.step);
  if (index === state.step) item.setAttribute('aria-current', 'step');
  steps.append(item);
 }
 host.append(steps);
 if (state.percent !== null) {
  const progress = document.createElement('progress');progress.max = 100;progress.value = state.percent;progress.setAttribute('aria-label', '设备下载进度');host.append(progress);
 }
}
