const names={folk:'民俗风',cute:'可爱风',spirit:'灵兽风'};
const dialog=document.createElement('dialog');dialog.className='art-style-dialog';dialog.setAttribute('aria-label','画面风格参考');
const title=document.createElement('h3'),image=document.createElement('img'),note=document.createElement('p'),close=document.createElement('button');
close.type='button';close.className='secondary';close.textContent='关闭';note.textContent='风格示意图 · 实际画面随主尊与祈愿要素变化。设备输出为720×480横图，底部预留文字覆盖空间。';
dialog.append(title,image,note,close);document.body.append(dialog);close.onclick=()=>dialog.close();
dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
for(const button of document.querySelectorAll('[data-style-preview]'))button.addEventListener('click',()=>{const id=button.dataset.stylePreview;if(!names[id])return;title.textContent=names[id]+' · 风格参考';image.src='./assets/prayer-styles/'+id+'.jpg';image.alt=names[id]+'祈福画示意';dialog.showModal();});
