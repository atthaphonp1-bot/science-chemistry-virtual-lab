/* In-page QA driver. Injected with Page.addScriptToEvaluateOnNewDocument (runs before page scripts).
 * Everything lives on window.__qa. Page globals (ACTS, select, QUIZ, lessons, LabScore ...) are read lazily. */
(function () {
  if (window.__qa) return;
  const q = window.__qa = { calls: { use: [], set: [] }, ta: [] };
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const has = n => { try { return typeof (0, eval)(n) !== 'undefined'; } catch (_) { return false; } };
  const g = n => (0, eval)(n);                 // global lookup (also reaches top-level const/let)

  /* ---- hook LabScore.use / .set before the injected module assigns it ---- */
  (function () {
    let v;
    try {
      Object.defineProperty(window, 'LabScore', {
        configurable: true, enumerable: true,
        get() { return v; },
        set(x) {
          v = x;
          try {
            if (x && typeof x.use === 'function' && !x.__qaw) {
              const u = x.use, s = x.set;
              x.use = function (id, title) { q.calls.use.push({ id, title }); return u.apply(this, arguments); };
              x.set = function (name, got, max) { q.calls.set.push({ name, got, max }); return s.apply(this, arguments); };
              x.__qaw = true;
            }
          } catch (_) {}
        }
      });
    } catch (_) {}
  })();

  /* ---- record suspicious textareas (readonly / offscreen / aria-hidden: would be submitted as written answers) ---- */
  try {
    const flag = el => {
      if (!el || el.tagName !== 'TEXTAREA') return;
      const cs = getComputedStyle(el), r = el.getBoundingClientRect();
      const off = r.right < 0 || r.bottom < 0 || r.left > innerWidth + 50 || cs.visibility === 'hidden' || cs.opacity === '0';
      if (el.readOnly || el.getAttribute('aria-hidden') === 'true' || off)
        q.ta.push({ id: el.id, readonly: el.readOnly, ariaHidden: el.getAttribute('aria-hidden') === 'true', offscreen: off, connected: el.isConnected, value: (el.value || '').slice(0, 40) });
    };
    const mo = new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => {
      if (n.nodeType !== 1) return;
      const els = n.tagName === 'TEXTAREA' ? [n] : $$('textarea', n);
      els.forEach(e => { flag(e); Promise.resolve().then(() => flag(e)); });
    })));
    mo.observe(document.documentElement, { childList: true, subtree: true });
  } catch (_) {}

  /* ---- page model ---- */
  q.kind = () => (has('ACTS') && typeof window.select === 'function') ? 'acts' : (has('lessons') && typeof window.selectChapter === 'function') ? 'chapters' : 'single';
  q.panelRoot = () => $('#panel') || $('main') || document.body;
  q.views = () => {
    const k = q.kind();
    if (k === 'acts') { const A = g('ACTS'), L = has('LABS') ? g('LABS') : null; return A.map((id, i) => ({ id, i, activity: L ? L.includes(id) : /^\d/.test(id) })); }
    if (k === 'chapters') return g('lessons').map((l, i) => ({ id: 'chapter-' + (i + 1), i, activity: true, title: l.title }));
    return [{ id: 'page', i: 0, activity: false }];
  };
  q.open = i => {
    const k = q.kind();
    if (k === 'acts') window.select(i); else if (k === 'chapters') window.selectChapter(i);
    return location.hash;
  };
  q.setTab = n => { try { if (typeof window.setTab === 'function') window.setTab(n); } catch (_) {} };
  q.info = () => {
    const sub = window.__LAB_SUBMIT__;
    return {
      kind: q.kind(), views: q.views(), hash: location.hash,
      hasReadHTML: typeof window.readHTML === 'function' || typeof window.readHTML_M4 === 'function',
      submit: sub ? { id: sub.id, title: sub.title, url: !!sub.url } : null,
      hasLabScore: !!window.LabScore, hasQUIZ: has('QUIZ'),
      selectedTab: (() => { const t = $$('[role=tab]'); return t.findIndex(x => x.getAttribute('aria-selected') === 'true'); })(),
      nTabs: $$('[role=tab]').length
    };
  };

  /* ---- TABS ---- */
  q.panelState = allowRes => {
    const root = q.panelRoot(), clone = root.cloneNode(true);
    clone.querySelectorAll('script,style,template').forEach(e => e.remove());
    let t = clone.textContent || '';
    (allowRes || []).forEach(a => { try { t = t.replace(new RegExp(a, 'g'), ' '); } catch (_) {} });
    const bad = [], re = /undefined|NaN|\[object|Infinity/g; let m;
    while ((m = re.exec(t)) && bad.length < 5) bad.push('text:' + t.slice(Math.max(0, m.index - 25), m.index + 25).replace(/\s+/g, ' '));
    // attribute values (aria-label="undefined", svg x="NaN" ...)
    let nattr = 0;
    clone.querySelectorAll('*').forEach(e => {
      for (const a of e.attributes) {
        let v = a.value; (allowRes || []).forEach(x => { try { v = v.replace(new RegExp(x, 'g'), ' '); } catch (_) {} });
        if (/undefined|NaN|\[object|Infinity/.test(v) && nattr++ < 5) bad.push('attr:' + e.tagName.toLowerCase() + '[' + a.name + ']=' + v.slice(0, 50));
      }
    });
    const rd = new Set([...$$('.rd, .rd-block, #rdBlock', root)].filter(e => !e.parentElement.closest('.rd, .rd-block, #rdBlock')));
    return { len: (root.innerText || '').trim().length, kids: root.children.length, bad, rd: rd.size };
  };

  /* ---- OVERFLOW ---- */
  q.overflow = () => {
    const de = document.documentElement, vw = de.clientWidth;
    const out = { sw: de.scrollWidth, cw: vw, offenders: [], hidden: [], overscaled: [], small: null };
    const desc = e => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
    const clipped = e => {
      for (let p = e.parentElement; p && p !== document.documentElement; p = p.parentElement) {
        if (p.matches('.tw,.ptw,.svw,pre,.tabs,#tabs,.ls-grid')) return true;
        const cs = getComputedStyle(p);
        if (/(auto|scroll|hidden|clip)/.test(cs.overflowX) && p !== document.body && p.getBoundingClientRect().right <= vw + 1) return true;
      }
      return false;
    };
    const bad = new Set();
    $$('body *').forEach(e => {
      if (e.closest('svg') && e.tagName.toLowerCase() !== 'svg') return;
      if (/^(SCRIPT|STYLE|OPTION|BR|TEMPLATE)$/.test(e.tagName)) return;
      const r = e.getBoundingClientRect(); if (r.width <= 0 || r.right <= vw + 1) return;
      const cs = getComputedStyle(e); if (cs.position === 'fixed' || cs.visibility === 'hidden' || cs.display === 'none') return;
      if (clipped(e)) return;
      bad.add(e);
    });
    bad.forEach(e => { if (!bad.has(e.parentElement) && out.offenders.length < 8) out.offenders.push(desc(e) + ' right=' + Math.round(e.getBoundingClientRect().right)); });
    // containers that scroll horizontally and hide a big part of a table/svg
    $$('*').forEach(e => {
      if (e.scrollWidth <= e.clientWidth + 1 || !e.clientWidth) return;
      const cs = getComputedStyle(e);
      if (!(/(auto|scroll)/.test(cs.overflowX) || e.matches('.tw,.ptw,.svw'))) return;
      if (!e.querySelector('table,svg')) return;
      out.hidden.push({ el: desc(e), sw: e.scrollWidth, cw: e.clientWidth, hiddenFrac: +(1 - e.clientWidth / e.scrollWidth).toFixed(2), what: e.querySelector('table') ? 'table' : 'svg' });
    });
    $$('svg').forEach(s => {
      if (s.parentElement && s.parentElement.closest('svg')) return;
      const vb = s.viewBox && s.viewBox.baseVal, r = s.getBoundingClientRect();
      if (!vb || !vb.width || !vb.height || r.width < 4 || r.height < 4) return;
      const scale = Math.min(r.width / vb.width, r.height / vb.height);
      out.overscaled.push({ el: desc(s), vbw: Math.round(vb.width), w: Math.round(r.width), scale: +scale.toFixed(2), wscale: +(r.width / vb.width).toFixed(2) });
    });
    const small = []; let cnt = 0;
    $$('svg text').forEach(t => {
      if (!(t.textContent || '').trim()) return;
      const m = t.getScreenCTM && t.getScreenCTM(); if (!m) return;
      const fs = parseFloat(getComputedStyle(t).fontSize); const eff = fs * Math.hypot(m.a, m.b);
      if (!(eff > 0)) return; cnt++;
      if (eff < 10.5) small.push({ t: t.textContent.trim().slice(0, 18), px: +eff.toFixed(1) });
    });
    out.small = { total: cnt, n: small.length, min: small.length ? Math.min(...small.map(x => x.px)) : null, sample: small.slice(0, 4) };
    return out;
  };

  /* ---- KEYBOARD ---- */
  q.tabs = () => {
    const t = $$('[role=tab]'), a = document.activeElement;
    const cs = a ? getComputedStyle(a) : null;
    return {
      n: t.length, zero: t.filter(x => x.tabIndex === 0).length,
      sel: t.findIndex(x => x.getAttribute('aria-selected') === 'true'),
      active: t.indexOf(a),
      outline: cs ? { w: parseFloat(cs.outlineWidth) || 0, style: cs.outlineStyle, shadow: cs.boxShadow } : null
    };
  };
  q.focusSelectedTab = () => { const t = $$('[role=tab]').find(x => x.getAttribute('aria-selected') === 'true'); if (t) t.focus(); return !!t; };

  /* ---- QUIZ blocks ---- */
  const optText = s => { const d = document.createElement('div'); d.innerHTML = String(s); return (d.textContent || '').trim(); };
  q.blocks = () => {
    const kind = q.kind(), root0 = q.panelRoot(), out = [];
    let btns;
    if (kind === 'chapters') btns = $$('#quizForm button[type=submit]');
    else if (kind === 'single') btns = $$('#quizButton, [data-act=check]');
    else btns = $$('[data-act=check]', root0);
    btns.forEach((btn, n) => {
      const root = kind === 'chapters' ? $('#quizForm') : (btn.closest('.box,form') || btn.closest('section') || btn.parentElement);
      root.setAttribute('data-qa-blk', n); btn.setAttribute('data-qa-btn', n);
      const radios = $$('input[type=radio]', root), names = [];
      radios.forEach(r => { if (!names.includes(r.name)) names.push(r.name); });
      const groups = names.map(nm => radios.filter(r => r.name === nm));
      const b = { n, id: root.id || '(anon)', type: groups.length ? 'radio' : 'other', nq: groups.length, act: null, keys: null, optLens: null, nopt: groups.map(x => x.length) };
      if (groups.length) {
        if (kind === 'acts' && has('QUIZ')) {
          const Q = g('QUIZ');
          for (const k of Object.keys(Q)) {
            const ids = ['quiz-' + k, 'quiz-' + k.replace(/\./g, '_')];
            ['qid', 'qkey'].forEach(f => { if (has(f)) { try { ids.push('quiz-' + g(f)(k)); } catch (_) {} } });
            if (ids.includes(root.id)) { b.act = k; break; }
          }
          // the page may keep QUIZ[act] as an array of {q,o,a,w} or build it via a helper (phys ch2: qset(id) from {pos,items})
          let qs = null;
          if (b.act) {
            const raw = Q[b.act];
            if (Array.isArray(raw)) qs = raw;
            else if (has('qset')) { try { qs = g('qset')(b.act); } catch (_) {} }
          }
          if (qs && Array.isArray(qs) && qs.length === groups.length && qs.every(x => Array.isArray(x.o) && Number.isInteger(x.a))) {
            b.keys = qs.map(x => x.a);
            b.optLens = qs.map(x => x.o.map(o => optText(o).length));
          } else if (b.act) { b.mismatch = 'QUIZ[' + b.act + '] could not be read as question list (' + (qs ? qs.length + ' q vs ' + groups.length + ' in DOM' : 'unknown structure') + ')'; b.act = null; }
        } else if (kind === 'chapters') {
          const l = g('lessons')[g('current')];
          if (l && l.quiz && l.quiz.length === groups.length) { b.keys = l.quiz.map(x => x[2]); b.optLens = l.quiz.map(x => x[1].map(o => optText(o).length)); b.act = 'chapter-' + (g('current') + 1); }
        }
      }
      out.push(b);
    });
    return out;
  };
  const blkRoot = n => $('[data-qa-blk="' + n + '"]');
  const groupsOf = root => { const rs = $$('input[type=radio]', root), names = []; rs.forEach(r => { if (!names.includes(r.name)) names.push(r.name); }); return names.map(nm => rs.filter(r => r.name === nm)); };
  q.answer = (n, mode, keys) => {
    const root = blkRoot(n); if (!root) return false;
    groupsOf(root).forEach((grp, i) => {
      grp.forEach(r => { r.checked = false; });
      if (mode === 'blank') return;
      let idx = 0;
      if (mode === 'right') idx = keys[i]; else if (mode === 'wrong') idx = (keys[i] + 1) % grp.length; else idx = 0;
      (grp[idx] || grp[0]).click();
    });
    return true;
  };
  q.clearScore = () => { try { window.LabScore && window.LabScore.clear(); } catch (_) {} return true; };
  q.press = n => { const b = $('[data-qa-btn="' + n + '"]'); if (!b) return false; b.click(); return true; };
  const vis = e => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.height > 0 && r.width > 0 && cs.display !== 'none' && cs.visibility !== 'hidden'; };
  const SIG = ['backgroundColor', 'color', 'borderTopColor', 'borderLeftColor', 'borderTopWidth', 'boxShadow', 'fontWeight', 'opacity', 'textDecorationLine', 'outlineStyle'];
  q.readBlock = (n, keys) => {
    const root = blkRoot(n); if (!root) return null;
    const resEl = $('.res', root) || $('#quizResult', root) || $('#quizFeedback', root) || $('.result', root);
    const out = { res: resEl ? (resEl.textContent || '').trim() : '', ls: null, parts: null, hlFail: [], hlWarn: [], whyVis: 0, whyTot: 0, sigDiff: [] };
    try { if (window.LabScore) { const s = window.LabScore.get(); out.ls = { got: s.got, max: s.max }; out.parts = Object.keys(s.parts).length; } } catch (_) {}
    $$('.opt.good,.opt.wrong,.good,.wrong,.opt.correct,.opt.incorrect,.correct,.incorrect', root).forEach(e => {
      const isOpt = e.matches('.opt,label,[class*=opt]') || !!e.querySelector('input[type=radio]') || !!e.closest('label');
      (isOpt ? out.hlFail : out.hlWarn).push(e.tagName.toLowerCase() + '.' + String(e.className).trim().replace(/\s+/g, '.') + ' "' + (e.textContent || '').trim().slice(0, 24) + '"');
    });
    $$('.why, .feedback, [id^=fb]', root).forEach(e => { if (e === resEl) return; out.whyTot++; if (vis(e) && (e.textContent || '').trim()) out.whyVis++; });
    if (keys) groupsOf(root).forEach((grp, i) => {
      const sig = r => { const el = r.closest('label') || r.parentElement, cs = getComputedStyle(el); return SIG.map(k => cs[k]).join('|'); };
      const others = grp.filter((r, j) => j !== keys[i] && !r.checked).map(sig), kr = grp[keys[i]];
      if (!kr || kr.checked || !others.length) return;
      if (others.every(s => s === others[0]) && sig(kr) !== others[0]) out.sigDiff.push(i + 1);
    });
    return out;
  };
  q.blankOther = n => {   // for non-radio check blocks: clear inputs then (node presses the button)
    const root = blkRoot(n); if (!root) return false;
    $$('input:not([type=radio]):not([type=checkbox]),textarea', root).forEach(e => { if (!e.readOnly) e.value = ''; });
    $$('input[type=checkbox]', root).forEach(e => { e.checked = false; });
    return true;
  };
  q.lsScoreText = () => { const e = $('#lsScore'); return e ? e.textContent.trim() : null; };
  q.score = () => { try { const s = window.LabScore.get(); return { got: s.got, max: s.max, parts: Object.fromEntries(Object.entries(s.parts).map(([k, v]) => [k, v.got + '/' + v.max])) }; } catch (_) { return null; } };

  /* ---- FREE TEXT ---- */
  q.fields = () => $$('textarea', q.panelRoot()).filter(e => !e.closest('#lsPanel') && !e.readOnly && vis(e))
    .map((e, i) => {
      let claim = false, ctx = e;                    // does the surrounding block promise on-device saving?
      for (let k = 0; k < 4 && ctx.parentElement && !claim; k++) { ctx = ctx.parentElement; if ((ctx.textContent || '').length < 1200) claim = /บันทึก(?:ไว้)?ในเครื่อง|auto-?sav|saved? (?:on|in) this device/i.test(ctx.textContent || ''); }
      return { i, tag: e.tagName.toLowerCase(), id: e.id || '', sel: e.id ? '#' + CSS.escape(e.id) : '', ph: (e.placeholder || '').slice(0, 24), claim };
    });
  q.setLen = () => q.calls.set.length;
  q.setSince = n => q.calls.set.slice(n);
  q.typeInto = (i, text) => {
    const e = $$('textarea', q.panelRoot()).filter(e => !e.closest('#lsPanel') && !e.readOnly && vis(e))[i]; if (!e) return false;
    e.focus(); e.value = text; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); return true;
  };
  q.readField = (i, sel) => {
    const list = $$('textarea', q.panelRoot()).filter(e => !e.closest('#lsPanel') && !e.readOnly && vis(e));
    const e = sel ? $(sel) : list[i]; return e ? e.value : null;
  };
  q.written = () => { try { return window.LabScore.written().length; } catch (_) { return null; } };
  q.writtenPanel = () => { const e = $('#lsWritten'); if (!e) return null; const m = (e.textContent || '').match(/(\d+)\s*ข้อ/); return { text: (e.textContent || '').trim().slice(0, 80), n: m ? +m[1] : 0 }; };
  q.claims = () => {
    const re = /บันทึก(?:ไว้)?ในเครื่อง(?:นี้)?(?:อัตโนมัติ)?\s*เท่านั้น|(?:อยู่|เก็บ|บันทึก)(?:ไว้)?(?:เฉพาะ)?ใน(?:เครื่อง|อุปกรณ์)(?:นี้)?เท่านั้น|only on this device|stays? on this device/i;
    const cav = /ส่ง(?:ให้)?ครู|ส่งคะแนน|กดส่ง|ส่งผล|ข้อเขียนที่จะส่ง/;
    const out = [];
    $$('p,li,div,span,small,label,summary', q.panelRoot()).forEach(e => {
      if (e.children.length > 6) return;
      const own = (e.textContent || '').trim(); if (own.length > 400 || !re.test(own)) return;
      if ([...e.children].some(c => re.test(c.textContent || ''))) return;       // smallest element only
      let ctx = e, txt = own; for (let k = 0; k < 2 && ctx.parentElement; k++) { ctx = ctx.parentElement; if ((ctx.textContent || '').length < 900) txt = ctx.textContent; }
      out.push({ text: own.slice(0, 90), caveat: cav.test(txt) });
    });
    return out;
  };
  q.copyButtons = () => $$('button', q.panelRoot()).filter(b => /คัดลอก|copy|ส่งออก/i.test(b.textContent) && vis(b)).map(b => (b.textContent || '').trim().slice(0, 30));
  q.clickCopy = () => { let n = 0; $$('button', q.panelRoot()).filter(b => /คัดลอก|copy/i.test(b.textContent) && vis(b)).forEach(b => { try { b.click(); n++; } catch (_) {} }); return n; };
  q.taFlags = () => q.ta.slice();
  q.allTextareas = () => $$('textarea').filter(e => !e.closest('#lsPanel')).map(e => ({ id: e.id, ro: e.readOnly, hid: e.getAttribute('aria-hidden') === 'true', vis: vis(e) }));

  /* ---- ANIMATIONS ---- */
  q.clickGo = (max = 3) => {
    const re = /เริ่ม|เล่น|ให้ความร้อน|ต้ม|กด|ทดลอง/; let n = 0; const labs = [];
    for (const b of $$('button', q.panelRoot())) {
      if (n >= max) break;
      if (b.matches('[role=tab],[data-act=check],[data-act=retry],#reset') || b.closest('#lsPanel') || b.disabled) continue;
      if ((re.test(b.textContent || '') || /anim|play|start|run|heat/i.test(b.id || '') || b.hasAttribute('aria-pressed')) && vis(b)) { try { b.click(); n++; labs.push((b.id ? '#' + b.id : (b.textContent || '').trim().slice(0, 14))); } catch (e) { } }
    }
    return labs;
  };
  q.anims = () => {
    const a = document.getAnimations().filter(x => x.playState === 'running');
    return { total: a.length, css: a.filter(x => typeof CSSAnimation !== 'undefined' && x instanceof CSSAnimation).map(x => x.animationName + '@' + ((x.effect && x.effect.target && x.effect.target.tagName) || '?')).slice(0, 5),
      trans: a.filter(x => typeof CSSTransition !== 'undefined' && x instanceof CSSTransition).length };
  };

  /* ---- DRAFT / contrast ---- */
  q.colors = () => {
    const parse = s => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
    const bgOf = e => {
      let acc = [255, 255, 255], layers = [], grad = false;
      for (let p = e; p; p = p.parentElement) {
        const cs = getComputedStyle(p), c = parse(cs.backgroundColor);
        if (cs.backgroundImage && cs.backgroundImage !== 'none') {
          const gm = cs.backgroundImage.match(/rgba?\([^)]+\)/); if (gm && /gradient/.test(cs.backgroundImage)) { grad = true; layers.push(parse(gm[0])); if (parse(gm[0])[3] > .99) break; }
        }
        if (c && c[3] > 0) { layers.push(c); if (c[3] > .99) break; }
      }
      for (let i = layers.length - 1; i >= 0; i--) { const l = layers[i], a = l[3]; acc = [0, 1, 2].map(k => l[k] * a + acc[k] * (1 - a)); }
      return { bg: acc, grad };
    };
    const out = [];
    const sels = [['.btn', '.btn'], ['.tab[aria-selected=true]', '.tab[aria-selected=true]'], ['[role=tab][aria-selected=true]', 'role=tab selected'], ['.rd-tag', '.rd-tag']];
    sels.forEach(([s, name]) => $$(s).forEach(e => {
      if (!vis(e) || e.disabled) return;
      const cs = getComputedStyle(e), fg = parse(cs.color); if (!fg) return;
      const b = bgOf(e); out.push({ name, text: (e.textContent || '').trim().slice(0, 20), fg, bg: b.bg, grad: b.grad, fs: cs.fontSize, fw: cs.fontWeight });
    }));
    return out;
  };
})();
