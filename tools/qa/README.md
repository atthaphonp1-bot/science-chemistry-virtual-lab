# ชุดตรวจคุณภาพหน้าแล็บ (QA harness)

แทนสคริปต์ทดสอบเบราว์เซอร์ที่ QA แต่ละรอบต้องเขียนใหม่ ให้เหลือแค่งานที่ต้องใช้วิจารณญาณมนุษย์
(เทียบเนื้อหา/เฉลย/ตัวเลขกับภาพหน้าหนังสือต้นฉบับ) ไม่ต้องติดตั้งอะไรเพิ่ม: ใช้ Node (>= 22) กับ Google Chrome เท่านั้น
ไม่มี npm dependency (ใช้ `WebSocket`/`fetch` ในตัว Node คุย Chrome ผ่าน CDP)

## วิธีใช้

```bash
node tools/qa/qa_page.mjs chemistry-m5-phys-ch1.html          # อ่านผลบนจอ
node tools/qa/qa_page.mjs chemistry-m5-phys-ch1.html --json   # JSON (เอาไปประมวลผลต่อ)
node tools/qa/qa_page.mjs <page> --only QUIZ,SCORING          # รันบางหมวด
node tools/qa/qa_page.mjs <page> --port 9333 --verbose        # ระบุพอร์ต Chrome / แสดงเวลาแต่ละหมวด
tools/qa/run_all.sh [--warn] [หน้า…]                          # ทุกหน้า chemistry-*.html ทีละ 3 หน้าพร้อมกัน + ตารางสรุป
tools/qa/qa_integration.sh                                    # ตรวจสคริปต์ build/inject (ทำงานบนสำเนา ไม่แตะ worktree)
node tools/qa/selftest/selftest.mjs                           # ทดสอบ helper + พิสูจน์ว่า harness จับ defect ที่ฉีดเข้าไปได้
```

- แต่ละหน้าเปิด Chrome headless ของตัวเอง (พอร์ตสุ่ม, profile ชั่วคราว) แล้วปิด/ลบทิ้งเสมอ แม้ error หรือ timeout (สูงสุด 120 วินาที) จึงรันขนานกันได้
- ผล: PASS / WARN / FAIL / SKIP พร้อมหลักฐาน, exit code 1 ถ้ามี FAIL
- SKIP = ข้อตรวจนั้นไม่เข้ากับโครงหน้า (เช่น `chemistry-m4.html` ใช้ `lessons[]`/`selectChapter`, `chemistry-m4-lab.html` ไม่มีแท็บ) ไม่ใช่ความล้มเหลว
- ข้อยกเว้น: `tools/qa/allow.json` (regex) — `text` = ข้อความที่ไม่ถือว่าเป็น `NaN/undefined` (เช่นสูตร NaNO3), `console` = ข้อความ error ที่ข้ามได้

## แต่ละหมวดตรวจอะไร (และ defect จริงที่ออกแบบมาจับ)

| หมวด | ตรวจ | defect ที่เคยเจอ |
|---|---|---|
| LOAD | ไม่มี exception / console.error / Log error (ข้าม favicon) | สคริปต์พังเงียบทั้งหน้า |
| TABS | ทุกแท็บเปิดได้ทั้งทาง `select()` และ deep link `#act-…` แผงไม่ว่าง ไม่มี `undefined/NaN/[object/Infinity` (ทั้งข้อความและ attribute) มีกล่อง "อ่านก่อนทดลอง" พอดี 1 กล่อง (WARN ถ้า 0 บนแท็บกิจกรรม) | template ใส่ค่าไม่ครบ, SVG attribute เป็น NaN |
| OVERFLOW | ความกว้าง 320/375/1280: ไม่เลื่อนแนวนอน, ไม่มี element ล้นนอก scroll container; WARN: ตาราง/SVG ใน scroller ที่ซ่อน >40% (375), SVG ขยาย >2.2 เท่าของ viewBox (1280), ตัวอักษร SVG เล็กกว่า 10.5px (375) | ตารางกว้างซ่อนเนื้อหาครึ่งหนึ่งบนมือถือ, SVG ถูกขยายจนใหญ่เกิน |
| KEYBOARD | แท็บมี `tabindex=0` ตัวเดียว, ลูกศร/Home/End ย้ายแท็บและวนรอบ, โฟกัสตามแท็บที่เลือก, มี outline ให้เห็น | แท็บกดด้วยคีย์บอร์ดไม่ได้ / โฟกัสหาย |
| QUIZ | (a) ตำแหน่งเฉลย: WARN ถ้า >60% อยู่ช่องเดียว, เป็นคาบ 2–4 ซ้ำ ≥3 รอบ, ซ้ำติดกัน >3 ข้อ, ตัวเลือกถูกยาวสุดอย่างเดียว >65%; FAIL ถ้าชุด ≥4 ข้อเฉลยเท่ากันหมด (b) กดตรวจ: ว่าง=0, ผิดหมด=0, ถูกหมด=เต็ม (อ่านจากข้อความ `.res` และ `LabScore`) (c) หลังตรวจต้องไม่มี `.opt.good/.wrong` (หรือสไตล์ของตัวเลือกที่ถูกต่างจากตัวเลือกอื่น) (d) คำอธิบาย `.why` ต้องมองเห็น; บล็อกแบบกรอกตัวเลข/เลือก: ตรวจแค่ "ว่างแล้วกดตรวจ = 0" | ไฮไลต์ตัวเลือก (ผู้ใช้ไม่ต้องการ), เฉลยกระจุก/เป็นคาบ |
| SCORING | `__LAB_SUBMIT__` id/title ไม่ว่าง, ค่าที่ส่งให้ `LabScore.use` ตรงกัน, คู่ id/title ตรงเป๊ะกับ `tools/apps_script/Code.gs`, ชื่อส่วน ≤40 ตัวอักษร, max ≤100, ≤20 ส่วน, ตอบถูกทุกข้อแล้ว `#lsScore` ต้องเต็ม | id/title ไม่ตรง Code.gs (คะแนนส่งไม่เข้าชีต), `LabScore.set` ถูกเมินเงียบเพราะ max>100 |
| FREETEXT | พิมพ์ในช่องเขียนแล้วสลับแท็บ: `#lsWritten` ต้องเท่ากับ `LabScore.written().length`; ข้อความไม่เพิ่มคะแนน; ไม่มี textarea readonly/ซ่อน (ตัวสำรองของ clipboard จะถูกส่งเป็นคำตอบ); WARN ถ้าบอกว่า "บันทึกในเครื่องนี้เท่านั้น" โดยไม่พูดถึงการส่งครู | ตัวนับ `#lsWritten` ค้าง (stale) หลังสลับแท็บ |
| ANIM | สลับแท็บสุ่ม 30 ครั้งพร้อมกดปุ่มเริ่ม/เล่น/ต้ม… ต้องไม่มี exception; `prefers-reduced-motion: reduce` ต้องไม่มี CSS animation ที่ยังวิ่งอยู่ (WARN) | animation timer ค้างข้ามแท็บ |
| DRAFTS | พิมพ์ใน textarea → โหลดหน้าใหม่ → ค่ายังอยู่ | ร่างหาย |
| CSS | ใน `<style>`: ส่วนประกาศที่ไม่มี selector (ทำให้กฎถัดไปพังเงียบ), วงเล็บไม่สมดุล, `@keyframes` ที่ไม่มีใครเรียก; contrast ของ `.btn`, แท็บที่เลือก, `.rd-tag` (WARN < 4.5:1) | CSS เสียรูป |

`qa_integration.sh`: คัดลอก repo (ไม่รวม `.git` และ `คู่มืออ้างอิง-สสวท`) ไปโฟลเดอร์ชั่วคราว รัน `build_curriculum.py` + `inject_site_meta.py`
แล้ว `diff -rq` กับของจริง — ต้องไม่ต่างกันเลย (idempotent) จากนั้นรายงานจำนวน id ที่ `Code.gs` เพิ่มเทียบกับ `git HEAD`,
ตรวจ syntax ของสองสคริปต์ และตรวจว่าลิงก์การ์ดใน `index.html` ชี้ไปไฟล์ที่มีจริง

## สิ่งที่ harness ตรวจไม่ได้ (ยังต้องใช้คนดู)

- **เฉลยของแบบฝึกหัดกรอกตัวเลข/เลือกจากตาราง** ถูกต้องตามหนังสือหรือไม่ (harness ตรวจแค่ว่า "ว่าง = 0 คะแนน" และไม่ error) และเฉลยของข้อเลือกตอบว่า *ตรงกับ QUIZ ในหน้า* (ไม่ใช่ว่าตรงกับต้นฉบับ)
- เนื้อหา/ตัวเลข/คำอธิบายตรงกับภาพหน้าหนังสือหรือไม่, ความสวย, ความเหมาะสมของภาพ SVG
- ข้อความ "ข้อเขียน" เป็นข้อมูลจริงที่ส่งหรือไม่ (harness ไม่กดส่ง ไม่เรียก Apps Script)
- animation ที่ขับด้วย JS/SMIL (ตรวจเฉพาะ CSS animation ผ่าน `document.getAnimations()`); ช่อง `input[type=text]` ที่ไม่ใช่ textarea ไม่ถูกนับเป็นข้อเขียน
- หน้าที่โครงต่างจากแบบ `ACTS/select()` (`chemistry-m4.html`, `chemistry-m4-lab.html`) ตรวจแบบ best-effort
