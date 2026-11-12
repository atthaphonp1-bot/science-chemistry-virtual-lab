/* โมดูลส่งคะแนนรวมเข้า Google Sheet (ฝังในแต่ละหน้าโดย tools/inject_site_meta.py)
 * หน้ากิจกรรมเรียก: window.LabScore.set('ชื่อส่วน', คะแนนที่ได้, คะแนนเต็ม)
 * ทุกครั้งที่ตรวจคำตอบส่วนนั้น (เรียกซ้ำได้ ค่าล่าสุดทับค่าเดิม)
 * หน้าที่มีหลายบทในไฟล์เดียว (เช่น chemistry-m4.html) เรียก window.LabScore.use(id, title) เมื่อเปลี่ยนบท
 * ถ้า __LAB_SUBMIT__.url ว่าง จะไม่แสดงแผงส่งผล (เก็บคะแนนในเครื่องอย่างเดียว) */
(() => {
  'use strict';
  const CFG = window.__LAB_SUBMIT__ || {};
  const URL_ = String(CFG.url || '');
  let ID = String(CFG.id || ''), TITLE = String(CFG.title || '');
  const rd = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (_) { return d; } };
  const wr = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
  const SKEY = 'labStudentInfo_v1';
  const PKEY = () => 'labScoreParts_v1_' + ID, LKEY = () => 'labSubmitLog_v1_' + ID;
  let parts = rd(PKEY(), {});
  let rendered = false;

  const total = () => {
    let got = 0, max = 0;
    for (const k in parts) { got += parts[k].got; max += parts[k].max; }
    return { got, max };
  };

  window.LabScore = {
    use(id, title) {
      id = String(id || ''); if (!id) return;
      ID = id; TITLE = String(title || ''); parts = rd(PKEY(), {});
      const m = $('#lsMsg'); if (m) { m.textContent = ''; m.className = 'ls-msg'; }
      refresh();
    },
    set(name, got, max) {
      got = Number(got); max = Number(max);
      if (!ID || !name || !(max > 0) || max > 100 || !Number.isFinite(got) || !Number.isFinite(max)) return;
      parts[String(name).slice(0, 40)] = { got: Math.max(0, Math.min(got, max)), max };
      wr(PKEY(), parts);
      refresh();
    },
    get() { return Object.assign({ parts: JSON.parse(JSON.stringify(parts)) }, total()); },
    clear() { parts = {}; if (ID) wr(PKEY(), parts); refresh(); }
  };

  const $ = (s, r = document) => r.querySelector(s);
  function css() {
    const st = document.createElement('style');
    st.textContent =
      '.ls-panel{max-width:1080px;margin:18px auto;padding:clamp(18px,4vw,30px);border:1px solid rgba(140,150,180,.3);border-radius:22px;background:#f7faff;color:#1d2433;font:16px/1.6 -apple-system,BlinkMacSystemFont,Thonburi,Sarabun,system-ui,sans-serif}' +
      '.ls-panel h2{margin:0 0 .3rem;font-size:1.3rem}.ls-panel p{margin:.3rem 0;color:#4a5570}' +
      '.ls-grid{display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:10px;margin:12px 0}.ls-grid label{display:block;font-size:.85rem;color:#4a5570}' +
      '.ls-grid input,.ls-grid select{width:100%;padding:9px 10px;border:1px solid #b7c0d6;border-radius:10px;font:inherit;background:#fff;color:#1d2433}' +
      '.ls-score{font-weight:700;font-size:1.15rem}.ls-btn{border:0;border-radius:999px;padding:11px 22px;background:#1769e0;color:#fff;font:inherit;font-weight:650;cursor:pointer}.ls-btn:disabled{opacity:.5;cursor:not-allowed}' +
      '.ls-msg{min-height:1.5em;font-weight:620;margin:.5rem 0 0}.ls-msg.ok{color:#176553}.ls-msg.err{color:#b63f43}.ls-hp{position:absolute;left:-9999px;opacity:0}' +
      '@media(max-width:640px){.ls-grid{grid-template-columns:1fr 1fr}.ls-grid>div:first-child{grid-column:1/-1}}';
    document.head.appendChild(st);
  }

  function build() {
    if (rendered || !URL_) return;
    rendered = true; css();
    const info = rd(SKEY, {});
    const box = document.createElement('section');
    box.className = 'ls-panel'; box.id = 'lsPanel';
    box.innerHTML =
      '<h2>ส่งผลการเรียนให้ครู</h2>' +
      '<p>กรอกข้อมูลแล้วกดส่ง ระบบจะส่ง <b>คะแนนรวมของกิจกรรมนี้</b> ให้ครูผู้สอนบันทึก ข้อมูลที่กรอกใช้เพื่อบันทึกคะแนนในรายวิชาเท่านั้น</p>' +
      '<p class="ls-act" id="lsAct"></p>' +
      '<div class="ls-score" id="lsScore" aria-live="polite"></div>' +
      '<p class="ls-act" id="lsWritten"></p>' +
      '<div class="ls-grid">' +
      '<div><label for="lsName">ชื่อ-สกุล</label><input id="lsName" autocomplete="name" maxlength="80"></div>' +
      '<div><label for="lsNo">เลขที่</label><input id="lsNo" inputmode="numeric" maxlength="2"></div>' +
      '<div><label for="lsCls">ชั้น</label><select id="lsCls"><option value="">เลือก</option>' +
      [1, 2, 3, 4, 5, 6].map(n => '<option>ม.' + n + '</option>').join('') + '</select></div>' +
      '<div><label for="lsRoom">ห้อง</label><input id="lsRoom" inputmode="numeric" maxlength="2"></div></div>' +
      '<input class="ls-hp" id="lsHp" tabindex="-1" autocomplete="off" aria-hidden="true">' +
      '<button class="ls-btn" id="lsSend" type="button">ส่งคะแนน</button>' +
      '<p class="ls-msg" id="lsMsg" aria-live="polite"></p>';
    const foot = $('.site-credit');
    (foot && foot.parentNode === document.body ? document.body.insertBefore(box, foot) : document.body.appendChild(box));
    $('#lsName').value = info.name || ''; $('#lsNo').value = info.no || '';
    $('#lsCls').value = info.cls || ''; $('#lsRoom').value = info.room || '';
    $('#lsSend').addEventListener('click', send);
    document.addEventListener('input', e => { if (e.target && e.target.tagName === 'TEXTAREA') refresh(); });
    refresh();
  }

  function refresh() {
    const el = $('#lsScore'); if (!el) return;
    const act = $('#lsAct'); if (act) act.textContent = ID ? 'กิจกรรมที่จะส่ง: ' + (TITLE || ID) : 'เลือกบทเรียนและทำแบบทดสอบก่อน แล้วกลับมากดส่ง';
    const t = total(), n = Object.keys(parts).length;
    el.textContent = n ? 'คะแนนรวมตอนนี้ ' + t.got + ' / ' + t.max : 'ยังไม่มีคะแนน ทำแบบทดสอบในหน้านี้ก่อน แล้วกลับมากดส่ง';
    const w = collectWritten().length;
    const wl = $('#lsWritten'); if (wl) wl.textContent = w ? 'ข้อเขียนที่จะส่งให้ครูตรวจ: ' + w + ' ข้อ (ไม่นับในคะแนนรวมนี้ ครูจะให้คะแนนภายหลัง)' : '';
    const log = ID ? rd(LKEY(), []) : [];
    const m = $('#lsMsg');
    if (log.length && !m.textContent) {
      m.className = 'ls-msg'; m.textContent = 'เคยส่งแล้ว ' + log.length + ' ครั้ง (ล่าสุด ' + log[log.length - 1].got + '/' + log[log.length - 1].max + ')';
    }
  }

  /* ข้อเขียน: เก็บทุก textarea ที่นักเรียนพิมพ์ไว้ในหน้านี้ (รหัสข้อ = id ของช่อง, คำถาม = ป้ายกำกับที่อยู่ใกล้ช่อง) */
  function labelOf(ta) {
    let t = '';
    if (ta.id) { const l = document.querySelector('label[for="' + ta.id.replace(/"/g, '') + '"]'); if (l) t = l.textContent; }
    if (!t) { const fs = ta.closest('fieldset'), lg = fs && fs.querySelector('legend'); if (lg) t = lg.textContent; }
    if (!t) { let p = ta.previousElementSibling; for (let n = 0; p && n < 3 && !t; n++, p = p.previousElementSibling) { const x = (p.textContent || '').trim(); if (x && x.length <= 300) t = x; } }
    if (!t) t = ta.getAttribute('aria-label') || ta.placeholder || '';
    return t.replace(/\s+/g, ' ').trim().slice(0, 300);
  }
  function collectWritten() {
    const out = [];
    document.querySelectorAll('textarea').forEach((ta, i) => {
      const a = (ta.value || '').trim();
      if (a) out.push({ k: (ta.id || 't' + (i + 1)).slice(0, 40), q: labelOf(ta), a: a.slice(0, 3000) });
    });
    return out.slice(0, 30);
  }
  window.LabScore.written = collectWritten;

  function msg(t, cls) { const m = $('#lsMsg'); m.textContent = t; m.className = 'ls-msg ' + (cls || ''); }

  async function send() {
    const t = total();
    if (!ID) return msg('เลือกบทเรียนและทำแบบทดสอบก่อน', 'err');
    if (!Object.keys(parts).length && !collectWritten().length) return msg('ยังไม่มีคะแนนหรือข้อเขียน กรุณาทำกิจกรรมในหน้านี้ก่อน', 'err');
    const name = $('#lsName').value.trim(), no = $('#lsNo').value.trim(), cls = $('#lsCls').value, room = $('#lsRoom').value.trim();
    if (name.length < 2) return msg('กรุณากรอกชื่อ-สกุล', 'err');
    if (!/^\d{1,2}$/.test(no) || +no < 1) return msg('เลขที่ต้องเป็นตัวเลข 1–99', 'err');
    if (!cls) return msg('กรุณาเลือกชั้น', 'err');
    if (!/^\d{1,2}$/.test(room) || +room < 1) return msg('ห้องต้องเป็นตัวเลข เช่น 1', 'err');
    wr(SKEY, { name, no, cls, room });
    const log = rd(LKEY(), []);
    const payload = { v: 1, id: ID, title: TITLE, name, no: +no, cls, room: +room,
      got: t.got, max: t.max, parts, attempt: log.length + 1, hp: $('#lsHp').value };
    const written = collectWritten(); if (written.length) payload.written = written;
    const btn = $('#lsSend'); btn.disabled = true; msg('กำลังส่ง…');
    try {
      /* text/plain + no-cors เพื่อไม่ต้องมี preflight กับ Apps Script (อ่านผลตอบกลับไม่ได้) */
      await fetch(URL_, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) });
      log.push({ ts: Date.now(), got: t.got, max: t.max }); wr(LKEY(), log);
      const what = (t.max ? 'คะแนน ' + t.got + '/' + t.max : '') + (t.max && written.length ? ' + ' : '') + (written.length ? 'ข้อเขียน ' + written.length + ' ข้อ' : '');
      msg('ส่งคำขอแล้ว ✓ ' + what + ' (ครั้งที่ ' + log.length + ') ระบบยืนยันการรับให้ไม่ได้ ถ้าไม่แน่ใจว่าครูได้รับ ให้แจ้งครู', 'ok');
    } catch (_) {
      msg('ส่งไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วกดส่งอีกครั้ง', 'err');
    }
    setTimeout(() => { btn.disabled = false; }, 6000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
