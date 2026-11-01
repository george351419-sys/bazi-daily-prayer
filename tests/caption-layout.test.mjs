import test from 'node:test';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import path from 'node:path';
test('两行与三行文字在实际可见白底内居中，行距自适应，不静默裁剪',()=>{
 const code=`import importlib.util,json\ns=importlib.util.spec_from_file_location('layout','tools/build-ritual-package.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)\nf='/System/Library/Fonts/Supplemental/Songti.ttc'\nresult=[]\nfor text in ['放松肩膀','把肩膀轻轻放松下来缓缓呼吸']:\n rows=m.text_layout([('午时 · 放松一下',20),(text,30)],(480,128),f,True)\n result.append([[r[4],r[5]] for r in rows])\ntry:m.text_layout([('标题',20),('很长的动作建议'*100,30)],(480,128),f,True);raise AssertionError('overflow accepted')\nexcept ValueError:pass\nprint(json.dumps(result))`;
 const rows=JSON.parse(execFileSync('/opt/homebrew/bin/python3',['-c',code],{cwd:path.resolve(import.meta.dirname,'..'),encoding:'utf8'}));
 assert.equal(rows[0].length,2);assert.equal(rows[1].length,3);
 for(const sample of rows){assert.ok(sample[0][0]>=12);assert.ok(sample.at(-1)[1]<=110);assert.ok(Math.abs(sample[0][0]-(122-sample.at(-1)[1]))<=2);}
 assert.ok(rows[0][1][0]-rows[0][0][1]>rows[1][1][0]-rows[1][0][1]);
});
