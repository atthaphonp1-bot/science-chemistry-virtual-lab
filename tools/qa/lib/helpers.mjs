// Pure helpers (no browser). Unit-checked by tools/qa/selftest/selftest.mjs
import { readFileSync, existsSync } from 'node:fs';

/** Periodic answer-key pattern: period 2..4 repeated >= minRepeats times with a non-constant block. */
export function periodicRun(keys, minRepeats = 3) {
  const n = keys.length;
  for (let p = 2; p <= 4; p++) {
    for (let s = 0; s + minRepeats * p <= n; s++) {
      let end = s + p; // exclusive end of periodic run
      while (end < n && keys[end] === keys[end - p]) end++;
      const len = end - s;
      const block = keys.slice(s, s + p);
      if (len >= minRepeats * p && block.some(k => k !== block[0])) return { period: p, start: s, length: len, block };
    }
  }
  return null;
}
/** longest run of equal consecutive keys -> {key,len,start} */
export function longestRun(keys) {
  let best = { key: null, len: 0, start: 0 }, s = 0;
  for (let i = 1; i <= keys.length; i++) {
    if (i === keys.length || keys[i] !== keys[s]) {
      if (i - s > best.len) best = { key: keys[s], len: i - s, start: s };
      s = i;
    }
  }
  return best;
}
export function histogram(keys, k = 4) {
  const m = Math.max(k, ...keys.map(x => x + 1));
  const h = Array(m).fill(0); keys.forEach(x => h[x]++); return h;
}

// ---- colour / contrast (WCAG 2.x) ----
export function blend(fg, bg) { // fg=[r,g,b,a] over opaque bg=[r,g,b]
  const a = fg[3] == null ? 1 : fg[3];
  return [0, 1, 2].map(i => fg[i] * a + bg[i] * (1 - a));
}
export function luminance([r, g, b]) {
  const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
export function contrast(fg, bg) {
  const l1 = luminance(fg), l2 = luminance(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

// ---- CSS lint: selector-less declaration fragments, brace balance, keyframes ----
export function lintCss(css) {
  const out = { fragments: [], unbalanced: null, keyframes: [] };
  let i = 0, n = css.length, prelude = '';
  const stack = []; // 'container' | 'decl'
  const top = () => stack.length ? stack[stack.length - 1] : 'container';
  const lineOf = pos => css.slice(0, pos).split('\n').length;
  let preludeStart = 0, paren = 0;
  while (i < n) {
    const c = css[i];
    if (c === '/' && css[i + 1] === '*') { const e = css.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
    if (c === '"' || c === "'") { // string
      let j = i + 1; while (j < n && css[j] !== c) { if (css[j] === '\\') j++; j++; }
      if (top() === 'container') prelude += css.slice(i, j + 1);
      i = j + 1; continue;
    }
    if (c === '(') paren++;
    if (c === ')') paren = Math.max(0, paren - 1);
    if (paren > 0) { if (top() === 'container') prelude += c; i++; continue; }
    if (top() === 'decl') {
      if (c === '{') stack.push('decl'); // nesting
      else if (c === '}') { stack.pop(); if (top() === 'container') { prelude = ''; preludeStart = i + 1; } }
      i++; continue;
    }
    // container level
    if (c === '{') {
      const p = prelude.trim();
      const kf = p.match(/^@(?:-\w+-)?keyframes\s+([\w-]+)/i);
      if (kf) out.keyframes.push(kf[1]);
      const isContainer = /^@(media|supports|layer|container|document|-moz-document)\b/i.test(p) || !!kf;
      stack.push(isContainer ? 'container' : 'decl');
      prelude = ''; i++; preludeStart = i; continue;
    }
    if (c === '}') {
      if (prelude.trim()) out.fragments.push({ line: lineOf(preludeStart), text: prelude.trim().replace(/\s+/g, ' ').slice(0, 120), why: 'declarations without selector before }' });
      if (!stack.length) { out.fragments.push({ line: lineOf(i), text: '}', why: 'stray closing brace' }); }
      else stack.pop();
      prelude = ''; i++; preludeStart = i; continue;
    }
    if (c === ';') {
      const p = prelude.trim();
      if (p && !p.startsWith('@')) out.fragments.push({ line: lineOf(preludeStart), text: (p + ';').replace(/\s+/g, ' ').slice(0, 120), why: 'declaration without selector' });
      prelude = ''; i++; preludeStart = i; continue;
    }
    prelude += c; i++;
  }
  if (stack.length) out.unbalanced = `${stack.length} unclosed block(s) at end of style`;
  return out;
}

/** pull <style> blocks out of an HTML source string */
export function styleBlocks(html) {
  const out = []; const re = /<style\b[^>]*>([\s\S]*?)<\/style>/gi; let m;
  while ((m = re.exec(html))) out.push({ css: m[1], offset: m.index });
  return out;
}

// ---- Code.gs ids ----
export function parseIds(codeGsText) {
  const a = codeGsText.indexOf('// ids:start'), b = codeGsText.indexOf('// ids:end');
  if (a < 0 || b < 0 || b < a) return null;
  const map = new Map();
  for (const line of codeGsText.slice(a, b).split('\n')) {
    const m = line.match(/^\s*("(?:[^"\\]|\\.)*")\s*:\s*("(?:[^"\\]|\\.)*")\s*,?\s*$/);
    if (m) { try { map.set(JSON.parse(m[1]), JSON.parse(m[2])); } catch (_) {} }
  }
  return map;
}

export function loadAllow(path) {
  const base = { text: [], console: [] };
  try { if (existsSync(path)) { const j = JSON.parse(readFileSync(path, 'utf8')); return { ...base, ...j }; } } catch (_) {}
  return base;
}

/** parse a score like "ได้ 3 / 5 คะแนน" -> {got,max} | null */
export function parsePoints(text) {
  if (!text) return null;
  let m = text.match(/ได้\s*(\d+)\s*(?:\/|จาก)\s*(\d+)/);
  if (m) return { got: +m[1], max: +m[2] };
  const all = [...text.matchAll(/(\d+)\s*\/\s*(\d+)/g)];
  if (all.length) { const l = all[all.length - 1]; return { got: +l[1], max: +l[2] }; }
  return null;
}
