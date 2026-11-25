// usage: node table.mjs <dir-with-json> [--warn]   (prints page x check table + FAIL (and optionally WARN) details)
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
const dir = process.argv[2], showWarn = process.argv.includes('--warn');
const CH = ['LOAD', 'TABS', 'OVERFLOW', 'KEYBOARD', 'QUIZ', 'SCORING', 'FREETEXT', 'ANIM', 'DRAFTS', 'CSS'];
const files = readdirSync(dir).filter(f => f.endsWith('.json')).sort();
const rows = []; let fails = 0, warns = 0; const details = [];
for (const f of files) {
  let j = null; try { j = JSON.parse(readFileSync(join(dir, f), 'utf8')); } catch (_) { }
  const name = f.replace(/\.json$/, '');
  if (!j) { rows.push({ name, cells: CH.map(() => '?'), crash: true }); fails++; details.push(`${name}: CRASH (no JSON output, see ${join(dir, name + '.err')})`); continue; }
  const cells = CH.map(ch => {
    const b = j.byCheck[ch]; if (!b) return '-';
    const s = `${b.PASS}/${b.WARN}/${b.FAIL}`; return b.SKIP && !b.PASS && !b.WARN && !b.FAIL ? 'skip' : s;
  });
  rows.push({ name, cells, sum: j.summary, ms: j.durationMs });
  j.results.forEach(r => { if (r.status === 'FAIL') { fails++; details.push(`FAIL ${name} ${r.check}: ${r.msg}${r.evidence ? '\n        -> ' + r.evidence : ''}`); } else if (r.status === 'WARN') { warns++; if (showWarn) details.push(`WARN ${name} ${r.check}: ${r.msg}${r.evidence ? '\n        -> ' + r.evidence : ''}`); } });
}
const w0 = Math.max(4, ...rows.map(r => r.name.length));
const cw = CH.map((c, i) => Math.max(c.length, ...rows.map(r => r.cells[i].length)));
console.log('cells = PASS/WARN/FAIL counts per check');
console.log('page'.padEnd(w0) + '  ' + CH.map((c, i) => c.padEnd(cw[i])).join('  ') + '  time');
for (const r of rows) console.log(r.name.padEnd(w0) + '  ' + r.cells.map((c, i) => c.padEnd(cw[i])).join('  ') + '  ' + (r.ms ? (r.ms / 1000).toFixed(0) + 's' : ''));
console.log(`\ntotal: ${rows.length} page(s), ${fails} FAIL, ${warns} WARN${showWarn ? '' : ' (WARN details hidden, use --warn)'}`);
if (details.length) console.log('\n' + details.join('\n'));
process.exit(fails ? 1 : 0);
