export const ART_STYLE_VERSION='720x480-overlay120-v1';
export const ART_STYLES=['folk','cute','spirit'];
export function normalizeArtStyle(value){
 if(value===undefined||value===null||value==='')return 'folk';
 if(!ART_STYLES.includes(value))throw new Error('请选择有效的画面风格。');
 return value;
}
export function artDirection(style){
 const selected=normalizeArtStyle(style);
 const common='最终画屏为720×480像素横图，3:2。构图视觉重点上移，底部约25%将覆盖白底文字，仅画可遮挡的次要连续背景，不画白条、文字或UI。脸、手、关键持物和配饰置于上方安全区域。参考红黄白黑绿蓝色系但不锁死六种RGB纯色；柔和朱红、暖金黄、自然肤色、奶油白与协调蓝绿，平涂为主、清晰轮廓，避免荧光原色、噪点和细密花纹。保留原主尊身份对应的衣冠、手印、持物、固定坐骑及题材配属，不能擅换其他神祇道具。';
 const specific={folk:'民俗风：传统人物比例与民俗神像气质，庄重亲切的手绘插画，不把主尊改成Q版小童。',cute:'可爱风：国潮Q版神仙，大圆脸、短身、小巧笑眼，保留神像辨识度和关键配饰；背景可用有序祥云、远山、庭阁等场景装饰，不将装饰当成新增命理意象。',spirit:'灵兽风：只将主尊的人形角色替换为参考图中的原创问问兽，服饰、手势语义、道具、配饰、固定坐骑不变。白色圆脸、蓝白巨大书页耳、蓝眼、额间朱红不闭合书法圆环、唯一墨蓝卷尾，耳额纹尾巴清楚；适配爪部握物，不保留人脸胡须头发，不统一改成财神，不把坐骑或生肖变成问问兽。小朱红矩形吊坠简化不写字。背景丰富有层次，毛色不随喜用改色。'};
 return '[PRAYER_STYLE:'+selected+'] '+specific[selected]+common;
}
