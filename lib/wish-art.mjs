import {WISH_GROUPS} from './wish-copy.mjs';
import {ART_STYLE_VERSION} from './art-styles.mjs';

// These IDs remain compatible with saved wishes. Copy describes aspirations,
// never a predicted outcome. No birthday, chart or favourable-element inference.
export const WISH_ART_GROUPS=WISH_GROUPS;
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
