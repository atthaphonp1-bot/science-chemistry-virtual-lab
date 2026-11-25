#!/usr/bin/env node
// QA harness for the static Thai lab pages.  Usage: node tools/qa/qa_page.mjs <page.html> [--json] [--port N]
//   --only LOAD,TABS,...   run only these checks        --codegs <path>  Code.gs to compare ids against
//   --verbose              print PASS evidence too       --keep-going is the default; exit code 1 if any FAIL.
// No npm dependencies: Node >= 22 (global WebSocket + fetch) and Google Chrome.
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launchChrome, connect, sleep, runCleanups } from './lib/cdp.mjs';
import { periodicRun, longestRun, histogram, contrast, blend, lintCss, styleBlocks, parseIds, loadAllow, parsePoints } from './lib/helpers.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = n => argv.includes(n);
const opt = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const pageArg = argv.find((a, i) => !a.startsWith('--') && !['--port', '--only', '--codegs'].includes(argv[i - 1]));
if (!pageArg) { console.error('usage: qa_page.mjs <page.html> [--json] [--port N] [--only CHECK,..] [--codegs path] [--verbose]'); process.exit(2); }
const PAGE = resolve(pageArg);
if (!existsSync(PAGE)) { console.error('no such file: ' + PAGE); process.exit(2); }
const JSON_OUT = flag('--json'), VERBOSE = flag('--verbose');
const ONLY = opt('--only') ? new Set(opt('--only').toUpperCase().split(',')) : null;
const CODEGS = opt('--codegs') ? resolve(opt('--codegs')) : resolve(HERE, '../apps_script/Code.gs');
const ALLOW = loadAllow(resolve(HERE, 'allow.json'));
const T0 = Date.now();
const SOFT_MS = +(process.env.QA_SOFT_MS || 92000);
const log = (...a) => { if (!JSON_OUT && VERBOSE) console.error(...a); };

const R = [];
const add = (check, status, msg, evidence) => R.push({ check, status, msg, ...(evidence !== undefined ? { evidence } : {}) });
const worst = (...s) => s.includes('FAIL') ? 'FAIL' : s.includes('WARN') ? 'WARN' : s.includes('SKIP') && !s.includes('PASS') ? 'SKIP' : 'PASS';

let c = null, info = null, navN = 0;
const BASE = pathToFileURL(PAGE).href;
const DRIVER = readFileSync(resolve(HERE, 'lib/driver.js'), 'utf8');
const Q = (fn, ...a) => c.ev(`__qa.${fn}(${a.map(x => JSON.stringify(x === undefined ? null : x)).join(',')})`);

async function nav(hash = '', settle = 260) {
  const p = c.once('Page.loadEventFired', 30000).catch(() => null);
  await c.send('Page.navigate', { url: `${BASE}?qa=${++navN}${hash}` });
  if (!(await p)) { for (let i = 0; i < 30; i++) { try { if ((await c.ev('document.readyState', 5000)) === 'complete') break; } catch (_) { } await sleep(500); } }
  await sleep(settle);
}
const CLEAR = 'try{localStorage.clear();sessionStorage.clear()}catch(e){}';
async function fresh(hash = '', reload = false) {   // reload=true: clear storage THEN load, so the page starts from a pristine state
  if (reload) { await nav('', 150); await c.ev(CLEAR); await nav(hash); }
  else { await nav(hash); await c.ev(CLEAR); }
}
async function setWidth(w, h = 900) {
  if (!w) { await c.send('Emulation.clearDeviceMetricsOverride'); return; }
  await c.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 500 });
}
/** visit every view (and, for the chapters layout, every inner tab) */
async function eachView(fn, { subs = false, settle = 110 } = {}) {
  for (const v of info.views) {
    const subList = (subs && info.kind === 'chapters') ? ['learn', 'quiz', 'lab'] : [null];
    for (const s of subList) {
      await Q('open', v.i); if (s) await Q('setTab', s);
      await sleep(settle);
      await fn(v, s);
    }
  }
}
const tag = (v, s) => v.id + (s ? '/' + s : '');
const errsTxt = es => es.map(e => `${e.kind}: ${e.text}`).slice(0, 4).join(' | ');
const ignoreErr = e => /favicon/i.test(e.text) || (ALLOW.console || []).some(p => { try { return new RegExp(p, 'i').test(e.text); } catch (_) { return false; } });
const realErrs = m => c.since(m).filter(e => !ignoreErr(e));

/* ================= 1. LOAD ================= */
async function checkLoad() {
  const m = c.mark();
  await fresh('', true);
  await sleep(300);
  const es = realErrs(m);
  if (es.length) add('LOAD', 'FAIL', `${es.length} uncaught exception(s)/console error(s) during load`, errsTxt(es));
  else add('LOAD', 'PASS', 'no uncaught exceptions / console errors');
  info = await Q('info');
  if (!info) throw new Error('driver not injected');
  add('LOAD', 'PASS',
    `layout=${info.kind}; views=${info.views.map(v => v.id).join(',')}; tabs=${info.nTabs}; LabScore=${info.hasLabScore}; QUIZ=${info.hasQUIZ}; readHTML=${info.hasReadHTML}`);
}

/* ================= 2. TABS ================= */
async function checkTabs() {
  if (!info.views.length || info.kind === 'single') { add('TABS', 'SKIP', 'single-page layout: no tab switcher (ACTS/select or lessons/selectChapter not found)'); return; }
  const hashes = {};
  for (const v of info.views) {
    const m = c.mark(); const probs = [], warns = [];
    const hash = await Q('open', v.i); await sleep(130);
    hashes[v.id] = hash;
    const st = await Q('panelState', ALLOW.text);
    const errs = realErrs(m);
    if (st.len < 40 || st.kids < 1) probs.push(`panel empty (len=${st.len})`);
    if (st.bad.length) probs.push('bad text ' + st.bad.join(' ; '));
    if (errs.length) probs.push('errors: ' + errsTxt(errs));
    // reading block
    let rdTxt = '';
    if (info.hasReadHTML) {
      rdTxt = ` rd=${st.rd}`;
      if (st.rd > 1) probs.push(`${st.rd} reading blocks (expected exactly 1)`);
      else if (st.rd === 0 && v.activity) warns.push('no reading block on an activity tab');
    }
    add('TABS', probs.length ? 'FAIL' : warns.length ? 'WARN' : 'PASS', `select(): ${v.id}${rdTxt}`, probs.concat(warns).join(' ; ') || undefined);
  }
  // deep links (full page load per hash)
  for (const v of info.views) {
    const hash = hashes[v.id];
    if (!hash) { add('TABS', 'SKIP', `deep link ${v.id}: page sets no location.hash`); continue; }
    const m = c.mark();
    await nav(hash);
    const i2 = await Q('info'); const st = await Q('panelState', ALLOW.text); const errs = realErrs(m);
    const probs = [];
    let landed;
    if (info.kind === 'acts') { landed = i2.selectedTab; if (landed !== v.i) probs.push(`${hash} selected tab #${landed}, expected #${v.i}`); }
    else landed = '?';
    if (st.len < 40) probs.push('panel empty');
    if (st.bad.length) probs.push('bad text ' + st.bad.join(' ; '));
    if (errs.length) probs.push('errors: ' + errsTxt(errs));
    add('TABS', probs.length ? (info.kind === 'acts' ? 'FAIL' : 'WARN') : 'PASS', `deep link ${hash}`, probs.join(' ; ') || undefined);
  }
}

/* ================= 3. OVERFLOW ================= */
async function checkOverflow() {
  const per = { 320: [], 375: [], 1280: [] };
  for (const w of [320, 375, 1280]) {
    await setWidth(w); await nav(''); await sleep(100);
    await eachView(async (v, s) => { const o = await Q('overflow'); per[w].push({ tag: tag(v, s), o }); }, { subs: true, settle: 140 });
  }
  await setWidth(0);
  for (const w of [320, 375, 1280]) {
    const bad = per[w].filter(x => x.o.sw > x.o.cw + 1), clip = per[w].filter(x => x.o.sw <= x.o.cw + 1 && x.o.offenders.length);
    if (bad.length) add('OVERFLOW', 'FAIL', `width ${w}: horizontal page scroll on ${bad.length}/${per[w].length} view(s)`,
      bad.slice(0, 4).map(x => `${x.tag}: scrollWidth ${x.o.sw} > ${x.o.cw}; ${x.o.offenders.slice(0, 3).join(', ')}`).join(' | '));
    else if (clip.length) add('OVERFLOW', 'WARN', `width ${w}: no page scroll but ${clip.length} view(s) have elements beyond the viewport outside scroll containers (clipped?)`,
      clip.slice(0, 4).map(x => `${x.tag}: ${x.o.offenders.slice(0, 3).join(', ')}`).join(' | '));
    else add('OVERFLOW', 'PASS', `width ${w}: no horizontal overflow in ${per[w].length} view(s)`);
  }
  // wide table / svg hidden inside horizontal scroller (375)
  const hid = [];
  for (const w of [375]) per[w].forEach(x => x.o.hidden.forEach(h => { if (h.hiddenFrac > 0.4) hid.push(`${x.tag}: ${h.what} in ${h.el} shows ${Math.round((1 - h.hiddenFrac) * 100)}% (scrollWidth ${h.sw} / clientWidth ${h.cw})`); }));
  const hidU = [...new Set(hid)];
  add('OVERFLOW', hidU.length ? 'WARN' : 'PASS', hidU.length ? `${hidU.length} table/svg scroller(s) hide >40% of content at 375px` : 'no table/svg hides >40% of its content at 375px', hidU.slice(0, 6).join(' | ') || undefined);
  // over-scaled svg (1280)
  const os = [];
  per[1280].forEach(x => x.o.overscaled.forEach(s => { if (s.scale > 2.2) os.push(`${x.tag}: ${s.el} viewBox ${s.vbw} drawn ${s.w}px = x${s.scale}`); }));
  const osU = [...new Set(os)];
  add('OVERFLOW', osU.length ? 'WARN' : 'PASS', osU.length ? `${osU.length} SVG(s) scaled >2.2x their viewBox at 1280px` : 'no SVG scaled >2.2x at 1280px', osU.slice(0, 6).join(' | ') || undefined);
  // tiny svg text (375)
  const sm = [];
  per[375].forEach(x => { const s = x.o.small; if (s && s.n) sm.push(`${x.tag}: ${s.n}/${s.total} <10.5px (min ${s.min}px e.g. "${s.sample[0].t}" ${s.sample[0].px}px)`); });
  add('OVERFLOW', sm.length ? 'WARN' : 'PASS', sm.length ? `SVG text under 10.5px rendered at 375px in ${sm.length} view(s)` : 'SVG text >= 10.5px at 375px', sm.slice(0, 6).join(' | ') || undefined);
}

/* ================= 4. KEYBOARD ================= */
const KEYS = { ArrowRight: 39, ArrowLeft: 37, Home: 36, End: 35 };
async function press(key) {
  const o = { key, code: key, windowsVirtualKeyCode: KEYS[key], nativeVirtualKeyCode: KEYS[key] };
  await c.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...o });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...o });
  await sleep(220);
}
async function checkKeyboard() {
  await setWidth(1280); await fresh('');
  let t = await Q('tabs');
  if (!t.n) { add('KEYBOARD', 'SKIP', 'no [role=tab] elements on this page'); return; }
  const probs = [];
  if (t.zero !== 1) probs.push(`${t.zero} tabs with tabindex=0 (expected exactly 1)`);
  await Q('focusSelectedTab'); await sleep(100);
  const n = t.n, seq = [['End', n - 1], ['ArrowRight', 0], ['ArrowLeft', n - 1], ['Home', 0], ['ArrowRight', 1 % n], ['ArrowLeft', 0]];
  let outline = null, lost = 0;
  for (const [k, exp] of seq) {
    await press(k); t = await Q('tabs');
    if (t.sel !== exp) probs.push(`${k}: selected #${t.sel}, expected #${exp}`);
    if (t.active !== t.sel) lost++;
    if (t.zero !== 1) probs.push(`${k}: ${t.zero} tabs with tabindex=0`);
    outline = t.outline;
  }
  if (lost) probs.push(`keyboard focus not on the selected tab after ${lost} key press(es)`);
  const visible = outline && ((outline.w > 0 && outline.style !== 'none') || (outline.shadow && outline.shadow !== 'none'));
  if (!visible) probs.push(`focused tab has no visible outline/box-shadow (${JSON.stringify(outline)})`);
  add('KEYBOARD', probs.length ? (info.kind === 'acts' ? 'FAIL' : 'WARN') : 'PASS', `${n} tabs${info.kind === 'acts' ? '' : ' (inner tabs of a non-ACTS layout, best-effort)'}: Arrow/Home/End + wraparound + roving tabindex + focus ring`, [...new Set(probs)].join(' ; ') || undefined);
}

/* ================= 5. QUIZZES ================= */
const sc = r => { // best score reading for a check press
  const fromRes = parsePoints(r.res), fromLs = r.ls && r.ls.max > 0 ? r.ls : null;
  return { got: fromLs ? fromLs.got : fromRes ? fromRes.got : null, max: fromLs ? fromLs.max : fromRes ? fromRes.max : null, res: fromRes, ls: fromLs };
};
async function runCheck(b, mode, wait) {
  await Q('clearScore');
  if (b.type === 'radio') await Q('answer', b.n, mode, b.keys);
  else await Q('blankOther', b.n);
  const m = c.mark();
  await Q('press', b.n); await sleep(wait ?? (mode === 'wrong' ? 300 : 130));
  const r = await Q('readBlock', b.n, mode === 'wrong' ? b.keys : null);
  return { r, errs: realErrs(m), s: sc(r) };
}
const keySets = [];
async function checkQuiz() {
  await setWidth(1280); await fresh('');
  let nRadio = 0, nOther = 0;
  const seenAct = new Set();
  await eachView(async (v, s) => {
    if (info.kind === 'chapters') await Q('setTab', 'quiz');
    const blocks = await Q('blocks');
    for (const b of blocks) {
      const name = `${tag(v, null)}/${b.id}`;
      if (b.type === 'other') {
        nOther++;
        const x = await runCheck(b, 'blank');
        const probs = [];
        if (x.errs.length) probs.push('exception on blank check: ' + errsTxt(x.errs));
        if (x.s.got !== null && x.s.got !== 0) probs.push(`blank check scored ${x.s.got}/${x.s.max} (expected 0)`);
        add('QUIZ', probs.length ? 'FAIL' : 'PASS', `exercise block ${name}: blank check -> ${x.s.got === null ? 'n/a' : x.s.got + '/' + x.s.max}${probs.length ? '' : ' (answer keys need human check)'}`, probs.join(' ; ') || undefined);
        continue;
      }
      nRadio++;
      const probs = [], notes = [], warns = [];
      if (b.mismatch) warns.push(b.mismatch);
      if (!b.keys) {
        const x = await runCheck(b, 'first');
        if (x.r.hlFail.length) probs.push('option highlighting after check: ' + x.r.hlFail.slice(0, 3).join(', '));
        if (x.r.hlWarn.length) warns.push('good/wrong classes on non-option element(s): ' + x.r.hlWarn.slice(0, 3).join(', '));
        add('QUIZ', probs.length ? 'FAIL' : warns.length ? 'WARN' : 'SKIP', `quiz ${name}: answer key not exposed to the harness; only highlight check ran`, probs.concat(warns).join(' ; ') || undefined);
        continue;
      }
      const nq = b.nq, res = {};
      for (const mode of ['blank', 'wrong', 'right']) {
        const x = await runCheck(b, mode); res[mode] = x;
        const exp = mode === 'right' ? nq : 0;
        if (x.errs.length) probs.push(`${mode}: exception ${errsTxt(x.errs)}`);
        if (x.s.got === null) warns.push(`${mode}: cannot read score (res="${x.r.res.slice(0, 40)}")`);
        else if (x.s.got !== exp) probs.push(`${mode}: scored ${x.s.got}/${x.s.max}, expected ${exp}/${nq}`);
        if (x.s.max !== null && x.s.max !== nq) probs.push(`${mode}: max ${x.s.max} != ${nq} questions`);
        if (x.s.res && x.s.ls && x.s.res.got !== x.s.ls.got && mode !== 'blank') probs.push(`${mode}: displayed ${x.s.res.got} != LabScore ${x.s.ls.got}`);
        if (mode !== 'blank') {
          if (x.r.hlFail.length) probs.push(`${mode}: option highlighting (${x.r.hlFail.slice(0, 3).join(', ')})`);
          if (x.r.hlWarn.length) warns.push(`${mode}: good/wrong class on non-option element (${x.r.hlWarn.slice(0, 2).join(', ')})`);
          if (x.r.sigDiff.length) probs.push(`${mode}: correct option styled differently from other unchosen options in q${x.r.sigDiff.join(',q')}`);
          if (x.r.whyTot === 0) probs.push(`${mode}: no explanation element (.why)`);
          else if (x.r.whyVis === 0) probs.push(`${mode}: explanation not visible after check`);
          else if (x.r.whyVis < nq) warns.push(`${mode}: only ${x.r.whyVis}/${nq} explanations visible`);
        }
        notes.push(`${mode}=${x.s.got}/${x.s.max}`);
      }
      add('QUIZ', probs.length ? 'FAIL' : warns.length ? 'WARN' : 'PASS', `quiz ${name} (${nq} q): ${notes.join(' ')}`, probs.concat(warns).join(' ; ') || undefined);
      if (b.act && !seenAct.has(b.act)) { seenAct.add(b.act); keySets.push({ act: b.act, keys: b.keys, optLens: b.optLens, nopt: b.nopt }); }
    }
  }, { subs: false, settle: 120 });
  if (!nRadio && !nOther) add('QUIZ', 'SKIP', 'no quiz / check blocks found on any tab');
  // answer-key analysis per set
  const all = [];
  for (const k of keySets) {
    const n = k.keys.length, probs = [], warns = [];
    const h = histogram(k.keys, Math.max(...k.nopt));
    if (n >= 4 && new Set(k.keys).size === 1) probs.push(`all ${n} keys are ${k.keys[0]}`);
    if (n >= 5 && Math.max(...h) / n > 0.6) warns.push(`${Math.round(Math.max(...h) / n * 100)}% of keys at position ${h.indexOf(Math.max(...h))}`);
    const per = n >= 6 ? periodicRun(k.keys) : null;
    if (per) warns.push(`periodic keys: period ${per.period} [${per.block}] repeated x${Math.floor(per.length / per.period)} from q${per.start + 1}`);
    const run = longestRun(k.keys);
    if (n >= 5 && run.len > 3 && new Set(k.keys).size > 1) warns.push(`key ${run.key} repeated ${run.len}x in a row from q${run.start + 1}`);
    if (n >= 5 && k.optLens) {
      let strict = 0;
      k.keys.forEach((a, i) => { const L = k.optLens[i], mx = Math.max(...L); if (L[a] === mx && L.filter(x => x === mx).length === 1) strict++; });
      if (strict / n > 0.65) warns.push(`correct option is strictly the longest in ${strict}/${n} questions`);
    }
    k.keys.forEach(x => all.push(x));
    add('QUIZ', probs.length ? 'FAIL' : warns.length ? 'WARN' : 'PASS', `answer keys [${k.act}] n=${n}: ${k.keys.join('')} hist=${h.join('/')}`, probs.concat(warns).join(' ; ') || undefined);
  }
  if (all.length >= 8) {
    const h = histogram(all), mx = Math.max(...h);
    add('QUIZ', mx / all.length > 0.6 ? 'WARN' : 'PASS', `answer keys across page (n=${all.length}) hist=${h.join('/')}`, mx / all.length > 0.6 ? `${Math.round(mx / all.length * 100)}% share position ${h.indexOf(mx)}` : undefined);
  }
}

/* ================= 6. SCORING ================= */
async function checkScoring() {
  const probs = [], warns = [];
  const sub = info.submit;
  await fresh('');
  const pairs = new Map();
  await eachView(async () => { }, { settle: 120 });
  const calls = await c.ev('JSON.stringify(__qa.calls)').then(JSON.parse);
  const used = [...new Map(calls.use.map(u => [u.id + '\u0000' + u.title, u])).values()];
  if (info.kind !== 'chapters') {
    if (!sub) probs.push('window.__LAB_SUBMIT__ missing');
    else {
      if (!sub.id || !sub.id.trim()) probs.push('__LAB_SUBMIT__.id empty');
      if (!sub.title || !sub.title.trim()) probs.push('__LAB_SUBMIT__.title empty');
      if (!sub.url) warns.push('__LAB_SUBMIT__.url empty (score panel will not show)');
    }
    if (info.kind === 'acts' && !used.length) probs.push('select() never called LabScore.use');
    for (const u of used) if (sub && (u.id !== sub.id || u.title !== sub.title)) probs.push(`LabScore.use("${u.id}","${u.title}") != __LAB_SUBMIT__ ("${sub.id}","${sub.title}")`);
    if (sub) pairs.set(sub.id, sub.title);
  } else {
    if (!used.length) probs.push('selectChapter never called LabScore.use');
    for (const u of used) { pairs.set(u.id, u.title); if (!u.id || !u.title) probs.push('LabScore.use called with empty id/title'); }
  }
  // Code.gs
  let gs = null;
  try { gs = parseIds(readFileSync(CODEGS, 'utf8')); } catch (_) {}
  if (!gs) warns.push(`cannot parse ids block in ${CODEGS}`);
  else {
    for (const [id, title] of pairs) {
      if (!gs.has(id)) probs.push(`id "${id}" not in Code.gs ACTIVITIES`);
      else if (gs.get(id) !== title) probs.push(`title mismatch for "${id}": page "${title}" vs Code.gs "${gs.get(id)}"` + (gs.get(id).normalize() === title.normalize() ? ' (differs only by Unicode normalisation)' : ''));
    }
  }
  add('SCORING', probs.length ? 'FAIL' : warns.length ? 'WARN' : 'PASS',
    `submit id/title: ${[...pairs.keys()].slice(0, 3).join(' | ')}${pairs.size > 3 ? ' ...' : ''} (${pairs.size} pair(s), ${used.length} distinct use() pair(s); Code.gs ${gs ? gs.size + ' ids' : 'n/a'})`, probs.concat(warns).join(' ; ') || undefined);

  // all-right pass over every radio quiz
  await fresh('');
  await Q('clearScore');
  let answered = 0; const quizParts = new Map();
  await eachView(async v => {
    if (info.kind === 'chapters') await Q('setTab', 'quiz');
    for (const b of await Q('blocks')) if (b.type === 'radio' && b.keys) {
      await Q('answer', b.n, 'right', b.keys);
      const n0 = await Q('setLen'); await Q('press', b.n); answered++; await sleep(50);
      (await Q('setSince', n0)).forEach(x => quizParts.set(String(x.name).slice(0, 40), x));
    }
  }, { settle: 100 });
  await sleep(200);
  const s = await Q('score'); const ls = await Q('lsScoreText');
  const calls2 = await c.ev('JSON.stringify(__qa.calls)').then(JSON.parse);
  const p2 = [], w2 = [];
  if (!s) { add('SCORING', 'WARN', 'LabScore.get() unavailable'); return; }
  const names = Object.keys(s.parts);
  if (names.length > 20) p2.push(`${names.length} parts (> 20)`);
  calls2.set.forEach(x => {
    if (String(x.name).length > 40) p2.push(`part name > 40 chars (truncated, may collide): "${String(x.name).slice(0, 50)}..."`);
    if (!(x.max > 0) || x.max > 100) p2.push(`LabScore.set("${String(x.name).slice(0, 30)}", ${x.got}, ${x.max}) silently ignored (max must be 1..100)`);
    if (!(x.got >= 0 && x.got <= x.max)) w2.push(`LabScore.set("${String(x.name).slice(0, 30)}", got=${x.got} outside 0..${x.max}`);
  });
  if (answered && names.length === 0) p2.push('answered every quiz correctly but LabScore has no parts');
  // every part written by a quiz press must be full marks (parts written by other widgets - e.g. a lab result opened at 0/1 - are reported, not judged)
  const notFull = [...quizParts.keys()].filter(k => s.parts[k] && s.parts[k].split('/')[0] !== s.parts[k].split('/')[1]);
  if (notFull.length) p2.push(`after all-right, quiz part(s) not full: ${notFull.map(k => k + ' ' + s.parts[k]).join(', ')}`);
  const other = names.filter(k => !quizParts.has(k)).map(k => k + ' ' + s.parts[k]);
  if (ls === null) w2.push('no #lsScore panel (no submit url) - score text not checked');
  else if (names.length) {
    const m = ls.match(/(\d+)\s*\/\s*(\d+)/);
    if (!m) p2.push(`#lsScore text has no total: "${ls.slice(0, 60)}"`);
    else if (+m[1] !== s.got || +m[2] !== s.max) p2.push(`#lsScore shows ${m[1]}/${m[2]} but LabScore.get() is ${s.got}/${s.max}`);
  }
  if (!answered) { add('SCORING', 'SKIP', 'no radio quiz with a readable answer key: all-right scoring pass not run', p2.concat(w2).join(' ; ') || undefined); return; }
  add('SCORING', p2.length ? 'FAIL' : w2.length ? 'WARN' : 'PASS',
    `after all-right on ${answered} quiz block(s): total ${s.got}/${s.max}, ${names.length} parts (names<=40, max<=100, parts<=20), #lsScore="${ls ? ls.slice(0, 40) : 'n/a'}"`,
    p2.concat(w2).concat(other.length ? ['non-quiz parts present: ' + other.slice(0, 4).join(', ')] : []).join(' ; ') || undefined);
}

/* ================= 7. FREE-TEXT HONESTY ================= */
async function checkFreeText() {
  await setWidth(1280); await fresh('');
  const withFields = [];
  const claims = []; const copyTried = [];
  await eachView(async (v) => {
    const f = await Q('fields');
    if (f.length) withFields.push({ v, f });
    (await Q('claims')).forEach(x => { if (!x.caveat) claims.push(`${v.id}: "${x.text}"`); });
    if ((await Q('copyButtons')).length) { await Q('clickCopy'); copyTried.push(v.id); await sleep(150); }
  }, { settle: 120 });
  // fallback textareas
  const flags = await Q('taFlags'); const tas = await Q('allTextareas');
  const live = tas.filter(t => t.ro || t.hid);
  const fprobs = [];
  if (live.length) fprobs.push(`${live.length} readonly/aria-hidden textarea(s) in DOM now (submitted with the answers): ${JSON.stringify(live.slice(0, 3))}`);
  const transient = flags.filter(x => !x.connected);
  const connectedFlags = flags.filter(x => x.connected && !live.some(l => l.id === x.id && l.id));
  if (connectedFlags.length && !live.length) fprobs.push(`${connectedFlags.length} readonly/offscreen textarea(s) were inserted and are still connected`);
  add('FREETEXT', fprobs.length ? 'FAIL' : transient.length ? 'WARN' : 'PASS',
    `readonly / clipboard-fallback textareas${copyTried.length ? ` (clicked copy buttons on ${copyTried.join(',')})` : ''}`,
    fprobs.join(' ; ') || (transient.length ? `${transient.length} transient fallback textarea(s) inserted then removed (ok unless submit happens at that moment)` : undefined));
  add('FREETEXT', claims.length ? 'WARN' : 'PASS', claims.length ? `"stays only on this device" claim without a submit caveat nearby (${claims.length})` : 'no unqualified "only on this device" claims', claims.slice(0, 4).join(' | ') || undefined);

  if (!withFields.length) { add('FREETEXT', 'SKIP', 'no textarea / text input on any tab'); return; }
  const wp = await Q('writtenPanel');
  for (const { v, f } of withFields.slice(0, 6)) {
    const probs = [], notes = [];
    await Q('open', v.i); await sleep(150);
    const before = await Q('score');
    await Q('typeInto', 0, 'QA ข้อความทดสอบ ' + v.id); await sleep(150);
    const w = await Q('written'), p = await Q('writtenPanel'), after = await Q('score');
    if (p && w !== null && p.n !== w) probs.push(`after typing: #lsWritten says ${p.n} but written() has ${w}`);
    if (before && after && (before.max !== after.max || before.got !== after.got)) probs.push(`typing changed the score ${before.got}/${before.max} -> ${after.got}/${after.max} (free text must not be scored)`);
    notes.push(`typed: written()=${w} panel=${p ? p.n : 'n/a'}`);
    const other = info.views.find(x => x.i !== v.i && !withFields.some(y => y.v.i === x.i)) || info.views.find(x => x.i !== v.i);
    if (other) {
      await Q('open', other.i); await sleep(200);
      const w2 = await Q('written'), p2 = await Q('writtenPanel');
      if (p2 && w2 !== null && p2.n !== w2) probs.push(`stale counter after switching to ${other.id}: #lsWritten=${p2.n} but written()=${w2}`);
      notes.push(`switched to ${other.id}: written()=${w2} panel=${p2 ? p2.n : 'n/a'}`);
    }
    add('FREETEXT', probs.length ? 'FAIL' : 'PASS', `tab ${v.id} (${f.length} field(s)): ${notes.join('; ')}`, probs.join(' ; ') || undefined);
  }
  if (!wp) add('FREETEXT', 'SKIP', '#lsWritten panel not present (no submit url): counter checks limited to written()');
}

/* ================= 8. ANIMATIONS ================= */
function rng(seed) { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }
async function checkAnim() {
  await setWidth(1280); await fresh('');
  const n = info.views.length;
  if (n < 1) { add('ANIM', 'SKIP', 'no views'); return; }
  const r = rng(12345); let clicks = 0; const trail = [];
  const m = c.mark();
  for (let k = 0; k < 30; k++) {
    const i = Math.floor(r() * n);
    if (info.nTabs > 0 && info.kind === 'acts') await c.ev(`(()=>{const t=[...document.querySelectorAll('[role=tab]')][${i}];t&&t.click()})()`);
    else await Q('open', i);
    const labs = await Q('clickGo', 3); clicks += labs.length; trail.push(info.views[i].id + (labs.length ? '[' + labs.join(',') + ']' : ''));
    await sleep(30 + Math.floor(r() * 50));
  }
  await sleep(500);
  const es = realErrs(m);
  const st = await Q('panelState', ALLOW.text);
  add('ANIM', es.length || (info.kind !== 'single' && st.len < 40) ? 'FAIL' : 'PASS', `30 rapid tab switches (random order) + ${clicks} start/play/heat button click(s)`, es.length ? errsTxt(es) + ' || last actions: ' + trail.slice(-6).join(' > ') : (info.kind !== 'single' && st.len < 40) ? 'panel empty after the storm' : undefined);
  // prefers-reduced-motion
  await c.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await nav('');
  const bad = [];
  await eachView(async (v) => {
    await Q('clickGo', 3); await sleep(450);
    const a = await Q('anims');
    if (a.css.length) bad.push(`${v.id}: ${a.css.join(', ')}`);
  }, { settle: 150 });
  await c.send('Emulation.setEmulatedMedia', { features: [] });
  add('ANIM', bad.length ? 'WARN' : 'PASS', bad.length ? `CSS animations still running with prefers-reduced-motion: reduce (${bad.length} tab(s))` : 'no running CSS animations under prefers-reduced-motion: reduce', bad.slice(0, 5).join(' | ') || undefined);
}

/* ================= 9. DRAFTS ================= */
async function checkDrafts() {
  await setWidth(1280); await fresh('');
  let target = null, anyField = null;
  for (const v of info.views) {
    await Q('open', v.i); await sleep(100);
    const f = await Q('fields');
    if (f.length && !anyField) anyField = { v, f };
    const k = f.findIndex(x => x.claim);
    if (k >= 0) { target = { v, f, k }; break; }
  }
  if (!target) { add('DRAFTS', 'SKIP', anyField ? 'textareas exist but none sits next to a "saved on this device" promise: not draft-bound' : 'no draft fields (textarea) on any tab'); return; }
  let val = '', got = null, tries = 0;
  for (; tries < 2 && got !== val; tries++) {          // one retry: a slow machine can reload before the page finished wiring drafts
    await Q('open', target.v.i); await sleep(150);
    val = 'QA-draft-' + Date.now();
    await Q('typeInto', target.k, val); await sleep(800);
    const hash = await c.ev('location.hash');
    await nav(hash || '', 500);
    await Q('open', target.v.i); await sleep(250);
    got = await Q('readField', target.k, target.f[target.k].sel || null);
  }
  add('DRAFTS', got === val ? 'PASS' : 'FAIL', `draft in tab ${target.v.id} (field ${target.f[target.k].id || '#' + target.k}, page promises on-device saving) ${got === val ? 'survives reload' : 'lost after reload'}`, got === val ? undefined : `typed "${val}", after reload "${got}" (2 attempts)`);
}

/* ================= 10. CSS SANITY ================= */
async function checkCss() {
  const html = readFileSync(PAGE, 'utf8');
  const blocks = styleBlocks(html); const frags = []; const kfs = []; let unb = [];
  blocks.forEach((b, bi) => {
    const L = lintCss(b.css);
    L.fragments.forEach(f => frags.push(`style#${bi + 1} line ${f.line}: ${f.text} (${f.why})`));
    if (L.unbalanced) unb.push(`style#${bi + 1}: ${L.unbalanced}`);
    L.keyframes.forEach(k => kfs.push(k));
  });
  add('CSS', frags.length || unb.length ? 'FAIL' : 'PASS', `${blocks.length} <style> block(s): ${frags.length ? frags.length + ' selector-less fragment(s)' : 'no selector-less declaration fragments'}${unb.length ? '; unbalanced braces' : ''}`, frags.concat(unb).slice(0, 6).join(' | ') || undefined);
  const unused = [...new Set(kfs)].filter(k => (html.match(new RegExp('(?<![\\w-])' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\w-])', 'g')) || []).length < 2);
  add('CSS', unused.length ? 'WARN' : 'PASS', unused.length ? `${unused.length} @keyframes never referenced` : (new Set(kfs).size ? `${new Set(kfs).size} @keyframes all referenced` : 'no @keyframes defined'), unused.join(', ') || undefined);
  // contrast
  await setWidth(1280); await fresh('');
  const seen = new Map();
  await eachView(async () => {
    for (const x of await Q('colors')) {
      const key = x.name + '|' + x.fg + '|' + x.bg; if (seen.has(key)) continue;
      const fg = blend(x.fg, x.bg), ratio = contrast(fg, x.bg);
      seen.set(key, { ...x, ratio });
    }
  }, { settle: 120 });
  const rows = [...seen.values()];
  if (!rows.length) { add('CSS', 'SKIP', 'no .btn / .tab / .rd-tag elements to measure'); return; }
  const lows = rows.filter(r => r.ratio < 4.5);
  const names = [...new Set(rows.map(r => r.name))];
  add('CSS', lows.length ? 'WARN' : 'PASS', `contrast of ${names.join(', ')}: min ${Math.min(...rows.map(r => r.ratio)).toFixed(2)}:1 over ${rows.length} colour combination(s)`,
    lows.slice(0, 5).map(r => `${r.name} "${r.text}" ${r.ratio.toFixed(2)}:1 fg=rgb(${r.fg.slice(0, 3).map(Math.round)}) bg=rgb(${r.bg.map(Math.round)})${r.grad ? ' (gradient, first stop used)' : ''}`).join(' | ') || undefined);
}

/* ================= main ================= */
const CHECKS = [['LOAD', checkLoad], ['TABS', checkTabs], ['OVERFLOW', checkOverflow], ['KEYBOARD', checkKeyboard], ['QUIZ', checkQuiz],
['SCORING', checkScoring], ['FREETEXT', checkFreeText], ['ANIM', checkAnim], ['DRAFTS', checkDrafts], ['CSS', checkCss]];

function report() {
  const cnt = { PASS: 0, WARN: 0, FAIL: 0, SKIP: 0 }; R.forEach(r => cnt[r.status]++);
  const dur = Date.now() - T0;
  if (JSON_OUT) {
    const per = {}; R.forEach(r => { (per[r.check] ||= { PASS: 0, WARN: 0, FAIL: 0, SKIP: 0 })[r.status]++; });
    console.log(JSON.stringify({ page: basename(PAGE), summary: cnt, byCheck: per, durationMs: dur, results: R }, null, 1));
  } else {
    console.log(`QA ${basename(PAGE)}  (${(dur / 1000).toFixed(1)}s)`);
    for (const r of R) {
      if (r.status === 'PASS' && !VERBOSE) { console.log(`  PASS  ${r.check.padEnd(8)} ${r.msg}`); continue; }
      console.log(`  ${r.status.padEnd(4)}  ${r.check.padEnd(8)} ${r.msg}`);
      if (r.evidence) console.log(`        -> ${r.evidence}`);
    }
    console.log(`  = PASS ${cnt.PASS}  WARN ${cnt.WARN}  FAIL ${cnt.FAIL}  SKIP ${cnt.SKIP}`);
  }
  return cnt;
}

let finished = false;
async function finish(code) {
  if (finished) return; finished = true;
  const cnt = report();
  await runCleanups();
  process.exit(code ?? (cnt.FAIL ? 1 : 0));
}
const hard = setTimeout(() => { add('LOAD', 'FAIL', 'harness hard timeout - run aborted'); finish(1); }, +(process.env.QA_HARD_MS || 120000));
hard.unref?.();
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { add('LOAD', 'FAIL', 'interrupted by ' + sig); finish(1); });
process.on('uncaughtException', e => { add('LOAD', 'FAIL', '[harness] uncaught: ' + (e && e.message)); finish(1); });
process.on('unhandledRejection', e => { add('LOAD', 'FAIL', '[harness] unhandled: ' + (e && e.message)); finish(1); });

try {
  const chrome = await launchChrome({ port: opt('--port') ? +opt('--port') : 0 });
  c = await connect(chrome.port);
  await c.send('Page.addScriptToEvaluateOnNewDocument', { source: DRIVER });
  await c.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => { });
  await setWidth(1280);
  for (const [name, fn] of CHECKS) {
    if (ONLY && !ONLY.has(name) && name !== 'LOAD') continue;
    if (name !== 'LOAD' && !info) { add(name, 'SKIP', 'page failed to load'); continue; }
    if (name !== 'LOAD' && Date.now() - T0 > SOFT_MS) { add(name, 'SKIP', 'time budget (' + SOFT_MS / 1000 + ' s) exhausted before this check - machine overloaded? rerun with --only ' + name); continue; }
    const t = Date.now();
    try { await fn(); } catch (e) { add(name, 'FAIL', '[harness error] ' + (e && e.message)); try { await setWidth(1280); } catch (_) { } }
    log(`${name} ${Date.now() - t}ms`);
  }
} catch (e) {
  add('LOAD', 'FAIL', '[harness error] ' + (e && e.message));
}
await finish();
