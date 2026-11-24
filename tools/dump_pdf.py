import http.server, threading, functools, glob, json, os, pathlib
from playwright.sync_api import sync_playwright
ROOT=str(pathlib.Path(__file__).resolve().parents[1]); NM=ROOT+'/node_modules'; OUT=ROOT+'/test-results/pdf-out'; os.makedirs(OUT, exist_ok=True)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8766),functools.partial(Q,directory=ROOT)); threading.Thread(target=srv.serve_forever,daemon=True).start()
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',headless=True,args=['--no-sandbox']); c=b.new_context()
    c.route('https://fonts.googleapis.com/**',lambda r:r.fulfill(status=200,content_type='text/css',body=''))
    c.route('https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js',lambda r:r.fulfill(path=NM+'/pdfjs-dist/build/pdf.min.js',content_type='application/javascript',headers={'Access-Control-Allow-Origin':'*'}))
    c.route('https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js',lambda r:r.fulfill(path=NM+'/pdfjs-dist/build/pdf.worker.min.js',content_type='application/javascript',headers={'Access-Control-Allow-Origin':'*'}))
    c.add_init_script(open(ROOT+'/tools/mock.js').read())
    pg=c.new_page(); pg.goto('http://127.0.0.1:8766/dist/index.html'); pg.wait_for_timeout(600)
    for f in sorted(glob.glob(os.environ.get('THROUGHLINE_PDFS', ROOT+'/test/fixtures')+'/*.pdf')):
        pg.set_input_files('#file',[f]); pg.wait_for_timeout(2500)
        t=pg.evaluate("({title: document.getElementById('title').value, text: document.getElementById('ed').value})")
        name=os.path.basename(f)[:-4]
        open(f'{OUT}/{name}.txt','w').write('TITLE: '+t['title']+'\n\n'+t['text'])
        paras=t['text'].split('\n\n')
        print(f"{name}: title={t['title']!r} paras={len(paras)} words={len(t['text'].split())} notes={'Notes' in paras}")
    b.close()
srv.shutdown()
