/**
 * รับคะแนนจากหน้าเว็บแล้วบันทึกลง Google Sheet (แยกแท็บตามกิจกรรม)
 *
 * วิธีติดตั้ง (ทำโดยเจ้าของชีต):
 * 1. เปิด Google Sheet > Extensions > Apps Script
 * 2. ลบโค้ดเดิม วางโค้ดไฟล์นี้ทั้งหมด กด Save
 * 3. Deploy > New deployment > เลือกชนิด "Web app"
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 4. กด Deploy แล้วอนุญาตสิทธิ์ (Authorize) คัดลอก "Web app URL"
 * 5. ส่ง URL นั้นให้คนดูแลเว็บ ไปใส่ใน tools/submit_config.json
 *
 * แก้โค้ดแล้วต้อง Deploy > Manage deployments > Edit > New version ถึงจะมีผล
 */

var CLASSES = ['ม.1', 'ม.2', 'ม.3', 'ม.4', 'ม.5', 'ม.6'];
// ids:start (สร้างอัตโนมัติโดย tools/build_curriculum.py ห้ามแก้ด้วยมือ)
var ACTIVITIES = {
  "5.1": "แบบจำลองอนุภาคของสสารในแต่ละสถานะเป็นอย่างไร",
  "5.2": "ปัจจัยใดบ้างที่มีผลต่อการเปลี่ยนแปลงอุณหภูมิของสาร",
  "5.3": "ความร้อนส่งผลต่อสสารแต่ละสถานะอย่างไร",
  "5.4": "ความร้อนทำให้สารเปลี่ยนสถานะได้อย่างไร",
  "ท้ายบท 5.1": "ค่าความร้อนจำเพาะของสารเกี่ยวข้องกับสิ่งมีชีวิตและสิ่งแวดล้อมอย่างไร",
  "5.5": "ความร้อนถ่ายโอนผ่านของแข็งได้อย่างไร",
  "5.6": "การถ่ายโอนความร้อนของของเหลวและแก๊สเป็นอย่างไร",
  "5.7": "การถ่ายโอนความร้อนโดยไม่อาศัยตัวกลางเป็นอย่างไร",
  "5.8": "น้ำอุณหภูมิต่างกันผสมกันจะเป็นอย่างไร",
  "ท้ายบท 5.2": "สร้างตู้ขนส่งสินค้ากันความร้อนได้อย่างไร",
  "6.1": "บรรยากาศของโลกเป็นอย่างไร",
  "6.2": "อุณหภูมิอากาศเปลี่ยนแปลงอย่างไร",
  "6.3": "อากาศมีแรงกระทำต่อวัตถุอย่างไร",
  "6.4": "เหตุใดลมจึงเคลื่อนที่เร็วต่างกัน",
  "6.5": "ปัจจัยที่มีผลต่อความชื้นสัมพัทธ์มีอะไรบ้าง",
  "6.6": "เมฆที่เห็นเป็นอย่างไร",
  "6.7": "การพยากรณ์อากาศทำได้อย่างไร",
  "6.8": "คำพยากรณ์อากาศมีประโยชน์อย่างไร",
  "ท้ายบท 6.1": "เฝ้าระวังและป้องกันอันตรายจากการเปลี่ยนแปลงลมฟ้าอากาศอย่างฉับพลันได้อย่างไร",
  "6.9": "พายุฝนฟ้าคะนองและพายุหมุนเขตร้อนเกิดขึ้นได้อย่างไร",
  "6.10": "ภูมิอากาศเปลี่ยนแปลงได้หรือไม่",
  "ท้ายบท 6.2": "ปฏิบัติตนอย่างไรเพื่อรับมือกับการเปลี่ยนแปลงภูมิอากาศโลกในอนาคต",
  "เคมี ม.4 บทที่ 1": "ความปลอดภัยและทักษะในปฏิบัติการเคมี",
  "เคมี ม.4 บทที่ 2": "อะตอมและสมบัติของธาตุ",
  "เคมี ม.4 บทที่ 3": "พันธะเคมี",
  "เคมี ม.4 บทที่ 4": "โมลและสูตรเคมี",
  "เคมี ม.4 บทที่ 5": "สารละลาย",
  "เคมี ม.4 บทที่ 6": "ปริมาณสัมพันธ์",
  "เคมี ม.4 ปฏิบัติการเบื้องต้น": "ปฏิบัติการเบื้องต้น: ความปลอดภัยและทักษะเคมี ม.4"
};
// ids:end
var HEADERS = ['เวลา', 'ชื่อ-สกุล', 'เลขที่', 'ชั้น', 'ห้อง', 'กิจกรรม', 'ชื่อกิจกรรม',
               'คะแนนที่ได้', 'คะแนนเต็ม', 'เปอร์เซ็นต์', 'คะแนนแต่ละส่วน', 'ส่งครั้งที่'];

function doGet() {
  return json_({ ok: true, note: 'ใช้ POST เท่านั้น' });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    var d = JSON.parse(e.postData.contents);
    var err = validate_(d);
    if (err) return json_({ ok: false, error: err });

    // กันส่งรัว: คนเดิม กิจกรรมเดิม ห่างกันน้อยกว่า 5 วินาทีถือว่าซ้ำ
    var cache = CacheService.getScriptCache();
    var key = ['k', d.cls, d.room, d.no, d.id].join('|').slice(0, 240);
    if (cache.get(key)) return json_({ ok: false, error: 'ส่งถี่เกินไป' });
    cache.put(key, '1', 5);

    var sheet = sheetFor_(d.id);
    var pct = d.max > 0 ? Math.round(d.got / d.max * 1000) / 10 : 0;
    sheet.appendRow([new Date(), d.name.trim(), d.no, d.cls, d.room, d.id, ACTIVITIES[d.id],
                     d.got, d.max, pct, JSON.stringify(d.parts), d.attempt]);
    return json_({ ok: true });
  } catch (x) {
    return json_({ ok: false, error: String(x) });
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

function validate_(d) {
  if (!d || d.v !== 1) return 'รูปแบบไม่ถูกต้อง';
  if (d.hp) return 'ปฏิเสธ';                                   // ช่องดักบอท
  if (typeof d.id !== 'string' || !ACTIVITIES.hasOwnProperty(d.id)) return 'รหัสกิจกรรมไม่ถูกต้อง';  // whitelist เท่านั้น
  if (typeof d.name !== 'string' || d.name.trim().length < 2 || d.name.length > 80) return 'ชื่อไม่ถูกต้อง';
  if (/[\u0000-\u001F\u007F\u200B-\u200F\u2028\u2029\uFEFF]/.test(d.name)) return 'ชื่อไม่ถูกต้อง';  // อักขระควบคุม/ความกว้างศูนย์
  if (/^[=+\-@]/.test(d.name.trim())) return 'ชื่อไม่ถูกต้อง';   // กันสูตรใน Sheet
  if (CLASSES.indexOf(d.cls) < 0) return 'ชั้นไม่ถูกต้อง';
  if (!isInt_(d.no, 1, 99) || !isInt_(d.room, 1, 99)) return 'เลขที่/ห้องไม่ถูกต้อง';
  if (typeof d.got !== 'number' || typeof d.max !== 'number' ||
      !(d.max > 0 && d.max <= 500 && d.got >= 0 && d.got <= d.max)) return 'คะแนนไม่ถูกต้อง';
  if (!isInt_(d.attempt, 1, 999)) return 'ครั้งที่ไม่ถูกต้อง';
  if (!d.parts || typeof d.parts !== 'object' || Array.isArray(d.parts)) return 'ข้อมูลส่วนไม่ถูกต้อง';
  var keys = Object.keys(d.parts);
  if (keys.length > 20) return 'ข้อมูลส่วนไม่ถูกต้อง';
  for (var i = 0; i < keys.length; i++) {
    var p = d.parts[keys[i]];
    if (keys[i].length > 40 || !p || typeof p.got !== 'number' || typeof p.max !== 'number' ||
        p.got < 0 || p.max <= 0 || p.got > p.max) return 'ข้อมูลส่วนไม่ถูกต้อง';
  }
  return '';
}

function isInt_(v, lo, hi) { return typeof v === 'number' && v % 1 === 0 && v >= lo && v <= hi; }

function sheetFor_(id) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var name = String(id).replace(/[\[\]*?:\/\\]/g, '-').slice(0, 99);
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
  }
  return sh;
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
