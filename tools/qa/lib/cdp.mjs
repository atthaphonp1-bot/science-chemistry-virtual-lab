// Chrome headless launcher + minimal CDP client. No npm dependencies (Node >= 22: global WebSocket/fetch).
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const CHROME = process.env.QA_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const cleanups = new Set();
export function onCleanup(fn) { cleanups.add(fn); }
export async function runCleanups() {
  for (const fn of [...cleanups]) { cleanups.delete(fn); try { await fn(); } catch (_) {} }
}

export async function launchChrome({ port = 0 } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'qa-chrome-'));
  const args = ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--disable-extensions',
    '--disable-background-networking', '--disable-sync', '--mute-audio', 'about:blank'];
  const proc = spawn(CHROME, args, { stdio: 'ignore', detached: true });
  let dead = false;
  proc.on('exit', () => { dead = true; });
  const kill = () => {
    if (!dead) { try { process.kill(-proc.pid, 'SIGKILL'); } catch (_) { try { proc.kill('SIGKILL'); } catch (_) {} } }
    try { rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch (_) {}
  };
  onCleanup(kill);
  // port 0 => Chrome picks a free port and writes it to DevToolsActivePort (race-free)
  let realPort = port;
  for (let i = 0; i < 300; i++) {
    const f = join(dir, 'DevToolsActivePort');
    if (existsSync(f)) { const t = readFileSync(f, 'utf8').split('\n'); if (t[0]) { realPort = +t[0]; break; } }
    if (dead) { await runCleanups(); throw new Error('Chrome exited during start-up'); }
    await sleep(100);
  }
  if (!realPort) { await runCleanups(); throw new Error('Chrome did not publish a DevTools port'); }
  return { proc, dir, port: realPort, kill };
}

export class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.cb = new Map(); this.listeners = []; this.errors = []; this.logs = [];
    ws.onmessage = m => {
      const d = JSON.parse(m.data);
      if (d.id && this.cb.has(d.id)) { const f = this.cb.get(d.id); this.cb.delete(d.id); f(d); return; }
      if (!d.method) return;
      const p = d.params || {};
      if (d.method === 'Runtime.exceptionThrown') {
        const e = p.exceptionDetails || {};
        this.errors.push({ t: Date.now(), kind: 'exception', text: (e.exception && e.exception.description || e.text || '').split('\n')[0].slice(0, 300) });
      } else if (d.method === 'Runtime.consoleAPICalled' && p.type === 'error') {
        this.errors.push({ t: Date.now(), kind: 'console.error', text: (p.args || []).map(a => a.value ?? a.description ?? '').join(' ').slice(0, 300) });
      } else if (d.method === 'Log.entryAdded' && p.entry && p.entry.level === 'error') {
        this.errors.push({ t: Date.now(), kind: 'log.error', text: ((p.entry.text || '') + ' ' + (() => { try { return decodeURIComponent(p.entry.url || '').split('/').pop(); } catch (_) { return ''; } })() + (p.entry.lineNumber != null ? ':' + p.entry.lineNumber : '')).slice(0, 300) });
      }
      for (const l of this.listeners.slice()) if (l.method === d.method) l.fn(p);
    };
  }
  send(method, params = {}, timeout = 30000) {
    return new Promise((res, rej) => {
      const id = ++this.id;
      const t = setTimeout(() => { this.cb.delete(id); rej(new Error('CDP timeout: ' + method)); }, timeout);
      this.cb.set(id, d => { clearTimeout(t); d.error ? rej(new Error(method + ': ' + d.error.message)) : res(d.result); });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  once(method, timeout = 15000) {
    return new Promise((res, rej) => {
      const l = { method, fn: p => { this.listeners.splice(this.listeners.indexOf(l), 1); clearTimeout(t); res(p); } };
      const t = setTimeout(() => { this.listeners.splice(this.listeners.indexOf(l), 1); rej(new Error('timeout waiting ' + method)); }, timeout);
      this.listeners.push(l);
    });
  }
  /** evaluate an expression in the page; returns value (JSON-serialisable) */
  async ev(expr, timeout = 30000) {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, timeout);
    if (r.exceptionDetails) {
      const e = r.exceptionDetails;
      throw new Error('page eval: ' + ((e.exception && (e.exception.description || e.exception.value)) || e.text).toString().split('\n')[0].slice(0, 300));
    }
    return r.result.value;
  }
  mark() { return this.errors.length; }
  since(m) { return this.errors.slice(m); }
}

export async function connect(port) {
  let t;
  for (let i = 0; i < 200; i++) {
    try { t = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json(); break; }
    catch (_) { await sleep(100); }
  }
  if (!t) throw new Error('cannot reach DevTools on port ' + port);
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws error')); });
  const c = new CDP(ws);
  await c.send('Runtime.enable'); await c.send('Log.enable'); await c.send('Page.enable');
  onCleanup(() => { try { ws.close(); } catch (_) {} });
  return c;
}
