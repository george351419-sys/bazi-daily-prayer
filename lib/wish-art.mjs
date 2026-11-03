import {ART_STYLE_VERSION} from './art-styles.mjs';

// These IDs remain compatible with saved wishes. Copy describes aspirations,
// never a predicted outcome. No birthday, chart or favourable-element inference.
export const WISH_ART_GROUPS=[{"name":"生活丰足","items":[{"id":"W01","label":"生活富足"},{"id":"W02","label":"财源广进"},{"id":"W03","label":"生意兴旺"},{"id":"W04","label":"债务结清"},{"id":"W05","label":"投资顺利"},{"id":"W06","label":"衣食无忧"}]},{"name":"事业向前","items":[{"id":"W07","label":"上岸考编"},{"id":"W08","label":"面试顺利"},{"id":"W09","label":"升职加薪"},{"id":"W10","label":"创业顺利"},{"id":"W11","label":"同事相处融洽"},{"id":"W12","label":"步步向前"}]},{"name":"学业精进","items":[{"id":"W13","label":"金榜题名"},{"id":"W14","label":"考试顺利"},{"id":"W15","label":"考研考证顺利"},{"id":"W16","label":"学业进步"},{"id":"W17","label":"论文顺利"}]},{"name":"健康平安","items":[{"id":"W18","label":"身体康健"},{"id":"W19","label":"早日康复"},{"id":"W20","label":"家人安康"},{"id":"W21","label":"老人长寿"},{"id":"W22","label":"生活平安"},{"id":"W23","label":"出入平安"}]},{"name":"情感家庭","items":[{"id":"W24","label":"遇见良缘"},{"id":"W25","label":"脱单"},{"id":"W26","label":"婚姻和睦"},{"id":"W27","label":"珍惜真诚关系"},{"id":"W28","label":"迎接新生命"},{"id":"W29","label":"家庭和顺"}]},{"name":"人际相伴","items":[{"id":"W30","label":"遇见同行伙伴"},{"id":"W31","label":"减少口舌矛盾"},{"id":"W32","label":"修复亲友或亲子关系"}]},{"name":"心境迎新","items":[{"id":"W33","label":"迎接新生活"},{"id":"W34","label":"重拾好心情"},{"id":"W35","label":"内心安宁"},{"id":"W36","label":"放下执念"}]}];
export function wishArtMapping(input){
 const selected=WISH_ART_GROUPS.flatMap(g=>g.items).filter(w=>input.wishes.includes(w.id));
 const label=selected.map(w=>w.label).join('、')||'美好日常';
 return {content_mode:'wish-art',wish_id:input.wishes[0],wish_label:label,title:'心愿入画',deity:'布袋和尚',
  art_style:input.artStyle,art_style_version:ART_STYLE_VERSION,
  primary_element:'',secondary_element:'',zodiac:[],stem_symbols:[],
  colors:[{name:'柔和青绿',hex:'#AFC5B3'},{name:'暖杏色',hex:'#F2D4A7'},{name:'米白',hex:'#F6F1E7'}],
  overview:'以柔和色彩、莲花和流云寄托对美好日常的祝愿。',blessing:'愿心有所安，日有所盼。',
  elements:[{name:'莲花',meaning:'寄托宁静与美好。'},{name:'流云',meaning:'带来轻盈舒展的画面节奏。'},{name:'暖光',meaning:'营造温暖陪伴的氛围。'}],
  reading:{sections:[]},professional:'',birth_summary:'',
  image_prompt:`以民俗艺术中的布袋和尚为中心，笑容温暖，保留布袋配饰，周围搭配莲花、流云和柔和暖光，以圆润亲切的构图表达“${label}”的美好祝愿。颜色由固定美术色板选择；不使用命盘、运势、吉凶、改运、五行喜用或生辰推导。`};
}
