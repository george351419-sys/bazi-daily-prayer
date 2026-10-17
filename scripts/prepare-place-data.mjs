import {readFile,writeFile,copyFile} from 'node:fs/promises';
const rows=JSON.parse(await readFile('.runtime/source-geo/data.json','utf8'));
const places=[],seen=new Set();
for(const row of rows){
 const longitude=Number(row.lng),latitude=Number(row.lat);
 if(!Number.isFinite(longitude)||!Number.isFinite(latitude)||longitude<70||longitude>140||latitude<0||latitude>56)continue;
 const province=row.province||'',city=/^(市辖区|县|省直辖县级行政区划|自治区直辖县级行政区划)$/.test(row.city)?'':row.city||'',area=row.area||'';
 const name=[province,city,area].filter((x,i,a)=>x&&(i===0||x!==a[i-1])).join('');
 if(!name||seen.has(name))continue;seen.add(name);
 places.push({name,province,city,area,longitude:Number(longitude.toFixed(6))});
}
await writeFile('lib/data/places.mjs','// City Geo (88250/city-geo), MulanPSL-2.0; see third_party. City/district centre coordinates.\nexport const PLACES='+JSON.stringify(places)+';\n');
await writeFile('public/place-names.js','// City Geo, MulanPSL-2.0; names only, no remote geocoding.\nexport const PLACE_NAMES='+JSON.stringify(places.map(x=>x.name))+';\n');
await copyFile('.runtime/source-geo/LICENSE','third_party/city-geo-LICENSE.txt');
console.log('Offline place centres:',places.length);
