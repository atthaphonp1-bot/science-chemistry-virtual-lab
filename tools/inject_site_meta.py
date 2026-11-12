#!/usr/bin/env python3
"""ใส่ meta สำหรับแชร์ลิงก์ (Open Graph) + ลายน้ำ + เครดิตท้ายหน้า ให้ทุกหน้า sci-m1-v2*.html
และใส่เฉพาะลายน้ำ+เครดิต+ธีม Apple ให้หน้าเคมี (index.html, chemistry-m4*.html)

รันจากรากโปรเจกต์: python3 tools/inject_site_meta.py
รันซ้ำได้ (ลบของเก่าที่อยู่ระหว่าง marker แล้วใส่ใหม่)
"""
import glob
import html
import json
import os
import re
import urllib.parse

CREDIT = "จัดทำโดย ครูเก๋ วิจิตรา จิตสุภา"
BASE = "https://atthaphonp1-bot.github.io/science-chemistry-virtual-lab/"
IMG = BASE + "assets/og-sci-m1-v2.png"
DESC = ("ห้องทดลองเสมือน วิทยาศาสตร์และเทคโนโลยี ม.1 เล่ม 2 (ตามหนังสือเรียน สสวท.) "
        "ลงมือทดลอง บันทึกผล และตอบคำถามได้บนมือถือ")

tile = (
    '<svg xmlns="http://www.w3.org/2000/svg" width="360" height="260">'
    '<text x="180" y="130" text-anchor="middle" transform="rotate(-28 180 130)" '
    'font-family="Thonburi, Sarabun, Noto Sans Thai, Tahoma, sans-serif" font-size="22" '
    f'fill="#1d2433">{CREDIT}</text></svg>'
)
TILE_URI = "data:image/svg+xml," + urllib.parse.quote(tile)

WM_CSS = (
    "<!-- wm:css:start -->\n<style>"
    "body::after{content:\"\";position:fixed;inset:0;pointer-events:none;z-index:2147483000;"
    f"opacity:.07;background-image:url(\"{TILE_URI}\");background-repeat:repeat}}"
    ".site-credit{text-align:center;color:#66708a;font-size:.85rem;padding:18px 16px 28px}"
    "@media print{body::after{opacity:.12}}"
    "</style>\n<!-- wm:css:end -->\n"
)
CHEM_LAB_ID = "เคมี ม.4 ปฏิบัติการเบื้องต้น"
CFG = json.load(open("tools/submit_config.json", encoding="utf8"))
MODULE = open("tools/submit_module.js", encoding="utf8").read()


def submit_block(f, title):
    """ฝังโมดูลส่งคะแนนในหน้ากิจกรรม (lab/final) ตั้งรหัสกิจกรรมจากชื่อไฟล์"""
    base = os.path.basename(f)
    if base == "chemistry-m4.html":      # หลายบทในไฟล์เดียว: หน้าเรียก LabScore.use(id, title) เองเมื่อเปลี่ยนบท
        cfg = json.dumps({"id": "", "title": "", "url": CFG.get("url", "")}, ensure_ascii=False)
        return f"<!-- ls:start -->\n<script>window.__LAB_SUBMIT__={cfg};</script>\n<script>\n{MODULE}\n</script>\n<!-- ls:end -->\n"
    if base == "chemistry-m4-lab.html":
        cfg = json.dumps({"id": CHEM_LAB_ID, "title": "ปฏิบัติการเบื้องต้น: ความปลอดภัยและทักษะเคมี ม.4", "url": CFG.get("url", "")}, ensure_ascii=False)
        return f"<!-- ls:start -->\n<script>window.__LAB_SUBMIT__={cfg};</script>\n<script>\n{MODULE}\n</script>\n<!-- ls:end -->\n"
    m = re.match(r"sci-m1-v2-(lab|final)-(\d+)-(\d+)\.html$", base)
    if not m:
        return ""
    kind, a, b = m.groups()
    aid = f"{a}.{b}" if kind == "lab" else f"ท้ายบท {a}.{b}"
    cfg = json.dumps({"id": aid, "title": title.split(" | ")[0], "url": CFG.get("url", "")}, ensure_ascii=False)
    cfg = cfg.replace("</", "<\\/")
    return f"<!-- ls:start -->\n<script>window.__LAB_SUBMIT__={cfg};</script>\n<script>\n{MODULE}\n</script>\n<!-- ls:end -->\n"


AP = "<!-- ap:start -->\n<style>\n" + open("tools/apple_theme.css", encoding="utf8").read() + "</style>\n<!-- ap:end -->\n"
WM_FOOT = f'<!-- wm:foot:start -->\n<footer class="site-credit">{CREDIT}</footer>\n<!-- wm:foot:end -->\n'


def strip(s):
    for tag in ("og", "wm:css", "wm:foot", "ls", "ap"):
        s = re.sub(rf"<!-- {tag}:start -->.*?<!-- {tag}:end -->\n?", "", s, flags=re.S)
    return s


for f in sorted(glob.glob("sci-m1-v2*.html")):
    s = strip(open(f, encoding="utf8").read())
    title = re.search(r"<title>(.*?)</title>", s).group(1)
    og = (
        "<!-- og:start -->\n"
        f'<meta name="description" content="{html.escape(DESC)}">\n'
        '<meta property="og:type" content="website">\n'
        f'<meta property="og:title" content="{html.escape(title)}">\n'
        f'<meta property="og:description" content="{html.escape(DESC)}">\n'
        f'<meta property="og:url" content="{BASE}{f}">\n'
        f'<meta property="og:image" content="{IMG}">\n'
        '<meta property="og:locale" content="th_TH">\n'
        '<meta name="twitter:card" content="summary_large_image">\n'
        "<!-- og:end -->\n"
    )
    s = s.replace("</title>", "</title>\n" + og + WM_CSS + submit_block(f, title), 1)
    s = s.replace("</head>", AP + "</head>", 1)
    s = s.replace("</body>", WM_FOOT + "</body>", 1)
    open(f, "w", encoding="utf8").write(s)
    print(f)

# หน้าเคมี: ลายน้ำ + เครดิตอย่างเดียว (ไม่แตะ meta เดิมของหน้า)
for f in ["index.html"] + sorted(glob.glob("chemistry-m4*.html")):
    s = strip(open(f, encoding="utf8").read())
    title = re.search(r"<title>(.*?)</title>", s).group(1)
    s = s.replace("</title>", "</title>\n" + WM_CSS + submit_block(f, title), 1)
    s = s.replace("</head>", AP + "</head>", 1)
    s = s.replace("</body>", WM_FOOT + "</body>", 1)
    open(f, "w", encoding="utf8").write(s)
    print(f)
