#!/usr/bin/env bash
# Deploy tools/apps_script/Code.gs ไปยัง Apps Script โดย "ไม่เปลี่ยน URL เดิม" (อัปเดต deployment เดิมเป็นเวอร์ชันใหม่)
#
# ตั้งค่าครั้งเดียว (ทำแล้ว): เปิด Apps Script API, clasp login, ใส่ Script ID ใน tools/apps_script/script_id.txt
# ใช้งาน: tools/deploy_apps_script.sh "ข้อความอธิบายเวอร์ชัน"
# รันหลังแก้ Code.gs (หรือหลัง python3 tools/build_curriculum.py ที่เพิ่มรหัสกิจกรรมใหม่) ทุกครั้ง
#
# หมายเหตุ: ไฟล์โค้ดในโปรเจกต์ Apps Script ชื่อ "รหัส" (ชื่อภาษาไทยของ Code) จึงต้องอัปโหลดเป็น รหัส.js
# ถ้าอัปโหลดเป็น Code.gs จะเกิดไฟล์ซ้ำสองไฟล์ที่ประกาศฟังก์ชันเดียวกันและ Web app จะพัง
set -euo pipefail
cd "$(dirname "$0")/.."

CFG=tools/submit_config.json
DIR=tools/apps_script
MSG="${1:-update $(date +%Y-%m-%d)}"
REMOTE_NAME="รหัส.js"

[ -f "$DIR/script_id.txt" ] || { echo "ไม่พบ $DIR/script_id.txt (ใส่ Script ID ก่อน)"; exit 1; }
command -v clasp >/dev/null || { echo "ไม่พบ clasp (npm i -g @google/clasp)"; exit 1; }
SCRIPT_ID=$(tr -d '[:space:]' < "$DIR/script_id.txt")

# deployment ID อยู่ใน Web app URL: .../macros/s/<DEPLOYMENT_ID>/exec
DEPLOY_ID=$(python3 -I -c 'import json,re,sys;u=json.load(open(sys.argv[1]))["url"];m=re.search(r"/macros/s/([^/]+)/exec",u);print(m.group(1) if m else "")' "$CFG")
[ -n "$DEPLOY_ID" ] || { echo "อ่าน deployment ID จาก $CFG ไม่ได้"; exit 1; }

# ประกอบโฟลเดอร์ชั่วคราว: โค้ด + manifest (ไม่ปล่อยไฟล์ลงรีโป)
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
cp "$DIR/Code.gs" "$STAGE/$REMOTE_NAME"
cp "$DIR/appsscript.json" "$STAGE/appsscript.json"
printf '{"scriptId":"%s","rootDir":"."}\n' "$SCRIPT_ID" > "$STAGE/.clasp.json"
cd "$STAGE"

# ตรวจว่า deployment นี้อยู่ในโปรเจกต์ที่ระบุจริง ก่อนจะเขียนอะไรขึ้นไป
if ! clasp deployments 2>/dev/null | grep -q "$DEPLOY_ID"; then
  echo "deployment $DEPLOY_ID ไม่อยู่ในโปรเจกต์ $SCRIPT_ID (ตรวจ Script ID หรือบัญชีที่ clasp login)"; exit 1
fi
clasp push --force
clasp deploy --deploymentId "$DEPLOY_ID" --description "$MSG"
echo "deploy แล้ว: URL เดิมยังใช้ได้ ($DEPLOY_ID)"
