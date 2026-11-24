# Browser tests for Throughline on your own computer (local/throughline.mjs) with Sign in with ChatGPT,
# against a mock of OpenAI's sign-in and Responses API (tools/mock-openai.mjs). Exits non-zero on any failure.
import json, os, pathlib, subprocess, sys, tempfile, time, urllib.request, urllib.error, http.client
from playwright.sync_api import sync_playwright

ROOT = str(pathlib.Path(__file__).resolve().parents[1])
SHOTS = ROOT + '/test-results/shots'
os.makedirs(SHOTS, exist_ok=True)
MOCK, APP = 4791, 4757
BASE, MOCKURL = 'http://127.0.0.1:%d' % APP, 'http://127.0.0.1:%d' % MOCK
HOME = tempfile.mkdtemp(prefix='tl-home-')
results, errors = [], []
def check(name, cond, extra=''):
    results.append((name, bool(cond)))
    print(('PASS ' if cond else 'FAIL ') + name + (('  ' + str(extra)) if extra else ''))
def wait_up(url, t=20):
    end = time.time() + t
    while time.time() < end:
        try: urllib.request.urlopen(url, timeout=1); return True
        except urllib.error.HTTPError: return True
        except Exception: time.sleep(0.2)
    return False
def mock(path):
    return json.loads(urllib.request.urlopen(MOCKURL + path, timeout=5).read())
def start_app():
    env = dict(os.environ, THROUGHLINE_HOME=HOME, THROUGHLINE_TEST_ISSUER=MOCKURL, THROUGHLINE_TEST_API=MOCKURL + '/v1', THROUGHLINE_NO_OPEN='1')
    p = subprocess.Popen(['node', ROOT + '/local/throughline.mjs', '--port', str(APP)], env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    assert wait_up(BASE + '/'), 'the local app did not start'
    return p
def raw(path, headers):
    c = http.client.HTTPConnection('127.0.0.1', APP, timeout=5)
    c.request('GET', path, headers=headers); r = c.getresponse(); r.read(); return r.status

mockp = subprocess.Popen(['node', ROOT + '/tools/mock-openai.mjs', str(MOCK)], stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
assert wait_up(MOCKURL + '/__log')
app = start_app()
try:
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx = browser.new_context(viewport={'width': 1280, 'height': 900})
        ctx.route('https://fonts.googleapis.com/**', lambda r: r.fulfill(status=200, content_type='text/css', body=''))
        ctx.route('https://fonts.gstatic.com/**', lambda r: r.fulfill(status=404, body=''))
        page = ctx.new_page()
        page.on('console', lambda m: errors.append('console.%s: %s' % (m.type, m.text)) if m.type == 'error' and 'Content Security Policy' not in m.text else None)
        page.on('pageerror', lambda e: errors.append('pageerror: %s' % e))
        ev = lambda js: page.evaluate(js)

        # 1. first visit: a welcome that says it runs on the person's own ChatGPT plan, and no Claude anywhere
        page.goto(BASE + '/'); page.wait_for_timeout(1200)
        check('the local app opens with a welcome about their own ChatGPT plan', ev("!document.getElementById('dlg').hidden") and 'Your own ChatGPT plan' in ev("document.getElementById('dlg').textContent")
              and ev("!!document.getElementById('welcomeConnect')"))
        check('it names ChatGPT, not Claude, as the reviewer', ev("document.getElementById('aiName').textContent") == 'ChatGPT' and ev("document.getElementById('reviewBtn').disabled"))
        page.screenshot(path=SHOTS + '/30-local-welcome.png')

        # 2. Continue with ChatGPT: dynamic registration, PKCE, the loopback callback, back to the app
        page.click('#welcomeConnect'); page.wait_for_url(BASE + '/', timeout=15000); page.wait_for_timeout(1200)
        auth = [x for x in mock('/__log') if x['at'] == 'authorize'][-1]['q']
        check('the first sign-in registers dynamically, as OpenAI documents', auth['client_id'] == 'dynamic_agent_client' and auth['agent_name_hint'] == 'Throughline'
              and auth['redirect_uri'] == BASE + '/auth/callback' and auth['code_challenge_method'] == 'S256' and auth['ext_agent_host_id'].startswith('urn:uuid:'), auth)
        check('it comes back connected', 'Connected' in ev("document.getElementById('toast').textContent") and not ev("document.getElementById('reviewBtn').disabled"))
        page.click('#aiBtn'); page.wait_for_timeout(300)
        menu = ev("document.getElementById('aiMenu').textContent")
        check('the AI menu shows the account, the plan’s models and Manage usage', 'tester@example.com' in menu and ev("[...document.querySelectorAll('#gptModel option')].map(o => o.value)") == ['gpt-test-sol', 'gpt-test-luna'] and 'Manage usage' in menu, menu)
        page.select_option('#gptModel', 'gpt-test-luna'); page.wait_for_timeout(400)
        page.keyboard.press('Escape')
        page.screenshot(path=SHOTS + '/31-local-connected.png')

        # 3. a review on the plan: the documented request shape, and marks in the essay
        page.click('#reviewBtn'); page.wait_for_timeout(2500)
        req = [x for x in mock('/__log') if x['at'] == 'responses'][-1]
        check('reviews go to the Responses API with store off and streaming on', req['store'] is False and req['stream'] is True and req['model'] == 'gpt-test-luna' and req['roles'] == ['user']
              and req['keys'] == ['input', 'model', 'store', 'stream'], req)
        check('the review marks the essay', ev("document.querySelectorAll('#backdrop .mk').length") >= 2 and 'Reviewed by ChatGPT' in ev("document.getElementById('rail').textContent"))
        page.screenshot(path=SHOTS + '/32-local-review.png')

        # 4. the page never holds a token
        check('no token ever reaches the page', 'SECRET' not in ev("document.documentElement.outerHTML + JSON.stringify(localStorage)"))
        saved = json.load(open(HOME + '/chatgpt.json'))
        check('only the host id, client id and model are saved on disk', sorted(saved) == ['client_id', 'host_id', 'model'] and saved['client_id'] == 'oaiapp_test' and 'SECRET' not in json.dumps(saved), saved)
        check('the saved file is private to the user', (os.stat(HOME + '/chatgpt.json').st_mode & 0o077) == 0)

        # 5. the server refuses anyone but its own page
        key = ev("window.TL_LOCAL.key")
        check('the API needs this run’s key', raw('/api/state', {'Host': '127.0.0.1:%d' % APP}) == 403 and raw('/api/state', {'Host': '127.0.0.1:%d' % APP, 'X-Throughline-Key': key}) == 200)
        check('another host name is refused (no DNS rebinding)', raw('/', {'Host': 'evil.example:%d' % APP}) == 421)
        check('another site can’t use it even with the key', raw('/api/state', {'Host': '127.0.0.1:%d' % APP, 'X-Throughline-Key': key, 'Origin': 'https://evil.example'}) == 403)
        check('a callback with the wrong state is refused', raw('/auth/callback?state=nope&code=x', {'Host': '127.0.0.1:%d' % APP}) == 400)

        # 6. ChatGPT errors reach the writer in plain words
        mock('/__mode?limit=1')
        page.click('#reviewBtn'); page.wait_for_timeout(1500)
        check('a usage limit says so plainly', 'usage limit' in ev("document.getElementById('rail').textContent + document.getElementById('toast').textContent"))
        mock('/__mode')

        # 7. an expiring token is refreshed (rotating) before the next request
        page.click('#aiBtn'); page.wait_for_timeout(200); page.click('#gptDisconnect'); page.wait_for_timeout(600); page.keyboard.press('Escape')
        check('Disconnect revokes and signs out', any(x['at'] == 'revoke' for x in mock('/__log')) and ev("document.getElementById('reviewBtn').disabled"))
        mock('/__mode?short=1')
        page.click('#aiBtn'); page.wait_for_timeout(200); page.click('#gptConnect'); page.wait_for_url(BASE + '/', timeout=15000); page.wait_for_timeout(1000)
        auth2 = [x for x in mock('/__log') if x['at'] == 'authorize'][-1]['q']
        check('a later sign-in reuses the issued client id', auth2['client_id'] == 'oaiapp_test' and 'agent_name_hint' not in auth2, auth2)
        page.wait_for_timeout(1500)   # the short token has run out
        page.click('#reviewBtn'); page.wait_for_timeout(2500)
        grants = [x['grant'] for x in mock('/__log') if x['at'] == 'token']
        check('a token about to expire is refreshed first', grants == ['authorization_code', 'refresh_token'], grants)
        mock('/__mode')

        # 8. declining, and signing in without allowing plan use
        page.click('#aiBtn'); page.wait_for_timeout(200); page.click('#gptDisconnect'); page.wait_for_timeout(500); page.keyboard.press('Escape')
        mock('/__mode?decline=1')
        page.click('#aiBtn'); page.wait_for_timeout(200); page.click('#gptConnect'); page.wait_for_url(BASE + '/', timeout=15000); page.wait_for_timeout(900)
        check('cancelling sign-in is reported', 'cancelled' in ev("document.getElementById('toast').textContent"))
        mock('/__mode?noplan=1')
        page.click('#aiBtn'); page.wait_for_timeout(200); page.click('#gptConnect'); page.wait_for_url(BASE + '/', timeout=15000); page.wait_for_timeout(900)
        page.click('#aiBtn'); page.wait_for_timeout(300)
        check('signing in without allowing plan use asks for it', 'Allow plan use' in ev("document.getElementById('aiMenu').textContent") and ev("document.getElementById('reviewBtn').disabled"))
        mock('/__mode')

        # 9. a restart forgets the sign-in but keeps the essays (they live in this browser)
        page.keyboard.press('Escape')
        page.click('#docBtn'); page.wait_for_timeout(200); page.click('#docMenu button:has-text("New essay")'); page.wait_for_timeout(300)
        page.keyboard.type('Kept on this computer'); page.keyboard.press('Enter'); page.keyboard.type('Some words.'); page.wait_for_timeout(1500)
        app.terminate(); app.wait(10)
        page.wait_for_timeout(300)
        page.click('#aiBtn'); page.wait_for_timeout(200)
        app = start_app()
        page.goto(BASE + '/'); page.wait_for_timeout(1200)
        check('after a restart the sign-in is gone (tokens were only in memory)', ev("document.getElementById('reviewBtn').disabled"))
        page.click('#docBtn'); page.wait_for_timeout(200)
        check('and the essays are still here', 'Kept on this computer' in ev("document.getElementById('docMenu').textContent"))
        browser.close()
finally:
    app.terminate(); mockp.terminate()

check('no console errors', not errors, errors[:5])
failed = [n for n, ok in results if not ok]
print('\n%d/%d checks passed' % (len(results) - len(failed), len(results)))
sys.exit(1 if failed else 0)
