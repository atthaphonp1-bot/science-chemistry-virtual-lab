#!/usr/bin/env node
// Self-test of the QA harness.
//  1) unit checks of the pure helpers  2) injects known defects into a COPY of a page and asserts the harness flags each one.
// usage: node tools/qa/selftest/selftest.mjs [base-page.html] [--keep] [--only name,name]   (default base: chemistry-m5-phys-ch1.html)
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { periodicRun, longestRun, contrast, lintCss, parseIds, parsePoints, histogram } from '../lib/helpers.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = resolve(HERE, '../../..');
const args = process.argv.slice(2);
const base = resolve(args.find(a => a.endsWith('.html')) || join(ROOT, 'chemistry-m5-phys-ch1.html'));
const keep = args.includes('--keep');
const only = args.includes('--only') ? new Set(args[args.indexOf('--only') + 1].split(',')) : null;

/* ---------- 1. unit checks ---------- */
assert.equal(periodicRun([0, 1, 0, 1, 0, 1, 2]).period, 2);
assert.equal(periodicRun([1, 2, 3, 1, 2, 3, 1, 2, 3]).period, 3);
assert.equal(periodicRun([0, 1, 2, 3, 1, 0, 2, 3]), null);
assert.equal(periodicRun([0, 0, 0, 0, 0, 0]), null);                 // constant block is not "periodic"
assert.deepEqual(longestRun([1, 0, 0, 0, 0, 2]), { key: 0, len: 4, start: 1 });
assert.equal(Math.round(contrast([0, 0, 0], [255, 255, 255])), 21);
assert.ok(contrast([119, 119, 119], [255, 255, 255]) > 4.4 && contrast([119, 119, 119], [255, 255, 255]) < 4.6);
assert.equal(lintCss('a{color:red} .b{margin:0} @media (x){.c{a:b}} @keyframes k{from{a:1}to{a:2}}').fragments.length, 0);
assert.equal(lintCss('a{color:red} color:blue;margin:0} .b{x:1}').fragments.length >= 1, true);
assert.equal(lintCss('.a{background:url(data:image/svg+xml;utf8,<svg/>)}').fragments.length, 0);
assert.deepEqual(lintCss('@keyframes spin{to{a:1}}').keyframes, ['spin']);
assert.equal(parseIds('x\n// ids:start\nvar A = {\n  "5.1": "ab",\n  "ท้าย \\"q\\"": "t",\n};\n// ids:end').get('5.1'), 'ab');
assert.deepEqual(parsePoints('ยังตอบไม่ครบ (2/5) ได้ 1 / 5 คะแนน'), { got: 1, max: 5 });
assert.deepEqual(parsePoints('ได้ 3 จาก 4 คะแนน'), { got: 3, max: 4 });
assert.deepEqual(histogram([0, 0, 2], 4), [2, 0, 1, 0]);
console.log('unit checks: PASS');

/* ---------- 2. defect injection ---------- */
const src = readFileSync(base, 'utf8');
const inject = js => src.replace(/<\/body>(?![\s\S]*<\/body>)/, `<script>${js}</script></body>`);
const firstStyle = css => src.replace(/(<style[^>]*>)/, `$1${css}`);
const sub = src.match(/window\.__LAB_SUBMIT__=\{"id": "([^"]*)", "title": "([^"]*)"/);
const MUTANTS = [
  { name: 'highlight', only: 'QUIZ', expect: ['QUIZ', 'FAIL', /highlight/i],
    html: inject(`document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('[data-act=check]');if(!b)return;setTimeout(()=>{const r=b.closest('.box');r&&r.querySelectorAll('.q').forEach(q=>{const o=q.querySelector('.opt');o&&o.classList.add('good')})},0)})`) },
  { name: 'keys_all_zero', only: 'QUIZ', expect: ['QUIZ', 'FAIL', /all \d+ keys are 0/],
    html: inject(`for(const k in QUIZ)QUIZ[k].forEach(q=>{q.a=0});select(cur)`) },
  { name: 'keys_periodic', only: 'QUIZ', expect: ['QUIZ', 'WARN', /periodic/],
    html: inject(`for(const k in QUIZ)QUIZ[k].forEach((q,i)=>{q.a=i%2});select(cur)`) },
  { name: 'keys_clustered', only: 'QUIZ', expect: ['QUIZ', 'WARN', /% of keys at position|repeated/],
    html: inject(`for(const k in QUIZ)QUIZ[k].forEach((q,i)=>{q.a=i<QUIZ[k].length-1?2:1});select(cur)`) },
  { name: 'id_mismatch', only: 'SCORING', expect: ['SCORING', 'FAIL', /title mismatch|not in Code\.gs/],
    html: sub ? src.replace(sub[0], sub[0].replace(`"title": "${sub[2]}"`, `"title": "${sub[2]} (แก้)"`)) : null },
  { name: 'wide_table', only: 'OVERFLOW', expect: ['OVERFLOW', 'WARN', /hide >40%/],
    html: inject(`const _s=window.select;window.select=function(){const r=_s.apply(this,arguments);const p=document.querySelector('#panel');p&&p.insertAdjacentHTML('beforeend','<div class="tw"><table style="min-width:1100px"><tr><td>wide</td><td>table</td></tr></table></div>');return r};select(cur)`) },
  { name: 'overscaled_svg', only: 'OVERFLOW', expect: ['OVERFLOW', 'WARN', /scaled >2\.2x/],
    html: inject(`const _s=window.select;window.select=function(){const r=_s.apply(this,arguments);const p=document.querySelector('#panel');p&&p.insertAdjacentHTML('beforeend','<svg viewBox="0 0 100 40" style="width:100%;height:auto"><text x="5" y="20">x</text></svg>');return r};select(cur)`) },
  { name: 'css_fragment', only: 'CSS', expect: ['CSS', 'FAIL', /selector-less/],
    html: firstStyle('.zz{color:red} font-weight:700;margin:0}') },
  { name: 'stale_counter', only: 'FREETEXT', expect: ['FREETEXT', 'FAIL', /stale counter/],
    html: inject(`(function(){const U=LabScore.use;let on=false;setTimeout(()=>{on=true},50);LabScore.use=function(){const w=document.getElementById('lsWritten'),prev=w&&w.textContent;const r=U.apply(this,arguments);if(on&&w&&!window.__cl)w.textContent=prev;return r}})()`) },
  { name: 'readonly_textarea', only: 'FREETEXT', expect: ['FREETEXT', 'FAIL', /readonly/],
    html: inject(`const _s=window.select;window.select=function(){const r=_s.apply(this,arguments);const p=document.querySelector('#panel');p&&p.insertAdjacentHTML('beforeend','<textarea readonly style="position:fixed;left:-9999px">copy me</textarea>');return r};select(cur)`) },
  { name: 'js_error', only: 'LOAD,TABS', expect: ['LOAD', 'FAIL', /exception|console/i],
    html: inject(`setTimeout(()=>{throw new Error('injected boom')},100)`) },
  { name: 'nan_text', only: 'TABS', expect: ['TABS', 'FAIL', /bad text/],
    html: inject(`const _s=window.select;window.select=function(){const r=_s.apply(this,arguments);const p=document.querySelector('#panel');p&&p.insertAdjacentHTML('beforeend','<p>ค่า = NaN และ undefined</p>');return r};select(cur)`) },
  { name: 'keyboard_broken', only: 'KEYBOARD', expect: ['KEYBOARD', 'FAIL', /./],
    html: inject(`document.querySelectorAll('[role=tab]').forEach(t=>{t.onkeydown=null;t.setAttribute('tabindex','0')});const _p=window.paintTabs;window.paintTabs=function(){_p.apply(this,arguments);document.querySelectorAll('[role=tab]').forEach(t=>{t.onkeydown=null;t.setAttribute('tabindex','0')})};select(cur)`) },
];
if (base.includes('phys-ch1') === false) console.log('note: some mutants assume an ACTS/select()/QUIZ page like chemistry-m5-phys-ch1.html');

const dir = mkdtempSync(join(tmpdir(), 'qa-selftest-'));
const run = (m) => new Promise(res => {
  if (!m.html) return res({ m, err: 'mutation did not apply' });
  const f = join(dir, m.name + '.html'); writeFileSync(f, m.html);
  const p = spawn('node', [join(ROOT, 'tools/qa/qa_page.mjs'), f, '--json', '--only', m.only], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; p.stdout.on('data', d => out += d); p.stderr.on('data', () => { });
  p.on('close', () => { try { res({ m, j: JSON.parse(out) }); } catch (e) { res({ m, err: 'no JSON output' }); } });
});
const todo = MUTANTS.filter(m => !only || only.has(m.name)); const results = [];
for (let i = 0; i < todo.length; i += 3) results.push(...await Promise.all(todo.slice(i, i + 3).map(run)));
let bad = 0;
for (const { m, j, err } of results) {
  let ok = false, note = err || '';
  if (j) { const [ch, st, re] = m.expect; const hit = j.results.find(r => r.check === ch && r.status === st && re.test(r.msg + ' ' + (r.evidence || ''))); ok = !!hit; note = hit ? `${hit.status} ${hit.check}: ${hit.msg.slice(0, 70)}` : 'NOT DETECTED; ' + j.results.filter(r => r.check === ch).map(r => r.status + ':' + r.msg.slice(0, 40)).slice(0, 3).join(' | '); }
  if (!ok) bad++;
  console.log(`${ok ? 'CAUGHT ' : 'MISSED '} ${m.name.padEnd(18)} ${note}`);
}
if (!keep) rmSync(dir, { recursive: true, force: true }); else console.log('mutants kept in', dir);
console.log(bad ? `\n${bad} defect(s) NOT detected` : `\nall ${results.length} injected defects detected`);
process.exit(bad ? 1 : 0);
