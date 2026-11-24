#!/usr/bin/env python3
"""สร้าง assets/curriculum-m1v2.js (แหล่งข้อมูลเดียวของ ม.1 เล่ม 2) จากชื่อ <title> ของหน้าจริง
รันจากรากโปรเจกต์: python3 tools/build_curriculum.py (แล้วรัน tools/inject_site_meta.py ต่อ)"""
import json
import re


def title(f):
    t = re.search(r"<title>(.*?)</title>", open(f, encoding="utf8").read()).group(1)
    return t.split(" | ")[0]


def act(id_, f):
    t = title(f)
    t = re.sub(r"^กิจกรรมท้ายบท\s*", "", t)
    t = re.sub(r"^กิจกรรม\s*\d+\.\d+\s*", "", t)
    return {"id": id_, "title": t, "file": f}


def lab(n):
    return act(n, "sci-m1-v2-lab-%s.html" % n.replace(".", "-"))


def fin(u, c):
    return act("ท้ายบท %s.%s" % (u, c), "sci-m1-v2-final-%s-%s.html" % (u, c))


units = [
    {"no": 5, "title": "พลังงานความร้อน", "chapters": [
        {"no": 1, "title": "ความร้อนกับการเปลี่ยนแปลงของสสาร",
         "desc": "แบบจำลองอนุภาค อุณหภูมิ การขยายตัวหรือหดตัว และการเปลี่ยนสถานะของสสาร",
         "activities": [lab("5.1"), lab("5.2"), lab("5.3"), lab("5.4"), fin(5, 1)]},
        {"no": 2, "title": "การถ่ายโอนความร้อน",
         "desc": "การนำ การพา การแผ่รังสี และสมดุลความร้อน",
         "activities": [lab("5.5"), lab("5.6"), lab("5.7"), lab("5.8"), fin(5, 2)]}]},
    {"no": 6, "title": "กระบวนการเปลี่ยนแปลงลมฟ้าอากาศ", "chapters": [
        {"no": 1, "title": "ลมฟ้าอากาศรอบตัว",
         "desc": "บรรยากาศ อุณหภูมิ ความกดอากาศ ลม ความชื้น เมฆและฝน และการพยากรณ์อากาศ",
         "activities": [lab("6.%d" % i) for i in range(1, 9)] + [fin(6, 1)]},
        {"no": 2, "title": "มนุษย์และการเปลี่ยนแปลงลมฟ้าอากาศ",
         "desc": "พายุ และการเปลี่ยนแปลงภูมิอากาศโลก",
         "activities": [lab("6.9"), lab("6.10"), fin(6, 2)]}]},
]
data = {"book": "วิทยาศาสตร์และเทคโนโลยี ม.1 เล่ม 2", "grade": "ม.1", "units": units}
js = ("/* แหล่งข้อมูลเดียวของ ม.1 เล่ม 2 ใช้ร่วมกันโดย index.html และ sci-m1-v2.html "
      "(สร้างด้วย tools/build_curriculum.py) */\nwindow.CURRICULUM_M1V2="
      + json.dumps(data, ensure_ascii=False, indent=1) + ";\n")
open("assets/curriculum-m1v2.js", "w", encoding="utf8").write(js)
# ฝังรายการกิจกรรมที่อนุญาต (id -> ชื่อ) ลง Code.gs ให้เซิร์ฟเวอร์ใช้ชื่อของตัวเอง ไม่เชื่อค่าจากไคลเอนต์
acts = {a["id"]: a["title"] for u in units for c in u["chapters"] for a in c["activities"]}
# หน้าเคมี ม.4: ชื่อบทอ่านจากอาร์เรย์ lessons ใน chemistry-m4.html และหน้าต้นแบบ chemistry-m4-lab.html
chem = open("chemistry-m4.html", encoding="utf8").read()
for i, t in enumerate(re.findall(r"^\{title:'([^']+)'", chem, flags=re.M), 1):
    acts["เคมี ม.4 บทที่ %d" % i] = t
acts["เคมี ม.4 ปฏิบัติการเบื้องต้น"] = "ปฏิบัติการเบื้องต้น: ความปลอดภัยและทักษะเคมี ม.4"
acts["เคมี ม.5 บทที่ 7"] = "เคมี ม.5 เล่ม 3 บทที่ 7 แก๊สและสมบัติของแก๊ส (กิจกรรม 7.1–7.5)"
acts["เคมี ม.5 บทที่ 8"] = "เคมี ม.5 เล่ม 3 บทที่ 8 อัตราการเกิดปฏิกิริยาเคมี (กิจกรรม 8.1–8.5)"
acts["เคมี ม.5 บทที่ 9"] = "เคมี ม.5 เล่ม 3 บทที่ 9 สมดุลเคมี (กิจกรรม 9.1–9.5)"
acts["เคมี ม.6 บทที่ 12"] = "เคมี ม.6 เล่ม 5 บทที่ 12 เคมีอินทรีย์ (กิจกรรม 12.1–12.10)"
acts["วิทยาศาสตร์กายภาพ ม.5 บทที่ 4"] = "วิทยาศาสตร์กายภาพ ม.5 บทที่ 4 พลังงาน (กิจกรรม 4.1–4.4)"
acts["เคมี ม.6 บทที่ 14"] = "เคมี ม.6 เล่ม 6 บทที่ 14 เคมีกับการแก้ปัญหา (กิจกรรม 14.1–14.8)"
acts["เคมี ม.6 บทที่ 13"] = "เคมี ม.6 เล่ม 5 บทที่ 13 พอลิเมอร์ (กิจกรรม 13.1–13.3)"
acts["เคมี ม.5 บทที่ 10"] = "เคมี ม.5 เล่ม 4 บทที่ 10 กรด–เบส (กิจกรรม 10.1–10.5)"
acts["เคมี ม.5 บทที่ 11"] = "เคมี ม.5 เล่ม 4 บทที่ 11 เคมีไฟฟ้า (กิจกรรม 11.1–11.5)"
gs = open("tools/apps_script/Code.gs", encoding="utf8").read()
region = "// ids:start (สร้างอัตโนมัติโดย tools/build_curriculum.py ห้ามแก้ด้วยมือ)\nvar ACTIVITIES = " + json.dumps(acts, ensure_ascii=False, indent=2) + ";\n// ids:end"
gs = re.sub(r"// ids:start.*?// ids:end", lambda m: region, gs, flags=re.S)
open("tools/apps_script/Code.gs", "w", encoding="utf8").write(gs)
print(sum(len(c["activities"]) for u in units for c in u["chapters"]), "activities")
