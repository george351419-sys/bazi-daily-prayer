const views = {
 'network-onboarding': ['链接神物', '从一次连接开始，让好意每天抵达。'],
 create: ['许愿池', '写下生辰与心愿，绘一幅属于今天的祝福。'],
 'ritual-home': ['解读陪伴', '读懂画中的心意，也找到此刻可以做的小事。'],
 custom: ['自定义', '选择祈福画，或让自己的照片与画作成为日常陪伴。']
};
function selectView() {
 const target = location.hash.slice(1);
 const view = views[target] ? target : target.startsWith('ritual-') ? (target === 'ritual-settings' ? 'custom' : 'ritual-home') : 'network-onboarding';
 document.body.dataset.studioView = view;
 document.querySelector('#studio-title').textContent = views[view][0];
 document.querySelector('#studio-description').textContent = views[view][1];
 document.querySelectorAll('[data-view]').forEach(link => {
  if (link.dataset.view === view) link.setAttribute('aria-current', 'page');
  else link.removeAttribute('aria-current');
 });
 document.title = views[view][0] + ' · 点好运';
 if (views[target]) requestAnimationFrame(() => window.scrollTo(0, 0));
}
window.addEventListener('hashchange', selectView);
selectView();
