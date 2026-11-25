/* pagekit kit.js : เครื่องยนต์กลางของหน้าแล็บ (plain browser JS ไม่มี module/ไลบรารีภายนอก)
 * ใช้คู่กับ kit.css ประกอบเป็นไฟล์เดียวด้วย tools/pagekit/build_page.py
 *
 * ผู้เขียนหน้าเขียนเฉพาะ content.js (กำหนด PAGE) และ labs.js (K.lab(id, build, wire)) ดู AGENT_BRIEF.md
 *
 * พฤติกรรมที่ผ่าน QA มาแล้วและต้องคงไว้ (ห้ามแก้เพื่อความสะดวก):
 *  Q1  แบบทดสอบไม่ไฮไลต์ตัวเลือก (ไม่ใส่ class ถูก/ผิดที่ตัวเลือก) แสดงเฉพาะคะแนน + เฉลย + คำอธิบายใต้ข้อ
 *  Q2  ตำแหน่งเฉลยกำหนดชัดเจน: รับ perm ต่อชุด ไม่งั้นสุ่มแบบกำหนดผลได้ (seed = id หน้า+id ชุด) ไม่เวียนเป็นวงจร
 *      ไม่จับกลุ่ม ไม่เป็นคาบ ตรวจซ้ำก่อนใช้ ชุด 2 ตัวเลือกใช้ตรรกะเดียวกัน (แค่สลับ 2 ช่อง) ข้อที่ keep:true ไม่ถูกย้าย
 *  Q3  CLEAN[]: ทุกแอนิเมชัน/ตัวจับเวลาของแท็บต้องลงทะเบียน K.clean(fn) (หรือใช้ K.anim) เพื่อหยุดก่อนเปลี่ยนแท็บ
 *  Q4  LabScore.use(id,title) เรียก "หลัง" สร้างแผงเสร็จ ไม่งั้นตัวนับของแผงส่งผลที่ inject ไว้จะค้างค่าแท็บก่อนหน้า
 *  Q5  ตาราง .tw ไม่บังคับ min-width กับตาราง <= 2 คอลัมน์ (ไม่โดนตัดครึ่ง) และมีคำใบ้ "เลื่อนดูต่อ" เมื่อกรอบแคบกว่าตาราง
 *  Q6  .fig svg กว้างไม่เกิน 560px อยู่กึ่งกลาง; K.svg บังคับ role=img + aria-label; K.fitSvg ดันฟอนต์ให้ >= 11px ที่หน้าจอจริง (375px)
 *  Q7  ปุ่มรีเซ็ตบอกว่าคะแนนที่บันทึกไปแล้วไม่ถูกล้าง (LabScore.set ค่าล่าสุดยังอยู่)
 *  Q8  hero แสดงเฉพาะฟีเจอร์ที่มีจริง (ประโยคสร้างจาก PAGE) + หมายเหตุข้อเขียน (ส่งเฉพาะแท็บที่เปิดอยู่ตอนกดส่ง)
 *  Q9  ข้อเขียนเป็น <textarea id label[for]> เสมอ (โมดูลส่งคะแนนเก็บ textarea ทั้งหน้าด้วย label[for]); ส่งออก/คัดลอกใช้ <pre> สำรอง ไม่ใช้ textarea
 *  Q10 localStorage ทุกจุดอยู่ใน try/catch; หน้าต้องใช้ได้เมื่อ storage ใช้ไม่ได้
 *  Q11 reduced-motion: ห้องทดลองต้องกระโดดไปผลสุดท้ายเอง (K.REDUCE / K.reduced()); CSS ปิด animation/transition
 *  Q12 ทิศทางลูกศร/Home/End บนแท็บ (roving tabindex) และลิงก์ตรง #act-<id>
 */
(function () {
  'use strict';
  const K = window.K = { version: 1 };
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (x, d) => { const v = Number(x); return Number.isFinite(v) ? String(+v.toFixed(d == null ? 2 : d)) : '–'; };
  const REDUCE = (() => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; } })();
  const reduced = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; } };
  Object.assign(K, { $, $$, esc, fmt, REDUCE, reduced });

  let P = null;                 /* PAGE */
  let st = { done: {}, q: {}, run: {} };
  let DR = {};
  let KEY = '', DK = '';
  const BUILD = {};             /* id -> [build, wire] */
  const CLEAN = [];
  let cur = 0, TABS = [], usedFields = false;
  const QS = {}, NUMS = {}, GRIDS = {};   /* ชุดที่ประมวลผลแล้ว */
  const qid = a => String(a).replace(/[^A-Za-z0-9_-]/g, '_');

  /* ---------- storage (Q10) ---------- */
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (_) { } }
  function dsave() { try { localStorage.setItem(DK, JSON.stringify(DR)); } catch (_) { } }
  function loadState() {
    try { const s = JSON.parse(localStorage.getItem(KEY) || '{}'); if (s && s.done) st = Object.assign({ done: {}, q: {}, run: {} }, s); } catch (_) { }
    try { DR = JSON.parse(localStorage.getItem(DK) || '{}') || {}; } catch (_) { DR = {}; }
  }
  const dget = (ns, k) => { const v = DR[ns + '|' + k]; return v == null ? '' : v; };
  const dset = (ns, k, v) => { DR[ns + '|' + k] = v; dsave(); };
  const PARTS = {};
  function ls(name, got, max) {
    /* LabScore รับชื่อส่วน <= 40 ตัวอักษร, เต็ม <= 100, รวมไม่เกิน 20 ส่วน: เตือนใน console ถ้าละเมิด */
    try { PARTS[name] = max; if ([...String(name)].length > 40 || max > 100 || Object.keys(PARTS).length > 20) console.warn('pagekit: ส่วนคะแนนผิดข้อจำกัด', name, max); } catch (_) { }
    try { window.LabScore && window.LabScore.set(name, got, max); } catch (_) { }
  }
  Object.assign(K, { dget, dset, ls, save, qid });
  K.state = () => st;
  K.clean = fn => { CLEAN.push(fn); };
  K.lab = (id, build, wire) => { BUILD[id] = [build || (() => ''), wire || (() => { })]; };

  /* ---------- ตำแหน่งเฉลย (Q2) ---------- */
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  /* ตรวจรูปแบบตำแหน่งเฉลย: คืนข้อความปัญหา หรือ '' ถ้าใช้ได้ */
  function posProblem(pos, ks) {
    const n = pos.length; if (n < 3) return '';
    if (n < 4) return pos.every(p => p === pos[0]) ? 'ตำแหน่งเดียวกันทุกข้อ' : '';   /* ชุดสั้นมาก: เวียน/สมดุลเลี่ยงไม่ได้ ตรวจแค่ไม่ซ้ำหมด */
    const kmax = Math.max.apply(null, ks), same = ks.every(k => k === ks[0]);
    if (pos.every(p => p === pos[0])) return 'ตำแหน่งเดียวกันทุกข้อ';
    for (let i = 0; i + 2 < n; i++) if (pos[i] === pos[i + 1] && pos[i] === pos[i + 2]) return 'เฉลยตำแหน่งเดียวกัน 3 ข้อติด';
    if (same) {
      const k = ks[0]; let ap = true; const d = ((pos[1] - pos[0]) % k + k) % k;
      for (let i = 1; i + 1 < n; i++) if ((((pos[i + 1] - pos[i]) % k) + k) % k !== d) { ap = false; break; }
      if (ap) return 'เวียนเป็นวงจร';
    }
    if (n >= 4) for (let p = 1; p <= Math.floor(n / 2); p++) { let per = true; for (let i = 0; i + p < n; i++) if (pos[i] !== pos[i + p]) { per = false; break; } if (per) return 'เป็นคาบ ' + p; }
    const cnt = new Array(kmax).fill(0); pos.forEach(p => cnt[p]++);
    const cap = Math.ceil(n / (same ? ks[0] : 2)) + (same ? 0 : 1);
    if (cnt.some(c => c > cap)) return 'จับกลุ่มที่ตำแหน่งเดียว';
    return '';
  }
  function autoPositions(ks, seed) {
    const n = ks.length, same = ks.every(k => k === ks[0]);
    let last = null;
    for (let t = 0; t < 400; t++) {
      const R = rng(hash(seed + '|' + t)); let pos;
      if (same) { /* multiset สมดุล แล้วสับ */
        const k = ks[0], a = []; for (let i = 0; i < n; i++) a.push(i % k);
        for (let i = n - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); const x = a[i]; a[i] = a[j]; a[j] = x; }
        pos = a;
      } else pos = ks.map(k => Math.floor(R() * k));
      last = pos; if (!posProblem(pos, ks)) return pos;
    }
    return last;
  }
  /* วางตัวเลือกถูกที่ตำแหน่ง t โดยคงลำดับของตัวเลือกผิดไว้ */
  function placeCorrect(o, ci, t) { const c = o[ci], rest = o.filter((_, i) => i !== ci); return rest.slice(0, t).concat([c], rest.slice(t)); }
  function prepQuiz(id, set) {
    const items = set.items || [], ks = items.map(q => q.o.length);
    let pos;
    if (set.fixed) pos = items.map(q => q.a);
    else if (set.perm) pos = set.perm.slice();
    else pos = autoPositions(ks, (P.id || '') + '|' + id);
    const out = items.map((q, i) => (set.fixed || q.keep) ? { n: q.n, q: q.q, o: q.o.slice(), a: q.a, w: q.w } : { n: q.n, q: q.q, o: placeCorrect(q.o, q.a, pos[i]), a: pos[i], w: q.w });
    return { id, name: set.name || (id + ' แบบทดสอบ'), title: set.title, items: out };
  }
  K.auto = autoPositions; K.posProblem = posProblem;   /* เปิดให้ทดสอบ */
  K.positions = () => Object.keys(QS).map(k => ({ set: k, pos: QS[k].items.map(q => q.a), k: QS[k].items.map(q => q.o.length), problem: posProblem(QS[k].items.map(q => q.a), QS[k].items.map(q => q.o.length)) }));

  /* ---------- ร่างงาน ข้อเขียน ส่งออก ---------- */
  function wireDraft(root, ns, onchg) {
    $$('[data-d]', root).forEach(el => {
      const k = ns + '|' + el.dataset.d;
      if (el.type === 'checkbox') { el.checked = !!DR[k]; el.addEventListener('change', () => { DR[k] = el.checked; dsave(); onchg && onchg(); }); }
      else if (el.type === 'radio') { el.checked = DR[k] === el.value; el.addEventListener('change', () => { if (el.checked) { DR[k] = el.value; dsave(); onchg && onchg(); } }); }
      else { if (DR[k] != null) el.value = DR[k]; const h = () => { DR[k] = el.value; dsave(); onchg && onchg(); }; el.addEventListener('input', h); el.addEventListener('change', h); }
    });
  }
  /* radio ผูกกับร่างงาน (ใช้ name เป็นคีย์) */
  function wireRadio(root, ns, name, cb) {
    const k = ns + '|' + name;
    $$('input[name="' + name + '"]', root).forEach(el => { el.checked = DR[k] === el.value; el.addEventListener('change', () => { if (el.checked) { DR[k] = el.value; dsave(); cb && cb(el.value); } }); });
  }
  const radioGroup = (name, opts) => `<div class="rg" role="radiogroup" aria-label="${esc(name)}">` + opts.map(o => `<label><input type="radio" name="${name}" value="${o[0]}" data-r="1"><span>${o[1]}</span></label>`).join('') + '</div>';
  const normRows = rows => rows.map(r => Array.isArray(r) ? r : [r.id, r.label, r.hint]);
  function fieldsHTML(rows) {
    usedFields = true;
    return normRows(rows).map(r => `<div class="q"><label class="lbl" for="f_${r[0]}">${r[1]}</label>${r[2] ? `<div class="small">${r[2]}</div>` : ''}<textarea id="f_${r[0]}" data-d="${r[0]}" placeholder="พิมพ์ที่นี่"></textarea></div>`).join('');
  }
  const stripTags = s => String(s).replace(/<[^>]+>/g, '');
  function textOf(ns, rows, head) { return head + '\n' + normRows(rows).map(r => '\n## ' + stripTags(r[1]) + '\n' + (dget(ns, r[0]) || '(ยังไม่ได้กรอก)')).join('\n') + '\n'; }
  /* เนื้อหาที่ขึ้นต้นด้วยแท็กบล็อก (p/ul/ol/div/table) ใส่ตรง ๆ ไม่งั้นห่อด้วย <p> */
  function revealHTML(items) { return items.map(r => `<details class="rd-q"><summary>${r[0]}</summary>${/^\s*<(p|ul|ol|div|table)[\s>]/.test(r[1]) ? r[1] : `<p>${r[1]}</p>`}</details>`).join(''); }
  function expHTML(id) { return `<div class="btns"><button class="btn sm" type="button" data-ex="copy" data-for="${id}">คัดลอกเป็นข้อความ</button><button class="btn alt sm" type="button" data-ex="dl" data-for="${id}">ดาวน์โหลดเป็นไฟล์ .txt</button></div><div class="small" id="exs_${id}" aria-live="polite"></div>`; }
  function wireExp(id, getText, fname) {
    const c = $('[data-ex=copy][data-for="' + id + '"]'), d = $('[data-ex=dl][data-for="' + id + '"]'), s = $('#exs_' + id); if (!c || !d || !s) return;
    const fb = t => { s.innerHTML = '<pre tabindex="0" style="white-space:pre-wrap;user-select:all;margin:0" aria-label="ข้อความสำหรับคัดลอก"></pre>'; const pre = $('pre', s); pre.textContent = t; pre.focus(); try { const rg = document.createRange(); rg.selectNodeContents(pre); const sl = getSelection(); sl.removeAllRanges(); sl.addRange(rg); } catch (_) { } };
    c.onclick = () => { const t = getText(); let ok = false; try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(t).then(() => { s.textContent = 'คัดลอกแล้ว'; }, () => fb(t)); ok = true; } } catch (_) { } if (!ok) fb(t); };
    d.onclick = () => { try { const b = new Blob([getText()], { type: 'text/plain;charset=utf-8' }), u = URL.createObjectURL(b), a = document.createElement('a'); a.href = u; a.download = fname; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 1500); s.textContent = 'สร้างไฟล์ ' + fname + ' แล้ว'; } catch (_) { fb(getText()); } };
  }
  Object.assign(K, { wireDraft, wireRadio, radioGroup, fieldsHTML, textOf, revealHTML, expHTML, wireExp });

  /* ---------- อ่านก่อนทดลอง ---------- */
  function readHTML(a) {
    const r = P.read && P.read[a]; if (!r) return '';
    return `<div class="rd"><div class="rd-head"><span class="rd-tag">อ่านก่อนทดลอง</span><p class="rd-lead">${r.lead}</p></div>` +
      r.secs.map(x => `<article class="rd-sec"><h2>${x.h}</h2><p class="rd-pg">${x.pg} · สรุปโดยผู้จัดทำหน้า ไม่ใช่ข้อความต้นฉบับ</p>${x.html}${x.q ? `<details class="rd-q"><summary>ลองคิด: ${x.q[0]}</summary><p>${x.q[1]}</p></details>` : ''}</article>`).join('') +
      `<div class="rd-skip"><button class="btn alt sm" type="button" id="skipRead">ไปที่กิจกรรม ↓</button></div><div class="rd-div" id="labstart" tabindex="-1"><span>ลงมือทำ</span></div></div>`;
  }

  /* ---------- แบบทดสอบ (Q1) ---------- */
  function quizHTML(set, title) {
    const q = QS[set]; if (!q) throw new Error('ไม่พบชุดแบบทดสอบ ' + set);
    const id = qid(set);
    return '<div class="box" id="quiz-' + id + '"><h3>' + (title || q.title || 'แบบทดสอบสั้น') + ' (ข้อละ 1 คะแนน)</h3>' + q.items.map((it, i) => '<fieldset class="q exf" data-i="' + i + '"><legend>' + (it.n ? it.n + ' ' : (i + 1) + '. ') + it.q + '</legend>' + it.o.map((o, j) => '<label class="opt"><input type="radio" name="q' + id + '_' + i + '" value="' + j + '"><span>' + o + '</span></label>').join('') + '<div class="why hide"></div></fieldset>').join('') +
      '<div class="btns"><button class="btn" type="button" data-act="check">ตรวจคำตอบ</button><button class="btn alt" type="button" data-act="retry">ทำใหม่</button></div><div class="res" aria-live="polite"></div></div>';
  }
  function wireQuiz(set, gate, tabId) {
    const root = $('#quiz-' + qid(set)); if (!root) return; const q = QS[set], qs = q.items;
    $('[data-act=check]', root).onclick = () => {
      let got = 0, answered = 0;
      $$('.q', root).forEach((el, i) => {
        const sel = el.querySelector('input:checked'), why = $('.why', el);
        if (sel) { answered++; if (+sel.value === qs[i].a) got++; }
        why.classList.remove('hide'); why.innerHTML = (sel && +sel.value === qs[i].a ? 'ถูกต้อง · ' : 'เฉลย: ' + qs[i].o[qs[i].a] + ' · ') + qs[i].w;
      });
      const r = $('.res', root);
      if (answered < qs.length) { r.className = 'res bad'; r.textContent = 'ยังตอบไม่ครบ (' + answered + '/' + qs.length + ') ได้ ' + got + ' / ' + qs.length + ' คะแนน (ข้อที่ว่างนับเป็นไม่ถูก)'; }
      else { r.className = 'res ok'; r.textContent = 'ได้ ' + got + ' / ' + qs.length + ' คะแนน'; }
      ls(q.name, got, qs.length);
      if (answered === qs.length && gate) { st.q[set] = true; save(); tryDone(tabId || set); }
    };
    $('[data-act=retry]', root).onclick = () => { $$('input', root).forEach(i => i.checked = false); $$('.why', root).forEach(w => w.classList.add('hide')); $('.res', root).textContent = ''; };
  }
  Object.assign(K, { quizHTML, wireQuiz });

  /* ---------- ช่องตัวเลข (ตรวจอัตโนมัติ ค่าคลาดเคลื่อน) ---------- */
  const numOk = (raw, it) => { const v = parseFloat(raw); if (raw === '' || !Number.isFinite(v)) return false; const tol = it.tol != null ? it.tol : 0.001; return Math.abs(v - it.a) <= Math.max(tol, it.rel ? Math.abs(it.a) * it.rel : 0); };
  function numHTML(id, title) {
    const s = NUMS[id]; if (!s) throw new Error('ไม่พบชุดตัวเลข ' + id);
    return '<div class="box" id="num-' + qid(id) + '"><h3>' + (title || s.title || '') + '</h3>' + s.items.map((it, i) => '<div class="q"><label class="lbl" for="n_' + qid(id) + '_' + i + '">' + it.q + '</label><input class="num" id="n_' + qid(id) + '_' + i + '" type="number" step="any" inputmode="decimal"> ' + (it.u || '') + '<div class="why hide"></div></div>').join('') + '<div class="btns"><button class="btn" type="button" data-act="check">ตรวจคำตอบ</button><button class="btn alt" type="button" data-act="retry">ทำใหม่</button></div><div class="res" aria-live="polite"></div></div>';
  }
  function wireNum(id) {
    const root = $('#num-' + qid(id)); if (!root) return; const s = NUMS[id], items = s.items;
    $('[data-act=check]', root).onclick = () => {
      let got = 0, answered = 0;
      items.forEach((it, i) => { const el = $('#n_' + qid(id) + '_' + i, root), why = $('.why', el.parentNode); const raw = el.value.trim(); const ok = numOk(raw, it);
        if (raw !== '' && Number.isFinite(parseFloat(raw))) answered++; if (ok) got++;
        why.classList.remove('hide'); why.textContent = (ok ? 'ถูกต้อง · ' : 'เฉลย: ' + it.a + ' ' + (it.u || '') + ' · ') + it.w; });
      const r = $('.res', root); r.className = 'res ' + (answered < items.length ? 'bad' : 'ok');
      r.textContent = (answered < items.length ? 'ยังกรอกไม่ครบ (' + answered + '/' + items.length + ') ' : '') + 'ได้ ' + got + ' / ' + items.length + ' คะแนน';
      ls(s.name, got, items.length);
    };
    $('[data-act=retry]', root).onclick = () => { $$('input', root).forEach(i => i.value = ''); $$('.why', root).forEach(w => w.classList.add('hide')); $('.res', root).textContent = ''; };
  }
  Object.assign(K, { numHTML, wireNum });

  /* ---------- ตารางเติม/เลือก (grid) : เซลล์เป็นข้อความคงที่ หรือ {sel:[ตัวเลือก],a:index} หรือ {n:ค่า,tol,u} ---------- */
  const gridCells = s => { const out = []; s.rows.forEach((r, ri) => r.forEach((c, ci) => { if (c && typeof c === 'object') out.push([ri, ci, c]); })); return out; };
  function gridHTML(id, title) {
    const s = GRIDS[id]; if (!s) throw new Error('ไม่พบตาราง ' + id); const gid = qid(id);
    return '<div class="box" id="grid-' + gid + '"><h3>' + (title || s.title || '') + '</h3><div class="tw"><table class="tbl-sm' + (s.head.length >= 3 ? ' wide' : '') + '"><thead><tr>' + s.head.map((h, i) => '<th' + (i === 0 ? ' class="l"' : '') + '>' + h + '</th>').join('') + '</tr></thead><tbody>' +
      s.rows.map((r, ri) => '<tr>' + r.map((c, ci) => { if (!c || typeof c !== 'object') return '<td' + (ci === 0 ? ' class="l"' : '') + '>' + c + '</td>'; const k = 'g_' + gid + '_' + ri + '_' + ci, lab = esc(stripTags(r[0] && typeof r[0] === 'string' ? r[0] : 'แถว ' + (ri + 1)) + ' ' + stripTags(s.head[ci] || ''));
        return '<td>' + (c.sel ? '<select id="' + k + '" aria-label="' + lab + '"><option value="">— เลือก —</option>' + c.sel.map((o, j) => '<option value="' + j + '">' + o + '</option>').join('') + '</select>' : '<input class="num" id="' + k + '" type="number" step="any" inputmode="decimal" aria-label="' + lab + '"> ' + (c.u || '')) + '<span class="mk" id="m_' + k + '" aria-live="polite"></span></td>'; }).join('') + '</tr>').join('') +
      '</tbody></table></div><div class="btns"><button class="btn" type="button" data-act="check">ตรวจคำตอบ</button><button class="btn alt" type="button" data-act="retry">ทำใหม่</button></div><div class="res" aria-live="polite"></div></div>';
  }
  function wireGrid(id) {
    const s = GRIDS[id], gid = qid(id), root = $('#grid-' + gid); if (!root) return; const cells = gridCells(s);
    $('[data-act=check]', root).onclick = () => {
      let got = 0, answered = 0;
      cells.forEach(([ri, ci, c]) => { const k = 'g_' + gid + '_' + ri + '_' + ci, el = $('#' + k, root), m = $('#m_' + k, root); let ok = false, has = false;
        if (c.sel) { has = el.value !== ''; ok = has && +el.value === c.a; } else { const raw = el.value.trim(); has = raw !== '' && Number.isFinite(parseFloat(raw)); ok = numOk(raw, { a: c.n, tol: c.tol, rel: c.rel }); }
        if (has) answered++; if (ok) got++;
        m.className = 'mk ' + (ok ? 'okc' : 'badc'); m.textContent = ok ? ' ถูกต้อง' : ' เฉลย: ' + (c.sel ? c.sel[c.a] : c.n); });
      const r = $('.res', root); r.className = 'res ' + (answered < cells.length ? 'bad' : 'ok');
      r.textContent = (answered < cells.length ? 'ยังตอบไม่ครบ (' + answered + '/' + cells.length + ') ' : '') + 'ได้ ' + got + ' / ' + cells.length + ' คะแนน' + (s.w ? ' · ' + s.w : '');
      ls(s.name, got, cells.length);
    };
    $('[data-act=retry]', root).onclick = () => { $$('input,select', root).forEach(i => i.value = ''); $$('.mk', root).forEach(m => m.textContent = ''); $('.res', root).textContent = ''; };
  }
  Object.assign(K, { gridHTML, wireGrid });

  /* ---------- แบบบันทึก/สืบค้น (forms) ---------- */
  const DEF_SMALL = 'ข้อความที่พิมพ์ในช่องจะถูกส่งให้ครูเมื่อกดส่งในแผงส่งผลท้ายหน้า ไม่มีคะแนนอัตโนมัติ';
  const DEF_SMALL_DONE = 'ข้อความที่พิมพ์จะบันทึกในเครื่องนี้อัตโนมัติ และ<b>ถูกส่งให้ครูเมื่อกดส่งในแผงส่งผลท้ายหน้า</b> ไม่มีคะแนนอัตโนมัติ';
  const formList = t => { const f = P.forms && P.forms[t.id]; return !f ? [] : (Array.isArray(f) ? f : [f]); };
  const formGroups = f => f.groups || [{ fields: f.fields || [] }];
  const fieldObj = x => Array.isArray(x) ? { id: x[0], label: x[1], hint: x[2] } : x;
  const formKey = (t, f, i) => 'p_' + qid(t.id) + '_' + (f.id || i);
  function formState(t, f) {
    const need = f.need, mc = f.minChars != null ? f.minChars : 5; let n = 0, m = 0, mustOk = true;
    formGroups(f).forEach(g => {
      const role = g.role || (f.need != null ? 'count' : 'must');
      const fs = (g.fields || []).map(fieldObj).filter(x => !x.opt);
      const ok = fs.every(x => dget(t.id, x.id).trim().length >= (x.min != null ? x.min : g.min != null ? g.min : mc));
      if (role === 'count') { m++; if (ok) n++; } else if (!ok) mustOk = false;
    });
    const need2 = need != null ? need : m;
    return { n, m, need: need2, mustOk, ok: n >= need2 && mustOk };
  }
  function formHTML(t, f, i) {
    const key = formKey(t, f, i), small = f.small != null ? f.small : (f.need != null ? DEF_SMALL_DONE + ' ใส่ให้ครบอย่างน้อย ' + f.need + ' ' + (f.unit || 'กลุ่ม') + (formGroups(f).some(g => g.role === 'must') ? ' และกรอกส่วนที่จำเป็นให้ครบ' : '') + ' จึงถือว่ากิจกรรมเสร็จ' : DEF_SMALL);
    const checks = f.checks ? `<div class="box"><h3>${f.checksTitle || 'ตรวจตนเองก่อนส่ง'}</h3>${f.checks.map((c, j) => `<label class="opt"><input type="checkbox" data-d="ck${j}"><span>${c}</span></label>`).join('')}</div>` : '';
    const rub = f.rubric ? `<div class="tw"><table class="tbl-sm wide"><thead><tr><th class="l">${f.rubric.title || 'สิ่งที่ประเมิน'}</th>${(f.rubric.levels || ['ดี', 'พอใช้', 'ต้องปรับปรุง']).map(l => `<th>${l}</th>`).join('')}</tr></thead><tbody>${f.rubric.rows.map((r, j) => `<tr><td class="l">${r}</td>${(f.rubric.levels || ['ดี', 'พอใช้', 'ต้องปรับปรุง']).map(l => `<td><label class="opt" style="justify-content:center"><input type="radio" name="rt${j}" value="${l}" data-d="rt${j}" aria-label="${esc(l + ': ' + stripTags(r))}"></label></td>`).join('')}</tr>`).join('')}</tbody></table></div><div class="res" id="rate_${key}" aria-live="polite"></div>` : '';
    return `<div class="lab" id="${key}"><h3>${f.title || 'แบบบันทึก'}</h3><p class="small">${small}</p>${checks}` +
      formGroups(f).map(g => g.title ? `<div class="box"><h3>${g.title}</h3>${fieldsHTML(g.fields.map(fieldObj))}</div>` : fieldsHTML((g.fields || []).map(fieldObj))).join('') +
      rub + (f.reveal ? revealHTML(f.reveal) : '') + (f.need != null ? `<div class="res" id="st_${key}" aria-live="polite"></div>` : '') + expHTML(key) + '</div>' + (f.after || '');
  }
  function formRows(f) { const out = []; formGroups(f).forEach(g => (g.fields || []).map(fieldObj).forEach(x => out.push([x.id, (g.title ? g.title + ': ' : '') + stripTags(x.short || x.label)]))); return out; }
  function wireForm(t, f, i) {
    const key = formKey(t, f, i), unit = f.unit || 'กลุ่ม';
    const upd = () => {
      const r = $('#st_' + key); if (r) {
        const s = formState(t, f);
        r.className = 'res ' + (s.ok ? 'ok' : '');
        r.textContent = f.statusText ? f.statusText(s) : (s.ok ? 'กรอกครบ ' + s.n + ' / ' + s.m + ' ' + unit + ' ✓ (ครบเกณฑ์อย่างน้อย ' + s.need + ')' : 'กรอกครบแล้ว ' + s.n + ' / ' + s.m + ' ' + unit + ' (ต้องการอย่างน้อย ' + s.need + (s.mustOk ? '' : ' และกรอกช่องที่จำเป็นให้ครบ') + ')');
      }
      if (f.rubric) { const rr = $('#rate_' + key), lv = f.rubric.levels || ['ดี', 'พอใช้', 'ต้องปรับปรุง'], c = {}; lv.forEach(l => c[l] = 0); let a = 0;
        f.rubric.rows.forEach((_, j) => { const v = dget(t.id, 'rt' + j); if (v && c[v] != null) { c[v]++; a++; } });
        if (rr) rr.textContent = a ? 'ประเมินแล้ว ' + a + '/' + f.rubric.rows.length + ' ข้อ: ' + lv.map(l => l + ' ' + c[l]).join(' · ') + ' (ประเมินตนเอง ไม่คิดคะแนน)' : ''; }
    };
    wireExp(key, () => textOf(t.id, formRows(f), f.exportHead || (t.id + ' ผลบันทึก')), f.exportName || ('activity-' + qid(t.id) + '.txt'));
    return upd;
  }

  /* ---------- สถานะเสร็จ ---------- */
  function reqs(t) {
    if (t.kind !== 'activity' || t.track === false) return null;
    if (t.done) return t.done === 'visit' ? ['visit'] : t.done;
    const r = [], fd = formList(t).some(f => f.need != null), qs = tabQuizSets(t);
    if (fd) r.push('form'); else if (qs.length) r.push('quiz');
    if (t.run) r.push('run');
    return r;
  }
  function tabQuizSets(t) { return t.quiz === false ? [] : t.quiz ? [].concat(t.quiz) : (P.quiz && P.quiz[t.id] ? [t.id] : []); }
  function isDone(t) { return !!st.done[t.id]; }
  function tryDone(id) {
    if (st.done[id]) return; const t = TABS.find(x => x.id === id); if (!t) return; const r = reqs(t); if (!r || !r.length) return;
    const ok = r.every(k => k === 'quiz' ? tabQuizSets(t).every(s => st.q[s]) : k === 'run' ? st.run[id] : k === 'form' ? st['form:' + id] : k === 'visit' ? true : false);
    if (ok) markDone(id);
  }
  function markDone(id) {
    if (!st.done[id]) { st.done[id] = true; save(); paintTabs(); paintProgress(); }
  }
  /* ห้องทดลองเรียกเมื่อผู้เรียนทำการทดลองครบ (นับเป็น run) */
  K.run = id => { st.run[id] = true; save(); tryDone(id); };
  K.markDone = markDone;
  K.anim = (step, o) => { /* ลูปแอนิเมชันที่หยุดเองเมื่อเปลี่ยนแท็บ (Q3) step(dt วินาที ถูก clamp 0.1) คืน false เมื่อจบ */
    o = o || {}; let raf = null, last = 0, run = false;
    const stop = () => { run = false; if (raf) { cancelAnimationFrame(raf); raf = null; } };
    const tick = ts => { if (!run) return; if (o.el && !o.el.isConnected) { stop(); return; } const dt = Math.max(0, Math.min(.1, (ts - last) / 1000)); last = ts; if (step(dt) === false) { stop(); o.onEnd && o.onEnd(); return; } raf = requestAnimationFrame(tick); };
    const h = { start() { stop(); run = true; last = performance.now(); raf = requestAnimationFrame(tick); }, stop, get running() { return run; } };
    CLEAN.push(stop); return h;
  };

  /* ---------- SVG helper (Q6) ---------- */
  K.svg = (w, h, label, inner, o) => {
    o = o || {}; if (!label || !String(label).trim()) throw new Error('K.svg: ต้องมี aria-label');
    return `<svg${o.id ? ` id="${o.id}"` : ''} viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}">${inner}</svg>`;
  };
  K.setLabel = (svg, label) => { svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', label); };
  const MINFS = 11;
  function fitSvg(root) {
    $$('svg[viewBox]', root || document).forEach(svg => {
      const vb = svg.viewBox.baseVal; if (!vb || !vb.width) return;
      if (svg.closest('.fig')) svg.style.maxWidth = Math.min(560, Math.round(vb.width * 2.2)) + 'px'; /* ไม่ขยายภาพเล็กเกิน 2.2 เท่า */
      const bw = svg.getBoundingClientRect().width; if (!bw) return;
      const scale = bw / vb.width, need = MINFS / scale;
      $$('text', svg).forEach(tx => {
        if (tx.dataset.fs0 == null) { const a = tx.getAttribute('font-size'); tx.dataset.fs0 = a != null ? a : ''; }
        const base = tx.dataset.fs0 === '' ? 16 : parseFloat(tx.dataset.fs0); if (!Number.isFinite(base)) return;
        if (base < need) tx.setAttribute('font-size', (Math.ceil(need * 10) / 10)); else if (tx.dataset.fs0 !== '') tx.setAttribute('font-size', tx.dataset.fs0); else tx.removeAttribute('font-size');
      });
    });
  }
  K.fitSvg = fitSvg;
  function tidyTables(root) {
    $$('.tw', root || document).forEach(w => {
      const tb = $('table', w); if (!tb) return;
      let cols = 0; $$('tr', tb).forEach(r => { let c = 0; Array.from(r.children).forEach(x => c += +(x.getAttribute('colspan') || 1)); if (c > cols) cols = c; });
      if (cols <= 2) tb.classList.remove('wide');
      tb.style.minWidth = tb.classList.contains('wide') ? (cols * 92) + 'px' : '';
      const prev = w.previousElementSibling, hint = prev && prev.classList.contains('tw-hint') ? prev : null;
      if (w.scrollWidth > w.clientWidth + 1) {
        w.tabIndex = 0; w.setAttribute('role', 'region'); w.setAttribute('aria-label', 'ตาราง เลื่อนไปทางขวาเพื่อดูต่อ');
        if (!hint) { const h = document.createElement('div'); h.className = 'tw-hint'; h.textContent = 'ตารางนี้กว้างกว่าหน้าจอ เลื่อนไปทางขวาเพื่อดูคอลัมน์ที่เหลือ →'; w.parentNode.insertBefore(h, w); }
      } else { if (hint) hint.remove(); w.removeAttribute('tabindex'); w.removeAttribute('role'); w.removeAttribute('aria-label'); }
    });
  }
  K.tidyTables = tidyTables;
  /* ตรวจรวดเดียวสำหรับ QA/ผู้พัฒนา: คืนรายการปัญหาของแท็บที่เปิดอยู่ */
  K.audit = () => {
    const out = { svgNoLabel: [], smallText: [], overflow: [], noLabelField: [] }, root = $('#main');
    $$('svg', root).forEach((s, i) => { if (s.getAttribute('role') !== 'img' || !s.getAttribute('aria-label')) out.svgNoLabel.push(s.id || 'svg#' + i); if (s.closest('[aria-hidden=true]')) return;
      const vb = s.viewBox.baseVal, bw = s.getBoundingClientRect().width; if (vb && vb.width && bw) $$('text', s).forEach(tx => { const fs = parseFloat(getComputedStyle(tx).fontSize) * bw / vb.width; if (fs < MINFS - 0.05) out.smallText.push((tx.textContent || '').slice(0, 20) + ' ' + fs.toFixed(1)); }); });
    $$('textarea', root).forEach(t => { if (!t.id || !$('label[for="' + t.id + '"]')) out.noLabelField.push(t.id || '(no id)'); });
    const W = document.documentElement.clientWidth;
    $$('body *', document).forEach(e => { const r = e.getBoundingClientRect(); if (r.width > 0 && r.right > W + 1 && !e.closest('.tw,.tabs,pre')) out.overflow.push(e.tagName + '.' + e.className + ':' + Math.round(r.right)); });
    out.overflow = out.overflow.slice(0, 8); return out;
  };

  /* ---------- สร้างแท็บ ---------- */
  const tabPrefix = t => /^\d/.test(t.id) ? t.id + ' ' : '';
  const tabText = t => tabPrefix(t) + t.label;
  const shortRef = t => /^\d/.test(t.id) ? t.id : t.label;
  function extraBlocks(t) { /* ฟอร์ม + แบบทดสอบ ท้ายแท็บกิจกรรม */
    let h = ''; formList(t).forEach((f, i) => { h += formHTML(t, f, i); });
    tabQuizSets(t).forEach(s => { h += quizHTML(s, P.quiz[s].title); });
    return h;
  }
  function exBlockHTML(b, ns) {
    const h = b.h ? `<h3>${b.h}</h3>` : '';
    if (b.type === 'quiz') return h + quizHTML(b.set, b.title);
    if (b.type === 'num') return h + numHTML(b.set, b.title);
    if (b.type === 'grid') return h + gridHTML(b.set, b.title);
    if (b.type === 'html') return h + b.html;
    if (b.type === 'fields') return `<div class="lab"><h3>${b.h || b.title || 'ข้อเขียน'}</h3><p class="small">${b.small || DEF_SMALL}</p>${fieldsHTML(b.fields)}${b.reveal ? revealHTML(b.reveal) : ''}</div>`;
    throw new Error('ex block type ไม่รู้จัก: ' + b.type);
  }
  function exFieldRows() { const o = []; (P.ex.blocks || []).forEach(b => { if (b.type === 'fields') normRows(b.fields).forEach(r => o.push(r)); }); return o; }
  function exerciseHTML(t) {
    const ex = P.ex || {}; if (!ex.blocks) return '';
    return `<h2>${t.title || ex.title || t.label}</h2>${ex.sub ? `<p class="sub">${ex.sub}</p>` : ''}${ex.note ? `<div class="notice">${ex.note}</div>` : ''}` + ex.blocks.map(b => exBlockHTML(b, 'ex')).join('') +
      (ex.export !== false ? expHTML('pex') : '') + (ex.progress ? `<div class="box"><h3>ความคืบหน้า</h3><div class="tw"><table class="tbl-sm"><thead><tr><th class="l">กิจกรรม</th><th>สถานะ</th></tr></thead><tbody id="progT"></tbody></table></div></div>` : '');
  }
  function wireExercise(t) {
    const ex = P.ex || {}; const labs = TABS.filter(x => x.kind === 'activity' && x.track !== false);
    if ($('#progT')) $('#progT').innerHTML = labs.map(a => `<tr><td class="l">${tabText(a)}</td><td>${st.done[a.id] ? '<span class="ok-t">✓ เสร็จแล้ว</span>' : 'ยังไม่เสร็จ'}</td></tr>`).join('');
    const e = ex.export || {};
    wireExp('pex', () => (e.head || ('สรุปการเรียน ' + P.short)) + '\n\n' + labs.map(a => (st.done[a.id] ? '[x] ' : '[ ] ') + tabText(a)).join('\n') + '\n' + textOf('ex', exFieldRows(), '\nข้อเขียนในแบบฝึกหัด'), e.file || 'exercise.txt');
    (ex.blocks || []).forEach(b => { if (b.type === 'quiz') wireQuiz(b.set, false, t.id); if (b.type === 'num') wireNum(b.set); if (b.type === 'grid') wireGrid(b.set); });
  }
  function panelHTML(t) {
    let body = '', err = '';
    if (t.kind === 'exercise') return exerciseHTML(t);
    if (t.kind === 'custom') { try { body = BUILD[t.id] ? BUILD[t.id][0]() : ''; } catch (e) { err = e; } return readHTML(t.id) + body + errBox(err); }
    const head = `<h2>${t.title || t.label}</h2>${t.sub ? `<p class="sub">${t.sub}</p>` : ''}`;
    const st_ = t.html ? [].concat(t.html).join('\n') : '';
    try { body = BUILD[t.id] ? BUILD[t.id][0]() : ''; } catch (e) { err = e; }
    return readHTML(t.id) + head + st_ + body + errBox(err) + (t.kind === 'activity' ? extraBlocks(t) : '');
  }
  const errBox = e => { if (!e) return ''; try { console.error(e); } catch (_) { } return '<div class="warn" role="alert">ส่วนนี้แสดงผลไม่ได้ (' + esc(e.message || e) + ')</div>'; };
  function wirePanel(t, panel) {
    if (t.kind === 'exercise') { wireDraft(panel, 'ex'); wireExercise(t); return; }
    let upd = [];
    try { BUILD[t.id] && BUILD[t.id][1](panel); } catch (e) { console.error(e); }
    if (t.kind === 'activity') {
      formList(t).forEach((f, i) => upd.push(wireForm(t, f, i)));
      tabQuizSets(t).forEach(s => wireQuiz(s, (reqs(t) || []).indexOf('quiz') >= 0, t.id));
    }
    const all = () => { upd.forEach(u => u()); /* ธง form ต่อแท็บ: ทุกฟอร์มที่ need ต้องผ่าน */ const fl = formList(t).filter(f => f.need != null); if (fl.length) { const ok = fl.every(f => formState(t, f).ok); if (ok && !st['form:' + t.id]) { st['form:' + t.id] = true; save(); } tryDone(t.id); } };
    wireDraft(panel, t.id, all); all();
  }
  function paintTabs(refocus) {
    const n = TABS.length;
    $('#tabs').innerHTML = TABS.map((t, i) => `<button class="tab" type="button" role="tab" id="tab-${qid(t.id)}" aria-controls="panel" tabindex="${i === cur ? 0 : -1}" aria-selected="${i === cur}" data-i="${i}">${tabText(t)}${st.done[t.id] ? '<span class="ck" aria-label="เสร็จแล้ว">✓</span>' : ''}</button>`).join('');
    $$('#tabs .tab').forEach(b => { b.onclick = () => select(+b.dataset.i, true); b.onkeydown = e => { const m = { ArrowRight: (cur + 1) % n, ArrowLeft: (cur + n - 1) % n, Home: 0, End: n - 1 }[e.key]; if (m !== undefined) { e.preventDefault(); select(m, true); } }; });
    if (refocus) { const tb = $('#tabs .tab[aria-selected=true]'); if (tb) { tb.focus({ preventScroll: true }); try { tb.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (_) { } } }
  }
  function paintProgress() {
    const labs = TABS.filter(t => t.kind === 'activity' && t.track !== false), n = labs.filter(t => st.done[t.id]).length, m = labs.length;
    $('#progText').textContent = 'ความคืบหน้า ' + n + ' / ' + m + ' กิจกรรม'; $('#progBar').style.width = (m ? n / m * 100 : 0) + '%'; $('#progTrack').setAttribute('aria-valuenow', n);
  }
  function select(i, refocus) {
    CLEAN.forEach(f => { try { f(); } catch (_) { } }); CLEAN.length = 0;
    cur = i; const t = TABS[i];
    $('#main').innerHTML = '<section class="panel" id="panel" role="tabpanel" aria-labelledby="tab-' + qid(t.id) + '">' + panelHTML(t) + '<div class="btns"><button class="btn alt" type="button" id="reset">เริ่มกิจกรรมนี้ใหม่ (ล้างเครื่องหมายเสร็จและแบบทดสอบ ข้อความที่เขียนยังอยู่ และคะแนนที่บันทึกไว้แล้วไม่ถูกล้าง)</button></div></section>';
    const panel = $('#panel');
    wirePanel(t, panel);
    const sk = $('#skipRead'); if (sk) sk.onclick = () => { const d = $('#labstart'); d.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' }); d.focus({ preventScroll: true }); };
    $('#reset').onclick = () => { delete st.done[t.id]; delete st.run[t.id]; delete st['form:' + t.id]; tabQuizSets(t).forEach(s => delete st.q[s]); save(); paintTabs(); paintProgress(); select(cur); };
    paintTabs(refocus);
    try { window.LabScore && window.LabScore.use(P.scoreId, P.scoreTitle); } catch (_) { } /* Q4: หลังสร้างแผงเสร็จ */
    try { history.replaceState(null, '', '#act-' + t.id); } catch (_) { }
    fitSvg(panel); tidyTables(panel);
  }
  K.select = select;

  /* ---------- hero ---------- */
  const join = a => a.length > 2 ? a.slice(0, -1).join(', ') + ' และ ' + a[a.length - 1] : a.join(' และ ');
  function featureSentence() {
    const act = TABS.filter(t => t.kind === 'activity'), s = [];
    const refs = f => { const l = TABS.filter(f).map(shortRef); return l.length === act.length && l.length > 1 && TABS.filter(f).every(t => t.kind === 'activity') ? 'ทุกแท็บกิจกรรม' : 'แท็บ ' + join(l); };
    if (act.length) s.push('หน้านี้มี ' + act.length + ' กิจกรรม (' + act.map(shortRef).join(' · ') + ')');
    const labs = TABS.filter(t => (t.kind === 'activity' || t.kind === 'custom') && BUILD[t.id]); if (labs.length) s.push(refs(t => (t.kind === 'activity' || t.kind === 'custom') && BUILD[t.id]) + ' มีแบบจำลองให้ลองเล่น');
    if (TABS.some(t => P.read && P.read[t.id])) s.push(refs(t => P.read && P.read[t.id]) + ' มีส่วน "อ่านก่อนทดลอง" ที่ผู้จัดทำหน้าเรียบเรียงใหม่');
    if (TABS.some(t => t.kind === 'activity' && formList(t).length)) s.push(refs(t => t.kind === 'activity' && formList(t).length) + ' มีแบบบันทึกหรือข้อเขียน (ไม่มีคะแนนอัตโนมัติ)');
    if (TABS.some(t => t.kind === 'activity' && tabQuizSets(t).length)) s.push(refs(t => t.kind === 'activity' && tabQuizSets(t).length) + ' มีแบบทดสอบตรวจคำตอบอัตโนมัติ');
    if (TABS.some(t => t.kind === 'summary')) s.push('มีแท็บสรุปเนื้อหา');
    if (TABS.some(t => t.kind === 'exercise')) { const bl = (P.ex && P.ex.blocks) || [], hasF = bl.some(b => b.type === 'fields'), hasS = bl.some(b => b.type !== 'fields' && b.type !== 'html'); s.push('มีแท็บแบบฝึกหัด' + (hasS ? ' (ตรวจอัตโนมัติ' + (hasF ? ' และมีข้อเขียน' : '') + ')' : hasF ? ' (ข้อเขียน)' : '')); }
    return s.length ? s.join(' · ') + '' : '';
  }
  const HONESTY = '<b>งานเขียนของนักเรียน:</b> ข้อความที่พิมพ์ในช่องเปิดจะบันทึกในเครื่องนี้อัตโนมัติ และ<b>ถูกส่งให้ครูเมื่อกดปุ่มส่งในแผงส่งผลท้ายหน้า เฉพาะช่องเขียนในแท็บที่เปิดอยู่ตอนกดส่ง</b> (ถ้าเขียนไว้หลายแท็บ ให้ส่งทีละแท็บ แท็บที่ไม่ได้เปิดตอนกดส่งจะยังอยู่ในเครื่องนี้เท่านั้น ยังไม่ถูกส่ง) ข้อเขียนไม่มีคะแนนอัตโนมัติ มีคะแนนเฉพาะแบบทดสอบและแบบฝึกหัดที่มีเฉลย';
  function hasFreeText() {
    if (P.hero && P.hero.freeText) return true;
    if (TABS.some(t => t.kind === 'activity' && formList(t).length)) return true;
    return !!(P.ex && (P.ex.blocks || []).some(b => b.type === 'fields'));
  }
  function heroHTML() {
    const h = P.hero || {}, nt = [].concat(h.notice || []).join('<br>'), feat = featureSentence();
    return `<div class="wrap"><nav class="top"><a class="brand" href="index.html"><span class="mark" aria-hidden="true">⚗</span><span>ห้องทดลองเสมือน</span></a><a href="index.html">← สารบัญหลักสูตร</a></nav>
<header class="hero"><div class="eyebrow">${h.eyebrow || ''}</div><h1>${h.h1 || P.title}</h1>${h.lead ? `<p>${h.lead}</p>` : ''}${feat ? `<p>${feat}</p>` : ''}
<div class="progress"><span id="progText"></span><span class="track" id="progTrack" role="progressbar" aria-valuemin="0" aria-valuemax="${TABS.filter(t => t.kind === 'activity' && t.track !== false).length}" aria-valuenow="0" aria-label="ความคืบหน้า"><i id="progBar"></i></span></div>
<div class="notice">${nt}${nt && hasFreeText() ? '<br>' : ''}${hasFreeText() ? HONESTY : ''}</div></header>
<div class="tabs" role="tablist" id="tabs" aria-label="${esc(P.tabsLabel || 'กิจกรรมในหน้านี้')}"></div><main id="main"></main>
<footer class="footer">${P.footer || ''}</footer></div>`;
  }

  /* ---------- เริ่มทำงาน ---------- */
  K.start = function (page) {
    P = K.PAGE = page; KEY = P.id + '-v1'; DK = P.id + '-drafts-v1'; loadState();
    TABS = P.tabs.map(t => Object.assign({}, t));
    Object.keys(P.quiz || {}).forEach(id => { QS[id] = prepQuiz(id, P.quiz[id]); });
    Object.keys(P.num || {}).forEach(id => { NUMS[id] = P.num[id]; });
    Object.keys(P.grid || {}).forEach(id => { GRIDS[id] = P.grid[id]; });
    const host = $('#kit-root') || document.body; host.innerHTML = heroHTML();
    /* ชื่อ global เดียวกับหน้าเดิม เพื่อให้ชุดตรวจ tools/qa (อ่าน ACTS/LABS/select/QUIZ/readHTML) ใช้กับหน้าที่สร้างด้วย kit ได้ */
    Object.assign(window, { ACTS: TABS.map(t => t.id), LABS: TABS.filter(t => t.kind === 'activity' && t.track !== false).map(t => t.id), select: select, readHTML: readHTML, qid: qid,
      QUIZ: Object.keys(QS).reduce((o, k) => { o[k] = QS[k].items; return o; }, {}) });
    paintProgress();
    const m = (location.hash.match(/^#act-(.+)$/) || [])[1]; let ix = 0;
    if (m) { const d = decodeURIComponent(m); const j = TABS.findIndex(t => t.id === d); if (j >= 0) ix = j; }
    select(ix);
    window.addEventListener('hashchange', () => { const mm = (location.hash.match(/^#act-(.+)$/) || [])[1]; if (!mm) return; const j = TABS.findIndex(t => t.id === decodeURIComponent(mm)); if (j >= 0 && j !== cur) select(j); });
    let rz = null; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { fitSvg($('#main')); tidyTables($('#main')); }, 120); });
    try { new MutationObserver(ms => { if (ms.some(x => Array.from(x.addedNodes).some(n => n.nodeType === 1))) { clearTimeout(rz); rz = setTimeout(() => { fitSvg($('#main')); tidyTables($('#main')); }, 60); } }).observe($('#main'), { childList: true, subtree: true }); } catch (_) { }
    if (usedFields && !hasFreeText()) try { console.warn('pagekit: ใช้ K.fieldsHTML แต่ hero.freeText ไม่เป็น true หมายเหตุข้อเขียนจะไม่แสดง'); } catch (_) { }
  };
})();
