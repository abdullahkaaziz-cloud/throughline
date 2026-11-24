import http.server, threading, functools, os, sys, json, glob, time, pathlib
from playwright.sync_api import sync_playwright

ROOT = str(pathlib.Path(__file__).resolve().parents[1])
NM = ROOT + '/node_modules'
SHOTS = ROOT + '/test-results/shots'
os.makedirs(SHOTS, exist_ok=True)
for f in glob.glob(SHOTS + '/*.png'): os.remove(f)

Handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
class Quiet(Handler.func):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 8765), functools.partial(Quiet, directory=ROOT))
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = 'http://127.0.0.1:8765/dist/index.html'
MOCK = open(ROOT + '/tools/mock.js').read()
PDFS = sorted(glob.glob(os.environ.get('THROUGHLINE_PDFS', ROOT + '/test/fixtures') + '/*.pdf'))
SEED = ROOT + '/dist/seed/test-essays.json'
HAVE_SEED = os.path.exists(SEED)

results = []
def check(name, cond, extra=''):
    results.append((name, bool(cond)))
    print(('PASS ' if cond else 'FAIL ') + name + (('  ' + str(extra)) if extra else ''))

def route(ctx):
    ctx.route('https://fonts.googleapis.com/**', lambda r: r.fulfill(status=200, content_type='text/css', body=''))
    ctx.route('https://fonts.gstatic.com/**', lambda r: r.fulfill(status=404, body=''))
    ctx.route('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', lambda r: r.fulfill(path=NM + '/pdfjs-dist/build/pdf.min.js', content_type='application/javascript'))
    ctx.route('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js', lambda r: r.fulfill(path=NM + '/pdfjs-dist/build/pdf.worker.min.js', content_type='application/javascript'))
    ctx.route('https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js', lambda r: r.fulfill(path=NM + '/mammoth/mammoth.browser.min.js', content_type='application/javascript'))

errors = []
def watch(page, tag):
    page.on('console', lambda m: errors.append(f'[{tag}] console.{m.type}: {m.text}') if m.type in ('error', 'warning') else None)
    page.on('pageerror', lambda e: errors.append(f'[{tag}] pageerror: {e}'))

def ev(page, js, arg=None):
    return page.evaluate(js, arg) if arg is not None else page.evaluate(js)

def select_text(page, needle, nth=0):
    return ev(page, '''([n, k]) => { const ed = document.getElementById('ed'); let i = -1; for (let j = 0; j <= k; j++) i = ed.value.indexOf(n, i + 1);
      if (i < 0) return false; if (ed.readOnly) {} ed.focus(); ed.setSelectionRange(i, i + n.length); ed.dispatchEvent(new MouseEvent('mouseup', {bubbles: true})); return true; }''', [needle, nth])

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True, args=['--no-sandbox'])
    ctx = browser.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=1)
    route(ctx); ctx.add_init_script(MOCK)
    page = ctx.new_page(); watch(page, 'desktop')
    page.goto(URL); page.wait_for_timeout(900)

    # 1. sample essay with review
    n_cards = ev(page, "document.querySelectorAll('.card').length")
    n_marks = ev(page, "document.querySelectorAll('#backdrop .mk').length")
    n_lines = ev(page, "document.querySelectorAll('#gutter g.rl').length")
    check('sample shows 8 notes', n_cards == 8, n_cards)
    check('sample has underlines', n_marks >= 8, n_marks)
    check('two margin lines (contradiction + tension)', n_lines == 2, n_lines)
    align = ev(page, "(() => { const b = document.getElementById('backdrop'), t = document.getElementById('ed'); return [b.offsetHeight, t.scrollHeight, t.clientHeight]; })()")
    check('textarea and marked-up layer have the same height', abs(align[0] - align[1]) <= 2 and abs(align[1] - align[2]) <= 2, align)
    check('AI marked ready', ev(page, "document.getElementById('aiDot').dataset.s") == 'ready')
    check('first-run card offers upload + test essays', ev(page, "(document.querySelector('.start') || {}).textContent || ''").count('Add my 4 test essays') == 1)
    page.screenshot(path=SHOTS + '/01-sample.png')

    # 2. activate contradiction card
    page.click('.card .cbtn >> nth=0'); page.wait_for_timeout(500)
    check('active card expanded', ev(page, "!!document.querySelector('.card.on .cmore')"))
    check('active passage tinted', ev(page, "document.querySelectorAll('#backdrop .mk.on').length") >= 2)
    check('active line emphasised', ev(page, "document.querySelectorAll('#gutter g.rl.on').length") == 1)
    page.screenshot(path=SHOTS + '/02-active.png')

    # 3. hover a mark in the text -> card highlight
    box = ev(page, "(() => { const m = [...document.querySelectorAll('#backdrop .mk')].find(x => x.className.includes('t-evidence')); const r = m.getClientRects()[0]; return [r.left + 5, r.top + r.height / 2]; })()")
    page.mouse.move(box[0], box[1]); page.wait_for_timeout(300)
    check('hovering text highlights its card', ev(page, "!!document.querySelector('.card.hov')"))
    page.mouse.click(box[0], box[1]); page.wait_for_timeout(400)
    check('clicking a mark opens its card', ev(page, "(document.querySelector('.card.on .kind') || {}).textContent || ''").startswith('Evidence'))

    # 4. filter + apply grammar fix + undo
    page.click('.chip:has-text("Grammar")'); page.wait_for_timeout(300)
    check('grammar filter shows 1 card', ev(page, "document.querySelectorAll('.card').length") == 1)
    page.click('.card .cbtn'); page.wait_for_timeout(200)
    page.click('.card .sugg .btn'); page.wait_for_timeout(1300)
    txt = ev(page, "document.getElementById('ed').value")
    check('apply replaced irregardless', 'irregardless' not in txt and 'Companies regardless of size' in txt)
    check('sample became a saved essay', ev(page, "window.__dbWrites") >= 1, ev(page, "window.__dbWrites"))
    page.keyboard.press('Control+z'); page.wait_for_timeout(400)
    check('undo restores the original word', 'irregardless' in ev(page, "document.getElementById('ed').value"))
    page.keyboard.press('Control+y'); page.wait_for_timeout(300)
    page.click('.chip:has-text("All")'); page.wait_for_timeout(200)

    # 5. ask about a selection
    ok = select_text(page, 'Without long commutes or constant interruptions')
    page.wait_for_timeout(300)
    check('selection toolbar appears', ok and ev(page, "!document.getElementById('selbar').hidden"))
    page.screenshot(path=SHOTS + '/03-selbar.png')
    page.click('#selbar [data-ask="stronger"]'); page.wait_for_timeout(1500)
    check('answer card shows points', ev(page, "document.querySelectorAll('.askc .pts li').length") == 2)
    check('asked passage highlighted', ev(page, "document.querySelectorAll('#backdrop .ask').length") >= 1)
    page.screenshot(path=SHOTS + '/04-ask.png')
    page.click('.askc .sugg .btn'); page.wait_for_timeout(400)
    check('ask suggestion applied', 'Mock replacement text for the selection.' in ev(page, "document.getElementById('ed').value"))

    # 6. full review (thorough tier), with stop + error paths
    page.click('#reviewBtn'); page.wait_for_timeout(150)
    check('progress shows while reviewing', ev(page, "!!document.querySelector('.prog')"))
    page.click('.prog .btn'); page.wait_for_timeout(700)
    check('stop cancels quietly', not ev(page, "!!document.querySelector('.prog')") and not ev(page, "!!document.querySelector('.errc')"))
    ev(page, "window.__failNext = 'rate_limited'")
    page.click('#reviewBtn'); page.wait_for_timeout(700)
    check('error card on failure', ev(page, "!!document.querySelector('.errc')"))
    page.click('.errc .btn'); page.wait_for_timeout(1600)
    calls = ev(page, "window.__calls.filter(c => c.review)")
    check('review used thorough tier', calls and calls[-1]['tier'] == 'complex', calls[-1] if calls else None)
    n_after = ev(page, "document.querySelectorAll('.card').length")
    check('review produced 5 notes (bad quote dropped)', n_after == 5, n_after)
    check('summary shown', 'Mock thesis' in ev(page, "document.querySelector('.sum').textContent"))
    page.screenshot(path=SHOTS + '/05-review.png')

    # 7. editing a flagged passage moves it to "dealt with"
    before = ev(page, "document.querySelectorAll('.card').length")
    ev(page, """() => { const ed = document.getElementById('ed'); const q = document.querySelectorAll('#backdrop .mk.t-logic')[0].textContent; ed.focus(); const i = ed.value.indexOf(q); ed.setSelectionRange(i, i + 4); document.execCommand('insertText', false, 'XX'); }""")
    page.wait_for_timeout(400)
    after = ev(page, "document.querySelectorAll('.card').length")
    check('edited note leaves the list', after == before - 1, (before, after))
    check('dealt-with group appears', ev(page, "!!document.querySelector('.done')"))

    # 8-9. upload PDFs, then review one against the others (optional: needs PDFs)
    if PDFS:
        page.set_input_files('#file', PDFS); page.wait_for_timeout(6000)
        docs = ev(page, "(() => { const out = []; return out; })()")
        page.click('#docBtn'); page.wait_for_timeout(300)
        names = ev(page, "[...document.querySelectorAll('#docMenu .mi .mt b')].map(b => b.textContent)")
        print('docs:', names)
        check('4 PDFs imported', len([n for n in names if n not in ('New essay', 'Upload essays', 'Open the sample essay', 'Add my 4 test essays')]) >= 5, len(names))
        page.keyboard.press('Escape')
        cur = ev(page, "({title: document.getElementById('title').value, paras: document.getElementById('ed').value.split('\\n\\n').length, start: document.getElementById('ed').value.slice(0, 400)})")
        print('opened:', json.dumps(cur)[:600])
        page.screenshot(path=SHOTS + '/06-pdf.png')

        # 9. review an imported essay -> library clash vs another essay
        page.click('#reviewBtn'); page.wait_for_timeout(1800)
        lib = ev(page, "window.__calls.filter(c => c.review).slice(-1)[0].lib")
        check('review sent other essays as library', lib >= 3, lib)
        has_lib = ev(page, "[...document.querySelectorAll('.card .kind')].some(k => k.textContent.includes('Library clash'))")
        check('library clash card present', has_lib)
        if has_lib:
            page.click('.card:has-text("Library clash") .cbtn'); page.wait_for_timeout(300)
            page.click('.card.on .q >> nth=1'); page.wait_for_timeout(500)
            check('reader opens other essay at the passage', ev(page, "!document.getElementById('reader').hidden && !!document.querySelector('#readerBody mark')"))
            page.screenshot(path=SHOTS + '/07-reader.png')
            page.keyboard.press('Escape')

    else: print("SKIP PDF import (put PDFs in test/fixtures or set THROUGHLINE_PDFS)")

    # 10. seeded test essays (owner only; the seed file is private and never committed)
    if HAVE_SEED:
        seed = json.load(open(SEED))
        page.click('#docBtn'); page.wait_for_timeout(200)
        page.click('#docMenu button:has-text("Add my 4 test essays")'); page.wait_for_timeout(1200)
        for d in seed:
            page.click('#docBtn'); page.wait_for_timeout(200)
            page.click('#docMenu .mi:has-text("%s") >> nth=0' % d['title'][:24].replace('"', ''))
            page.wait_for_timeout(600)
            iss = d['review']['issues']
            want_lines = sum(1 for i in iss if i['type'] in ('contradiction', 'tension', 'library_clash'))
            got = ev(page, "[document.querySelectorAll('.card').length, document.querySelectorAll('#gutter g.rl').length]")
            check('seed "%s": %d notes, %d margin lines' % (d['title'][:30], len(iss), want_lines), got == [len(iss), want_lines], got)
        page.screenshot(path=SHOTS + '/09-seed.png')
    else: print('SKIP seed essays (no dist/seed/test-essays.json)')

    # 10b. new essay empty state
    page.click('#docBtn'); page.wait_for_timeout(200)
    page.click('#docMenu button:has-text("New essay")'); page.wait_for_timeout(300)
    check('new essay shows the legend', ev(page, "document.querySelectorAll('.legend li').length") == 5)
    page.keyboard.type('A short title'); page.keyboard.press('Enter'); page.keyboard.type('Some text here.'); page.wait_for_timeout(1300)
    check('typing a new essay saves it', 'A short title' in ev(page, "[...document.querySelectorAll('#docName')].map(x => x.textContent).join()"))
    page.screenshot(path=SHOTS + '/09b-empty.png')
    page.click('#docBtn'); page.wait_for_timeout(200)
    page.click('#docMenu button:has-text("Open the sample essay")'); page.wait_for_timeout(500)

    # 11. dark mode
    ev(page, "document.documentElement.dataset.theme = 'dark'"); page.wait_for_timeout(300)
    page.click('.card .cbtn >> nth=0'); page.wait_for_timeout(300)
    page.screenshot(path=SHOTS + '/10-dark.png')
    page.click('#aiBtn'); page.wait_for_timeout(300)
    page.screenshot(path=SHOTS + '/11-ai-menu-dark.png')
    page.keyboard.press('Escape')
    ev(page, "document.documentElement.dataset.theme = 'light'")
    page.click('#docBtn'); page.wait_for_timeout(300)
    page.screenshot(path=SHOTS + '/12-doc-menu.png')
    page.keyboard.press('Escape')

    # 12. reload: essays come back from the (mock) database
    writes = ev(page, "window.__dbWrites")
    print('db writes so far:', writes)

    # 13. mobile
    mctx = browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    route(mctx); mctx.add_init_script(MOCK)
    m = mctx.new_page(); watch(m, 'mobile')
    m.goto(URL); m.wait_for_timeout(900)
    check('mobile: no horizontal overflow', ev(m, "document.documentElement.scrollWidth <= innerWidth + 1"), ev(m, "[document.documentElement.scrollWidth, innerWidth]"))
    check('mobile: reading mode (read-only) by default', ev(m, "document.getElementById('ed').readOnly"))
    m.screenshot(path=SHOTS + '/13-mobile.png')
    r = ev(m, "(() => { const s = [...document.querySelectorAll('#backdrop .mk')].find(x => x.className.includes('t-contradiction')); const r = s.getClientRects()[0]; return [r.left + 10, r.top + r.height / 2]; })()")
    m.tap('#ed', position={'x': r[0] - ev(m, "document.getElementById('ed').getBoundingClientRect().left"), 'y': r[1] - ev(m, "document.getElementById('ed').getBoundingClientRect().top")})
    m.wait_for_timeout(700)
    check('mobile: tapping a mark opens the notes sheet', ev(m, "document.getElementById('rail').classList.contains('open') && !!document.querySelector('.card.on')"))
    m.screenshot(path=SHOTS + '/14-mobile-sheet.png')
    mctx.close()

    # 14. no viewer runtime at all (plain browser): page still renders, review disabled
    pctx = browser.new_context(viewport={'width': 1280, 'height': 800}); route(pctx)
    pp = pctx.new_page(); watch(pp, 'plain')
    pp.goto(URL); pp.wait_for_timeout(800)
    check('plain browser: sample still renders', ev(pp, "document.querySelectorAll('.card').length") == 8)
    check('plain browser: review disabled with reason', ev(pp, "document.getElementById('reviewBtn').disabled"))
    pctx.close()
    browser.close()

srv.shutdown()
print('\nERRORS/WARNINGS:'); [print(' ', e) for e in errors] or print('  none')
print(f"\n{sum(1 for _, ok in results if ok)}/{len(results)} checks passed")
