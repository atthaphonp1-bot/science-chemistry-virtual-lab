/* ตัวอย่าง labs.js: ห้องทดลองเสมือนแบบกำหนดเอง 1 แท็บ (SVG + แอนิเมชัน)
 * ตัวแปร $, $$, esc, fmt, REDUCE, dget, ls, clean, lab, run, anim, svg ... มีให้แล้ว (ดูรายการใน AGENT_BRIEF.md) ห้ามประกาศซ้ำ
 * ชั้นนอกของไฟล์นี้ห้ามแตะ DOM: ทำงานใน build() / wire() เท่านั้น */
const W = 280, H = 150, N = 24;
const SEEDS = Array.from({ length: N }, (_, i) => ({ a: (i * 137.5) % 360, r: 4 + (i % 5) }));  /* ค่าคงที่ ไม่ใช้ Math.random เพื่อให้ผลซ้ำได้ */
const speedOf = t => 0.4 + (t - 10) * 0.02;     /* สมมติเอง: ความเร็วสัมพันธ์เพิ่มตามอุณหภูมิ (ไม่ใช่สูตรจริง) */

lab('e1', () => `
  <div class="box"><h3>จุดประสงค์ (สมมติ)</h3><p>สังเกตว่าอุณหภูมิเปลี่ยนความเร็วของการแพร่อย่างไร</p></div>
  <div class="lab"><h3>ห้องทดลองเสมือน: หยดสีในน้ำ</h3>
  <p class="small"><b>แบบจำลองเพื่อการศึกษา:</b> ความเร็วเป็นค่าสมมติของผู้จัดทำหน้า ไม่ใช่ข้อมูลวัดจริง</p>
  <div class="ledrow"><label for="tmp">อุณหภูมิน้ำ: <b id="tv">20</b> °C<input id="tmp" type="range" min="10" max="60" step="5" value="20"></label></div>
  <div class="fig">${svg(W, H, 'แก้วน้ำที่มีอนุภาคสีกระจาย', `<rect x="20" y="10" width="240" height="130" rx="10" fill="#e8f4f8" stroke="#24413f" stroke-width="2"/><g id="dots"></g><text x="140" y="146" text-anchor="middle" font-size="12" fill="#24413f">เวลา <tspan id="clk">0</tspan> วินาที</text>`, { id: 'svgE1' })}</div>
  <div class="btns"><button class="btn" type="button" id="go">เริ่มแพร่</button><button class="btn alt" type="button" id="rs">ตั้งต้นใหม่</button></div>
  <div class="tip" id="msg" aria-live="polite">กดเริ่มเพื่อดูการกระจายของสี</div></div>`,
(root) => {
  let t = 0, spread = 0;
  const dots = $('#dots'), tmp = $('#tmp');
  const draw = () => {
    $('#tv').textContent = tmp.value;
    dots.innerHTML = SEEDS.map(s => { const rr = 6 + spread * (40 + s.r * 6), x = 140 + Math.cos(s.a) * rr * 2, y = 75 + Math.sin(s.a) * rr * .8;
      return `<circle cx="${Math.max(30, Math.min(250, x)).toFixed(1)}" cy="${Math.max(20, Math.min(125, y)).toFixed(1)}" r="4" fill="#b63f43" opacity=".8"/>`; }).join('');
    $('#clk').textContent = Math.round(t);
    K.setLabel($('#svgE1'), 'แก้วน้ำที่อุณหภูมิ ' + tmp.value + ' องศา อนุภาคสีกระจาย ' + Math.round(spread * 100) + ' เปอร์เซ็นต์ ที่เวลา ' + Math.round(t) + ' วินาที');
  };
  const loop = anim(dt => { t += dt * 10; spread = Math.min(1, spread + dt * speedOf(+tmp.value) * 0.5); draw(); if (spread >= 1) { done(); return false; } }, { el: root });
  function done() { $('#msg').textContent = 'กระจายทั่วแก้วแล้วที่เวลา ' + Math.round(t) + ' วินาที (เวลาในแบบจำลอง) ลองเปลี่ยนอุณหภูมิแล้วเทียบดู'; run('e1'); }
  $('#go').onclick = () => { t = 0; spread = 0; if (REDUCE) { spread = 1; t = Math.round(10 / speedOf(+tmp.value)); draw(); done(); } else { $('#msg').textContent = 'กำลังแพร่…'; loop.start(); } };
  $('#rs').onclick = () => { loop.stop(); t = 0; spread = 0; draw(); $('#msg').textContent = 'กดเริ่มเพื่อดูการกระจายของสี'; };
  tmp.oninput = () => { if (!loop.running) draw(); };
  draw();
});
