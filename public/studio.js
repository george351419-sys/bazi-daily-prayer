const views = {
 'network-onboarding': ['连接画屏', '先让画屏连上网络，往后的每一天才会如约抵达。'],
 create: ['许愿池', '生辰为底，心愿为笔，生成属于今天的祈福画。'],
 'ritual-home': ['解读陪伴', '看见画中之意，也找到此刻能做的一件小事。'],
 custom: ['自定义', '让你的照片与画作，也成为每日陪伴的一帧。']
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
 document.title = views[view][0] + ' · 生辰造像馆';
 if (views[target]) requestAnimationFrame(() => window.scrollTo(0, 0));
}
window.addEventListener('hashchange', selectView);
selectView();
