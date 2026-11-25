#!/usr/bin/env node
/* ตรวจ spec ของหน้า (content.js + labs.js) แล้วพิมพ์ JSON: {page, labs, parts, fragments, errors, warnings}
 * เรียกโดย build_page.py  ใช้: node spec_check.js <content.js> [labs.js]
 * labs.js ถูกประเมินด้วย K จำลอง (ลงทะเบียนอย่างเดียว) ดังนั้นโค้ดชั้นนอกของ labs.js ต้องไม่แตะ DOM */
'use strict';
const fs = require('fs'), vm = require('vm');
const [, , cf, lf] = process.argv;
const errors = [], warnings = [], E = m => errors.push(m), W = m => warnings.push(m);
const PRELUDE = '$,$$,esc,fmt,REDUCE,reduced,dget,dset,ls,qid,state,clean,lab,run,anim,svg,fitSvg,wireDraft,wireRadio,radioGroup,fieldsHTML,textOf,revealHTML,expHTML,wireExp,quizHTML,wireQuiz,numHTML,wireNum,markDone,setLabel,select';
const NOOP = new Proxy(function () { }, { get: (t, k) => k === Symbol.toPrimitive ? () => '' : NOOP, apply: () => NOOP, construct: () => ({}) });
const labIds = [];
const Kstub = new Proxy({}, { get: (t, k) => k === 'lab' ? (id) => { labIds.push(id); } : NOOP });
let page = null;
function run(src, file, wrapper) {
  try { return vm.runInNewContext(wrapper(src), { K: Kstub, window: {}, console, Math, Object, Array, JSON, Number, String, Date, parseFloat, parseInt, isFinite, Symbol, Map, Set, RegExp, Error, Infinity, NaN }, { filename: file, timeout: 3000 }); }
  catch (e) { E(file + ': ' + (e && e.message || e)); return undefined; }
}
const cs = fs.readFileSync(cf, 'utf8');
page = run(cs, 'content.js', s => '(function(){let PAGE;\n' + s + '\n;return PAGE;})()');
if (lf && fs.existsSync(lf)) run(fs.readFileSync(lf, 'utf8'), 'labs.js', s => '(function(){\'use strict\';const {' + PRELUDE + '}=K;\n' + s + '\n})()');
const parts = [], fragments = [];
const frag = (where, h) => { if (typeof h === 'string' && h) fragments.push({ where, html: h }); };
const isStr = x => typeof x === 'string' && x.trim().length > 0;
const hex = x => typeof x === 'string' && /^#[0-9a-fA-F]{6}$/.test(x);
function checkPage(P) {
  if (!P || typeof P !== 'object') { E('content.js ต้องกำหนด PAGE = {...}'); return; }
  if (!isStr(P.id) || !/^[a-z0-9][a-z0-9-]*$/.test(P.id)) E('PAGE.id ต้องเป็น slug a-z0-9- (ตรงกับชื่อไฟล์ เช่น chemistry-m5-phys-ch4)');
  if (!isStr(P.title)) E('PAGE.title ว่าง'); else if (/[<>]/.test(P.title)) E('PAGE.title ห้ามมีแท็ก HTML (ใช้ใน <title>)');
  if (!isStr(P.short)) E('PAGE.short ว่าง (ชื่อสั้นใช้ในไฟล์ส่งออกและรหัสคะแนน)');
  if (!hex(P.accent)) E('PAGE.accent ต้องเป็นสี #rrggbb');
  if (P.accentDark != null && !hex(P.accentDark)) E('PAGE.accentDark ต้องเป็นสี #rrggbb');
  if (!P.hero || !isStr(P.hero.h1)) E('PAGE.hero.h1 ว่าง');
  if (P.hero) { frag('hero.lead', P.hero.lead); [].concat(P.hero.notice || []).forEach((n, i) => frag('hero.notice[' + i + ']', n)); if (!P.hero.notice || ![].concat(P.hero.notice).some(isStr)) W('hero.notice ว่าง: ควรระบุค่าที่ผู้จัดทำหน้าสมมติเองและข้อควรระวัง/ข้อมูลนอกหนังสือ'); }
  if (!isStr(P.footer)) E('PAGE.footer ว่าง (ต้องอ้างอิงหน้าของคู่มือ/หนังสือที่ใช้)'); else { frag('footer', P.footer); if (!/หน้า/.test(P.footer)) W('footer ไม่มีเลขหน้าอ้างอิง'); }
  if (!Array.isArray(P.tabs) || !P.tabs.length) { E('PAGE.tabs ว่าง'); return; }
  const ids = new Set(), KIND = ['activity', 'summary', 'exercise', 'custom'];
  P.tabs.forEach((t, i) => {
    const w = 'tabs[' + i + ']';
    if (!isStr(t.id) || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(t.id)) E(w + '.id ต้องเป็นอักษร/ตัวเลข/จุด/ขีด (ใช้ใน URL #act-<id>)');
    else if (ids.has(t.id)) E('tab id ซ้ำ: ' + t.id); else ids.add(t.id);
    if (!KIND.includes(t.kind)) E(w + '.kind ต้องเป็น ' + KIND.join('|') + ' (พบ ' + t.kind + ')');
    if (!isStr(t.label)) E(w + '.label ว่าง'); else if (t.label.length > 60) W(w + '.label ยาวเกิน 60 ตัวอักษร (ปุ่มแท็บจะกว้าง)');
    frag(w + '.html', [].concat(t.html || []).join('\n'));
    if (t.kind === 'activity' && !t.title) W(w + ' (' + t.id + ') ไม่มี title: จะใช้ label เป็นหัวข้อ');
    if (t.done && t.done !== 'visit' && !Array.isArray(t.done)) E(w + '.done ต้องเป็น "visit" หรือ array ของ quiz|run|form');
  });
  const tabIds = ids;
  labIds.forEach(id => { if (!tabIds.has(id)) E('labs.js ลงทะเบียน K.lab("' + id + '") แต่ไม่มีแท็บ id นี้'); });
  const dupLab = labIds.filter((x, i) => labIds.indexOf(x) !== i); if (dupLab.length) E('K.lab ซ้ำ: ' + dupLab.join(','));
  P.tabs.forEach(t => { if (t.kind === 'custom' && !labIds.includes(t.id)) E('แท็บ custom "' + t.id + '" ไม่มี K.lab ใน labs.js'); if (t.kind === 'summary' && !t.html && !labIds.includes(t.id)) W('แท็บ summary "' + t.id + '" ไม่มี html และไม่มี lab: จะว่าง'); if (t.kind === 'activity' && t.run && !labIds.includes(t.id)) E('แท็บ ' + t.id + ' ตั้ง run:true แต่ไม่มี K.lab เรียก K.run("' + t.id + '")'); });
  /* อ่านก่อนทดลอง */
  Object.keys(P.read || {}).forEach(k => {
    if (!tabIds.has(k)) E('read["' + k + '"] ไม่มีแท็บ id นี้'); const r = P.read[k];
    if (!isStr(r.lead)) E('read[' + k + '].lead ว่าง'); frag('read.' + k + '.lead', r.lead);
    if (!Array.isArray(r.secs) || !r.secs.length) E('read[' + k + '].secs ว่าง');
    (r.secs || []).forEach((s, i) => { const w = 'read[' + k + '].secs[' + i + ']';
      if (!isStr(s.h)) E(w + '.h ว่าง'); if (!isStr(s.pg)) E(w + '.pg ว่าง (ต้องอ้างหน้า)'); else if (!/หน้า/.test(s.pg)) W(w + '.pg ไม่มีคำว่า "หน้า": ' + s.pg);
      if (!isStr(s.html)) E(w + '.html ว่าง'); frag(w + '.html', s.html);
      if (s.q != null && !(Array.isArray(s.q) && s.q.length === 2 && isStr(s.q[0]) && isStr(s.q[1]))) E(w + '.q ต้องเป็น [คำถาม, คำตอบ]'); });
  });
  /* ชุดคะแนน */
  const names = new Map(); const addPart = (key, name, max) => {
    if (!isStr(name)) E(key + ': name ว่าง'); else { if ([...name].length > 40) E(key + ': ชื่อส่วนคะแนนยาวเกิน 40 ตัวอักษร (' + [...name].length + '): ' + name); if (names.has(name)) E(key + ': ชื่อส่วนคะแนนซ้ำกับ ' + names.get(name) + ': ' + name); names.set(name, key); }
    if (!(max >= 1 && max <= 100)) E(key + ': คะแนนเต็ม ' + max + ' ต้องอยู่ใน 1..100'); parts.push({ key, name, max });
  };
  const used = new Set();
  Object.keys(P.quiz || {}).forEach(k => { const s = P.quiz[k], w = 'quiz[' + k + ']';
    if (!s || !Array.isArray(s.items) || !s.items.length) { E(w + '.items ว่าง'); return; }
    if (s.perm) { if (!Array.isArray(s.perm) || s.perm.length !== s.items.length) E(w + '.perm ต้องยาวเท่าจำนวนข้อ'); else s.perm.forEach((p, i) => { if (!Number.isInteger(p) || p < 0 || p >= s.items[i].o.length) E(w + '.perm[' + i + ']=' + p + ' อยู่นอกช่วง'); }); }
    s.items.forEach((q, i) => { const ww = w + '.items[' + i + ']';
      if (!isStr(q.q)) E(ww + '.q ว่าง'); if (!Array.isArray(q.o) || q.o.length < 2 || q.o.length > 6 || !q.o.every(isStr)) E(ww + '.o ต้องเป็น 2..6 ตัวเลือกที่ไม่ว่าง');
      else { if (!Number.isInteger(q.a) || q.a < 0 || q.a >= q.o.length) E(ww + '.a=' + q.a + ' อยู่นอกช่วง 0..' + (q.o.length - 1)); if (new Set(q.o.map(x => x.trim())).size !== q.o.length) E(ww + ' มีตัวเลือกซ้ำกัน'); }
      if (!isStr(q.w)) E(ww + '.w (คำอธิบาย/แหล่งอ้างอิง) ว่าง'); frag(ww, q.q + ' ' + (q.o || []).join(' ') + ' ' + q.w); });
    addPart('quiz[' + k + ']', s.name || (k + ' แบบทดสอบ'), s.items.length);
    if (s.fixed && s.perm) W(w + ' ตั้งทั้ง fixed และ perm: fixed ชนะ');
  });
  Object.keys(P.num || {}).forEach(k => { const s = P.num[k], w = 'num[' + k + ']'; if (!s || !Array.isArray(s.items) || !s.items.length) { E(w + '.items ว่าง'); return; }
    s.items.forEach((q, i) => { if (!isStr(q.q) || typeof q.a !== 'number' || !isFinite(q.a) || !isStr(q.w)) E(w + '.items[' + i + '] ต้องมี q (ข้อความ) a (ตัวเลข) w (คำอธิบาย)'); });
    addPart(w, s.name, s.items.length); });
  Object.keys(P.grid || {}).forEach(k => { const s = P.grid[k], w = 'grid[' + k + ']'; if (!s || !Array.isArray(s.head) || !Array.isArray(s.rows)) { E(w + ' ต้องมี head[] และ rows[][]'); return; }
    let cells = 0; s.rows.forEach((r, ri) => { if (r.length !== s.head.length) E(w + '.rows[' + ri + '] จำนวนเซลล์ไม่เท่าหัวตาราง');
      r.forEach((c, ci) => { if (c && typeof c === 'object') { cells++; if (c.sel) { if (!Number.isInteger(c.a) || c.a < 0 || c.a >= c.sel.length) E(w + '.rows[' + ri + '][' + ci + '].a อยู่นอกช่วง'); } else if (typeof c.n !== 'number') E(w + '.rows[' + ri + '][' + ci + '] ต้องเป็น {sel,a} หรือ {n}'); } }); });
    if (!cells) E(w + ' ไม่มีเซลล์ที่ให้กรอก'); addPart(w, s.name, cells); });
  (P.customParts || []).forEach((c, i) => addPart('customParts[' + i + ']', c.name, c.max));
  /* แท็บ ↔ ชุด */
  P.tabs.forEach(t => {
    if (t.kind !== 'activity') return;
    const qs = t.quiz === false ? [] : t.quiz ? [].concat(t.quiz) : (P.quiz && P.quiz[t.id] ? [t.id] : []);
    qs.forEach(q => { used.add(q); if (!(P.quiz && P.quiz[q])) E('แท็บ ' + t.id + ' อ้างชุดแบบทดสอบ "' + q + '" ที่ไม่มีใน PAGE.quiz'); });
    const f = P.forms && P.forms[t.id], fl = !f ? [] : [].concat(f);
    const reqs = t.done ? (t.done === 'visit' ? ['visit'] : t.done) : (fl.some(x => x.need != null) ? ['form'] : qs.length ? ['quiz'] : []).concat(t.run ? ['run'] : []);
    if (!reqs.length) W('แท็บกิจกรรม ' + t.id + ' ไม่มีเงื่อนไขเสร็จ (quiz/form/run) จะไม่ถูกนับว่าเสร็จ: ใส่ done:"visit" หรือ track:false ถ้าตั้งใจ');
    if (reqs.includes('form') && !fl.some(x => x.need != null)) E('แท็บ ' + t.id + ' done มี form แต่ไม่มี forms ที่ตั้ง need');
    if (reqs.includes('quiz') && !qs.length) E('แท็บ ' + t.id + ' done มี quiz แต่ไม่มีชุดแบบทดสอบ');
  });
  Object.keys(P.forms || {}).forEach(k => { const t = P.tabs.find(x => x.id === k); if (!t) { E('forms["' + k + '"] ไม่มีแท็บ id นี้'); return; } if (t.kind !== 'activity') E('forms["' + k + '"]: แท็บต้องเป็น activity');
    const seen = new Set(); [].concat(P.forms[k]).forEach((f, fi) => { const w = 'forms[' + k + '][' + fi + ']'; const groups = f.groups || [{ fields: f.fields || [] }]; let cg = 0;
      if (!groups.length || groups.every(g => !(g.fields || []).length)) E(w + ' ไม่มี fields');
      groups.forEach((g, gi) => { if ((g.role || (f.need != null ? 'count' : 'must')) === 'count') cg++; frag(w + '.g' + gi, g.title);
        (g.fields || []).forEach(x => { const id = Array.isArray(x) ? x[0] : x.id, lb = Array.isArray(x) ? x[1] : x.label; if (!/^[A-Za-z0-9_]+$/.test(id || '')) E(w + ' field id "' + id + '" ต้องเป็น A-Za-z0-9_'); if (seen.has(id)) E(w + ' field id ซ้ำในแท็บ ' + k + ': ' + id); seen.add(id); if (!isStr(lb)) E(w + ' field ' + id + ' ไม่มี label'); frag(w + '.' + id, lb); }); });
      if (f.need != null && (f.need < 1 || f.need > cg)) E(w + '.need=' + f.need + ' เกินจำนวนกลุ่มที่นับได้ (' + cg + ')');
      frag(w + '.small', f.small); frag(w + '.after', f.after); (f.reveal || []).forEach(r => frag(w + '.reveal', r[1])); }); });
  /* แบบฝึกหัด */
  const exTab = P.tabs.filter(t => t.kind === 'exercise');
  if (exTab.length > 1) E('มีแท็บ exercise ได้ 1 แท็บ'); if (exTab.length && !(P.ex && Array.isArray(P.ex.blocks) && P.ex.blocks.length)) E('มีแท็บ exercise แต่ PAGE.ex.blocks ว่าง'); if (!exTab.length && P.ex) W('มี PAGE.ex แต่ไม่มีแท็บ exercise');
  const fseen = new Set();
  ((P.ex && P.ex.blocks) || []).forEach((b, i) => { const w = 'ex.blocks[' + i + ']'; frag(w, b.html); frag(w + '.h', b.h);
    if (b.type === 'quiz') { used.add(b.set); if (!(P.quiz && P.quiz[b.set])) E(w + ' ชุด quiz "' + b.set + '" ไม่มี'); }
    else if (b.type === 'num') { if (!(P.num && P.num[b.set])) E(w + ' ชุด num "' + b.set + '" ไม่มี'); else used.add('num:' + b.set); }
    else if (b.type === 'grid') { if (!(P.grid && P.grid[b.set])) E(w + ' ชุด grid "' + b.set + '" ไม่มี'); else used.add('grid:' + b.set); }
    else if (b.type === 'fields') { (b.fields || []).forEach(x => { const id = Array.isArray(x) ? x[0] : x.id; if (fseen.has(id)) E(w + ' field id ซ้ำ ' + id); fseen.add(id); frag(w + '.' + id, Array.isArray(x) ? x[1] : x.label); }); (b.reveal || []).forEach(r => frag(w + '.reveal', r[1])); }
    else if (b.type !== 'html') E(w + '.type ไม่รู้จัก: ' + b.type); });
  if (P.ex) frag('ex.note', P.ex.note);
  Object.keys(P.quiz || {}).forEach(k => { if (!used.has(k)) W('ชุด quiz "' + k + '" ไม่ถูกใช้ในแท็บใดเลย'); });
  Object.keys(P.num || {}).forEach(k => { if (!used.has('num:' + k)) W('ชุด num "' + k + '" ไม่ถูกใช้'); });
  Object.keys(P.grid || {}).forEach(k => { if (!used.has('grid:' + k)) W('ชุด grid "' + k + '" ไม่ถูกใช้'); });
  if (parts.length > 20) E('ส่วนคะแนนรวม ' + parts.length + ' ส่วน เกิน 20 (LabScore รับไม่เกิน 20)');
  if (P.hero && P.hero.h1 && /คัดลอก|verbatim/i.test(P.hero.h1)) W('hero.h1 ดูเหมือนข้อความคัดลอก');
}
checkPage(page);
console.log(JSON.stringify({ page: page && typeof page === 'object' ? JSON.parse(JSON.stringify(page, (k, v) => typeof v === 'function' ? '[fn]' : v)) : null, labs: labIds, parts, fragments, errors, warnings }));
