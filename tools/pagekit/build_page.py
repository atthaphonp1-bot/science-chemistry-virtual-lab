#!/usr/bin/env python3
"""ประกอบหน้าแล็บ HTML ไฟล์เดียว (ก่อน inject) จาก spec ของหน้า + kit.css + kit.js

ใช้:  python3 tools/pagekit/build_page.py <spec_dir | content.js> -o chemistry-xxx.html [--check] [-q]

spec_dir ต้องมี content.js (กำหนด PAGE = {...}) และอาจมี labs.js (K.lab(id, build, wire))
ผลลัพธ์เป็นแบบ deterministic (รันซ้ำได้ไฟล์เดิมทุกไบต์) และไม่มี marker ของ inject
(ls:start / wm: / ap: / og:) ให้รัน tools/inject_site_meta.py ภายหลังตามปกติ
ต้องมี node ใน PATH (ใช้ตรวจ spec ด้วย tools/pagekit/spec_check.js)
"""
import argparse
import html
import json
import os
import re
import subprocess
import sys
from html.parser import HTMLParser

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
LAB_PRELUDE = ("$,$$,esc,fmt,REDUCE,reduced,dget,dset,ls,qid,state,clean,lab,run,anim,svg,fitSvg,wireDraft,wireRadio,"
               "radioGroup,fieldsHTML,textOf,revealHTML,expHTML,wireExp,quizHTML,wireQuiz,numHTML,wireNum,markDone,setLabel,select")


# ---------- สี ----------
def _rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def _hex(c):
    return '#%02x%02x%02x' % tuple(max(0, min(255, round(v))) for v in c)


def mix(h, other, f):
    """ผสมสี h กับ other (f = สัดส่วนของ other)"""
    a, b = _rgb(h), _rgb(other)
    return _hex(tuple(a[i] * (1 - f) + b[i] * f for i in range(3)))


def lum(h):
    def ch(v):
        v /= 255
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = (ch(v) for v in _rgb(h))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a, b):
    la, lb = sorted((lum(a), lum(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def palette(page):
    acc = page['accent'].lower()
    p = {
        'acc': acc,
        'accd': (page.get('accentDark') or mix(acc, '#000000', 0.25)).lower(),
        'acc2': mix(acc, '#ffffff', 0.88),
        'acc3': mix(acc, '#ffffff', 0.34),
        'soft': mix(acc, '#ffffff', 0.94),
        'line': mix(acc, '#ffffff', 0.82),
        'line2': mix(acc, '#ffffff', 0.72),
        'line3': mix(acc, '#ffffff', 0.68),
    }
    p.update({k: v.lower() for k, v in (page.get('palette') or {}).items()})
    return p


def check_contrast(p, err):
    W = '#ffffff'
    c = contrast(p['acc'], W)
    if c < 4.5:
        err('สี accent %s บนพื้นขาว/ตัวอักษรขาวบนปุ่ม มี contrast %.2f:1 ต่ำกว่า 4.5:1 (ให้เข้มขึ้น)' % (p['acc'], c))
    for bg in ('acc2', 'soft'):
        c = contrast(p['accd'], p[bg])
        if c < 4.5:
            err('สีตัวอักษร accentDark %s บนพื้น %s (%s) มี contrast %.2f:1 ต่ำกว่า 4.5:1' % (p['accd'], bg, p[bg], c))
    for bg in ('acc2', 'soft'):
        c = contrast('#5d6b82', p[bg])   # --muted
        if c < 4.5:
            err('สีข้อความรอง #5d6b82 บนพื้น %s (%s) มี contrast %.2f:1 ต่ำกว่า 4.5:1' % (bg, p[bg], c))


# ---------- รหัส/ชื่อคะแนนให้ตรงกับ tools/inject_site_meta.py ----------
def inject_expect(outname):
    """ถ้าชื่อไฟล์ผลลัพธ์เข้าแบบที่ inject_site_meta.py รู้จัก คืน (key, id, title|None)"""
    base = os.path.basename(outname)
    m = re.match(r'chemistry-m([56])-ch(\d+)\.html$', base)
    if m:
        gr, ch = m.groups()
        key = ch if gr == '5' else 'm6-' + ch
        sid = 'เคมี ม.%s บทที่ %s' % (gr, ch)
    else:
        m = re.match(r'chemistry-m5-phys-ch(\d+)\.html$', base)
        if not m:
            return None
        key = 'p5-' + m.group(1)
        sid = 'วิทยาศาสตร์กายภาพ ม.5 บทที่ ' + m.group(1)
    title = None
    try:
        src = open(os.path.join(ROOT, 'tools', 'inject_site_meta.py'), encoding='utf8').read()
        blk = re.search(r'M5_TITLES\s*=\s*\{(.*?)\n\}', src, re.S).group(1)
        for k, v in re.findall(r'"([^"]+)":\s*"([^"]+)"', blk):
            if k == key:
                title = v
    except Exception:
        pass
    return key, sid, title


class _Tags(HTMLParser):
    VOID = {'br', 'hr', 'img', 'input', 'meta', 'link', 'wbr', 'col', 'circle', 'rect', 'line', 'path', 'ellipse', 'polygon', 'polyline', 'stop', 'use'}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack, self.errs = [], []

    def handle_starttag(self, tag, attrs):
        if tag not in self.VOID:
            self.stack.append(tag)

    def handle_startendtag(self, tag, attrs):
        pass

    def handle_endtag(self, tag):
        if tag in self.VOID:
            return
        if tag in self.stack:
            while self.stack and self.stack[-1] != tag:
                self.errs.append('ไม่ปิดแท็ก <%s>' % self.stack.pop())
            self.stack.pop()
        else:
            self.errs.append('แท็กปิดเกิน </%s>' % tag)


def check_fragments(frags, err, warn):
    for f in frags:
        h = f['html']
        if re.search(r'<\s*script|on[a-z]+\s*=\s*["\']', h, re.I):
            err('%s: ห้ามมี <script> หรือ on*= ใน HTML ของเนื้อหา' % f['where'])
        p = _Tags()
        try:
            p.feed(h)
            p.close()
        except Exception as e:
            err('%s: HTML อ่านไม่ได้ (%s)' % (f['where'], e))
            continue
        es = p.errs + ['ไม่ปิดแท็ก <%s>' % t for t in p.stack]
        if es:
            err('%s: HTML ไม่สมดุล (%s)' % (f['where'], '; '.join(sorted(set(es)))))
        if re.search(r'(?<![\w.])(undefined|NaN|\[object)\b', h):
            warn('%s: มีข้อความ undefined/NaN/[object' % f['where'])


def check_css(css, err):
    depth = 0
    for ch in re.sub(r'/\*.*?\*/', '', css, flags=re.S):
        if ch == '{':
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth < 0:
                break
    if depth != 0:
        err('kit.css วงเล็บปีกกาไม่สมดุล')


def js_safe(src, name, err):
    if '<!--' in src:
        err('%s มี "<!--" (HTML comment ใน <script> ทำให้ parser เพี้ยน)' % name)
    return src.replace('</script', '<\\/script').replace('</SCRIPT', '<\\/SCRIPT')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('spec')
    ap.add_argument('-o', '--out')
    ap.add_argument('--check', action='store_true', help='ตรวจ spec อย่างเดียว ไม่เขียนไฟล์')
    ap.add_argument('-q', '--quiet', action='store_true')
    a = ap.parse_args()

    spec = a.spec
    if os.path.isdir(spec):
        cpath, lpath = os.path.join(spec, 'content.js'), os.path.join(spec, 'labs.js')
    else:
        cpath, lpath = spec, os.path.join(os.path.dirname(spec), 'labs.js')
    if not os.path.isfile(cpath):
        sys.exit('ไม่พบ ' + cpath)
    if not os.path.isfile(lpath):
        lpath = None

    r = subprocess.run(['node', os.path.join(HERE, 'spec_check.js'), cpath] + ([lpath] if lpath else []),
                       capture_output=True, text=True)
    if r.returncode != 0 or not r.stdout.strip():
        sys.exit('spec_check ล้มเหลว:\n' + r.stderr)
    rep = json.loads(r.stdout)
    errors, warnings = list(rep['errors']), list(rep['warnings'])
    err, warn = errors.append, warnings.append
    page = rep['page']

    if page and re.match(r'^#[0-9a-fA-F]{6}$', str(page.get('accent', ''))) and page.get('id') and page.get('title') and page.get('short'):
        # ชื่อไฟล์ผลลัพธ์ ↔ id หน้า ↔ รหัสส่งคะแนน
        if a.out:
            stem = os.path.splitext(os.path.basename(a.out))[0]
            if stem.startswith('chemistry-') and stem != page['id']:
                err('PAGE.id "%s" ไม่ตรงกับชื่อไฟล์ผลลัพธ์ "%s" (คีย์ localStorage ต้องตรงกับชื่อหน้า)' % (page['id'], stem))
            exp = inject_expect(a.out)
            if exp:
                key, sid, title = exp
                if title is None:
                    warn('ชื่อไฟล์เข้าแบบที่ inject_site_meta.py รู้จัก (key %s) แต่ M5_TITLES ยังไม่มีรายการนี้: เพิ่มก่อน inject' % key)
                if not page.get('scoreId'):
                    page['scoreId'] = sid
                elif page['scoreId'] != sid:
                    err('PAGE.scoreId "%s" ไม่ตรงกับรหัสที่ inject ใช้ "%s"' % (page['scoreId'], sid))
                if title:
                    if not page.get('scoreTitle'):
                        page['scoreTitle'] = title
                    elif page['scoreTitle'] != title:
                        err('PAGE.scoreTitle "%s" ไม่ตรงกับ M5_TITLES "%s"' % (page['scoreTitle'], title))
        page.setdefault('scoreId', page['short'])
        page.setdefault('scoreTitle', page['title'])
        if len(page['scoreId']) > 80:
            err('scoreId ยาวเกิน 80 ตัวอักษร')
        pal = palette(page)
        check_contrast(pal, err)
        check_fragments(rep['fragments'], err, warn)
        kit_css = open(os.path.join(HERE, 'kit.css'), encoding='utf8').read()
        kit_js = open(os.path.join(HERE, 'kit.js'), encoding='utf8').read()
        check_css(kit_css, err)

    for w in warnings:
        if not a.quiet:
            print('คำเตือน:', w, file=sys.stderr)
    if errors:
        print('สร้างหน้าไม่ได้ พบข้อผิดพลาด %d รายการ:' % len(errors), file=sys.stderr)
        for e in errors:
            print('  ✗', e, file=sys.stderr)
        sys.exit(1)
    if a.check:
        print('spec ผ่าน (%d ส่วนคะแนน, %d คำเตือน)' % (len(rep['parts']), len(warnings)))
        return

    root_vars = ':root{' + ''.join('--%s:%s;' % (k, pal[k]) for k in ('acc', 'accd', 'acc2', 'acc3', 'soft', 'line', 'line2', 'line3')) + '}'
    content = js_safe(open(cpath, encoding='utf8').read(), 'content.js', err)
    labs = js_safe(open(lpath, encoding='utf8').read(), 'labs.js', err) if lpath else ''
    if errors:
        for e in errors:
            print('  ✗', e, file=sys.stderr)
        sys.exit(1)
    colj = json.dumps({k: pal[k] for k in ('acc', 'accd', 'acc2', 'acc3', 'soft', 'line')}, separators=(',', ':'))
    out = (
        '<!doctype html>\n<html lang="th">\n<head>\n'
        '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#fff">\n'
        '<title>%s · การทดลองเสมือน</title>\n'
        '<style>\n/* pagekit kit.css */\n%s\n%s</style>\n</head>\n<body>\n'
        '<div id="kit-root"></div>\n'
        '<noscript><p style="padding:16px">หน้านี้ต้องเปิด JavaScript เพื่อแสดงกิจกรรม</p></noscript>\n'
        '<script>\n/* pagekit kit.js */\n%s</script>\n'
        '<script>\n/* content.js */\nwindow.PAGE=(function(){let PAGE;\n%s\n;return PAGE;})();\n</script>\n'
        '%s'
        '<script>\nK.col=%s;window.PAGE.scoreId=%s;window.PAGE.scoreTitle=%s;K.start(window.PAGE);\n</script>\n</body>\n</html>\n'
    ) % (
        html.escape(page['title'], quote=False), root_vars, kit_css, js_safe(kit_js, 'kit.js', err), content,
        ('<script>\n/* labs.js */\n(function(){\'use strict\';const {%s}=K;\n%s\n})();\n</script>\n' % (LAB_PRELUDE, labs)) if labs.strip() else '',
        colj, json.dumps(page['scoreId'], ensure_ascii=False), json.dumps(page['scoreTitle'], ensure_ascii=False),
    )
    for marker in ('<!-- ls:start -->', '<!-- wm:', '<!-- ap:', '<!-- og:', '__LAB_SUBMIT__'):
        if marker in out:
            sys.exit('ผลลัพธ์มี marker ของ inject (%s): ห้ามใส่ใน spec' % marker)
    if a.out:
        with open(a.out, 'w', encoding='utf8', newline='\n') as f:
            f.write(out)
        if not a.quiet:
            print('เขียน %s (%d ไบต์, %d ส่วนคะแนน)' % (a.out, len(out.encode('utf8')), len(rep['parts'])))
    else:
        sys.stdout.write(out)


if __name__ == '__main__':
    main()
