城市坐标整理自 https://github.com/88250/city-geo 的 data.json（获取日期 2026-10-17），许可证 MulanPSL-2.0，完整文本见 city-geo-LICENSE.txt。
本项目将原数据裁剪为名称、行政区层级及经度，生成 lib/data/places.mjs 和 public/place-names.js。数据来源坐标为百度地图中心坐标，仅作为市/区县中心的近似经度，不能表示出生医院或街道的精确位置。用户选填出生地时会明确告知精度。
均时差公式参考 NOAA 太阳位置计算：https://gml.noaa.gov/grad/solcalc/main.js 。
