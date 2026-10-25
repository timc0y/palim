"""Disposable local workerd/D1/R2/OAuth proof; never deploys or sends real mail."""
import base64
import glob
import hashlib
import html
import json
import os
from pathlib import Path
import re
import secrets
import sqlite3
import ssl
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / '.local' / ('runtime-proof-' + secrets.token_hex(5))
WORK.mkdir(parents=True)
ARTIFACTS = ROOT / 'artifacts'
ARTIFACTS.mkdir(exist_ok=True)
ORIGIN = 'https://localhost:8791'
CONFIG = json.loads((ROOT / 'wrangler.jsonc').read_text())
CONFIG['name'] = 'palim-native-proof'
# A disposable wrapper replaces only the external mail boundary. Product code has no fixture flag.
wrapper = WORK / 'capture-worker.ts'
wrapper.write_text("import app from " + json.dumps(str(ROOT / 'src/index.ts')) + ";\nexport default { fetch(request, env, ctx) { const local = {...env, EMAIL: { async send(payload) { await env.DB.prepare('INSERT INTO proof_mail(payload) VALUES(?)').bind(JSON.stringify(payload)).run(); return {messageId: crypto.randomUUID()}; } }}; return app.fetch(request, local, ctx); }, scheduled: app.scheduled };\n")
CONFIG['main'] = str(wrapper)
CONFIG['assets']['directory'] = str(ROOT / 'public')
CONFIG['d1_databases'][0]['migrations_dir'] = str(ROOT / 'migrations')
CONFIG['vars'] = {'ORIGIN': ORIGIN, 'SENDER': 'fixture@example.invalid', 'SIGNING_SECRET': secrets.token_hex(32), 'AUTH_SECRET': secrets.token_hex(32), 'FILE_ORIGINS': ''}
CONFIG.pop('triggers', None)
CONFIG['dev'] = {'local_protocol': 'https', 'upstream_protocol': 'https'}
config_path = WORK / 'wrangler.json'
config_path.write_text(json.dumps(CONFIG))
state = WORK / 'state'
command = ['node', str(ROOT / 'node_modules/wrangler/bin/wrangler.js')]
environment = dict(os.environ, WRANGLER_SEND_METRICS='false', CLOUDFLARE_CF_FETCH_ENABLED='false', CI='true')
log = (WORK / 'worker.log').open('w')
subprocess.run(command + ['d1', 'migrations', 'apply', 'palim', '--local', '--config', str(config_path), '--persist-to', str(state)], cwd=WORK, env=environment, stdout=log, stderr=log, check=True)
serve_cwd = WORK
if '--pages' in sys.argv:
    pages_config = json.loads((ROOT / 'pages/wrangler.jsonc').read_text())
    pages_config['pages_build_output_dir'] = str(ROOT / 'pages/public')
    pages_config['services'][0]['service'] = CONFIG['name']
    pages_config['dev'] = {'local_protocol': 'https', 'upstream_protocol': 'https'}
    pages_path = WORK / 'pages' / 'wrangler.json'
    pages_path.parent.mkdir()
    pages_path.write_text(json.dumps(pages_config))
    serve_cwd = pages_path.parent
    serve = ['pages', 'dev', '--config', str(pages_path), '--config', str(config_path)]
else:
    serve = ['dev', '--local', '--config', str(config_path)]
process = subprocess.Popen(command + serve + ['--local-protocol', 'https', '--port', '8791', '--ip', '127.0.0.1', '--persist-to', str(state)], cwd=serve_cwd, env=environment, stdout=log, stderr=log)

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None

# Only this disposable loopback Worker uses a self-signed development certificate.
opener = urllib.request.build_opener(NoRedirect, urllib.request.HTTPSHandler(context=ssl._create_unverified_context()))
cookies = []

def request(path, method='GET', body=None, content_type=None, headers=None):
    assert path.startswith('/') and not path.startswith('//')
    values = {'Origin': ORIGIN, 'Cookie': '; '.join(cookies)}
    if content_type:
        values['Content-Type'] = content_type
    values.update(headers or {})
    try:
        response = opener.open(urllib.request.Request(ORIGIN + path, data=body, method=method, headers=values), timeout=30)
    except urllib.error.HTTPError as error:
        response = error
    for item in response.headers.get_all('Set-Cookie', []):
        first = item.split(';', 1)[0]
        name = first.split('=', 1)[0]
        cookies[:] = [c for c in cookies if not c.startswith(name + '=')]
        cookies.append(first)
    return response.status, response.headers, response.read()

def post(path, value, headers=None):
    return request(path, 'POST', json.dumps(value).encode(), 'application/json', headers)

def contrast(foreground, background):
    def light(value):
        channels = [int(x)/255 for x in re.findall(r'\d+',value)[:3]]
        channels = [v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4 for v in channels]
        return sum(v*w for v,w in zip(channels,[.2126,.7152,.0722]))
    lo,hi=sorted([light(foreground),light(background)])
    return (hi+.05)/(lo+.05)

try:
    for attempt in range(80):
        if process.poll() is not None:
            raise RuntimeError('Local Worker exited; inspect the disposable worker.log.')
        try:
            if request('/')[0] == 200:
                break
        except OSError:
            pass
        time.sleep(0.5)
    else:
        raise RuntimeError('Local Worker did not become ready.')

    database = None
    for path in glob.glob(str(state / 'v3/d1/miniflare-D1DatabaseObject/*.sqlite')):
        candidate = sqlite3.connect(path, timeout=30)
        if candidate.execute("SELECT name FROM sqlite_master WHERE name='users'").fetchone():
            database = candidate
            break
        candidate.close()
    if '--origin-only' in sys.argv:
        # This safe regression branch exits before any login, registration or OAuth consent.
        from playwright.sync_api import sync_playwright
        with sync_playwright() as runner:
            browser = runner.chromium.launch()
            page = browser.new_page(ignore_https_errors=True, viewport={'width':390,'height':844})
            response = page.goto(ORIGIN + '/app', wait_until='networkidle')
            assert response.headers['referrer-policy'] == 'same-origin'
            with page.expect_response(lambda r: r.request.method == 'POST' and r.url == ORIGIN + '/auth/sign-in/email-otp') as posted:
                page.evaluate("() => { const form=document.createElement('form'); form.method='post'; form.action='/auth/sign-in/email-otp'; document.body.append(form); form.submit(); }")
            result = posted.value
            assert result.request.all_headers()['origin'] == ORIGIN
            assert result.request.all_headers()['sec-fetch-site'] == 'same-origin'
            assert result.status == 400 and result.json()['code'] == 'INVALID_JSON'
            browser.close()
        for bad_origin in ['null', 'https://foreign.invalid', '']:
            assert post('/auth/sign-in/email-otp', {}, {'Origin':bad_origin})[0] == 403
        assert post('/auth/sign-in/email-otp', {}, {'Sec-Fetch-Site':'cross-site'})[0] == 403
        assert database.execute('SELECT count(*) FROM auth_users').fetchone()[0] == 0
        assert database.execute('SELECT count(*) FROM mail_attempts').fetchone()[0] == 0
        print('PASS: real browser form Origin and hostile-origin refusal; no accounts, email, client registration or OAuth grants created.')
        sys.exit(0)
    if '--saved-addresses-only' in sys.argv:
        # Isolated browser-session fixtures, never OAuth registration/consent or sign-in email.
        from playwright.sync_api import sync_playwright, expect
        def fixture_session(owner):
            stamp = int(time.time() * 1000)
            raw = secrets.token_hex(32)
            database.execute('INSERT INTO users(id,name,created_at) VALUES(?,?,?)', (owner, owner, stamp // 1000))
            database.execute('INSERT INTO auth_users(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,?,?)', (owner, owner, owner + '@example.invalid', stamp, stamp))
            database.execute('INSERT INTO auth_sessions(id,expiresAt,token,createdAt,updatedAt,userId) VALUES(?,?,?,?,?,?)', (secrets.token_hex(16), stamp + 600000, raw, stamp, stamp, owner))
            database.commit()
            script = "import {serializeSignedCookie} from 'better-call'; let text='';for await(const chunk of process.stdin)text+=chunk;const value=JSON.parse(text);console.log((await serializeSignedCookie('__Host-palim',value.token,value.key,{secure:true,httpOnly:true,sameSite:'lax',path:'/'})).split(';')[0]);"
            return subprocess.check_output(['node', '--input-type=module', '-e', script], input=json.dumps({'token':raw, 'key':CONFIG['vars']['AUTH_SECRET']}).encode(), cwd=ROOT, env=environment).decode().strip()
        owner_cookie = fixture_session('saved-address-fixture')
        foreign_cookie = fixture_session('other-address-fixture')
        database.execute('CREATE TABLE proof_mail(payload TEXT NOT NULL)')
        database.commit()
        cookies[:] = [owner_cookie]
        with sync_playwright() as runner:
            browser = runner.chromium.launch()
            context = browser.new_context(ignore_https_errors=True, viewport={'width':390,'height':844})
            context.add_cookies([{'name':'__Host-palim','value':owner_cookie.split('=',1)[1],'url':ORIGIN,'httpOnly':True,'secure':True,'sameSite':'Lax'}])
            page = context.new_page()
            page.goto(ORIGIN + '/app', wait_until='networkidle')
            page.locator('#desk').wait_for(state='visible')
            for label, address in [('Bedside','palim-address-fixture-bedside@kindle.com'), ('Travel','palim-address-fixture-travel@kindle.com')]:
                page.locator('#setup-details').evaluate('(e)=>e.open=true')
                page.locator('#reader-label').fill(label)
                page.locator('#kindle-email').fill(address)
                page.locator('#destination-form button').click()
                expect(page.locator('#reader-list')).to_contain_text(label)
            expect(page.locator('#reader-list .reader-item')).to_have_count(2)
            expect(page.locator('#destination-status')).to_contain_text('2 saved')
            expect(page.locator('#confirm-form')).to_be_hidden()
            rows = json.loads(request('/api/account')[2])['destinations']
            assert all(not row['confirmed'] for row in rows)
            travel = next(row for row in rows if row['label'] == 'Travel')
            page.locator('#reader-list .reader-item').filter(has_text='Travel').get_by_role('button',name='Make default').click()
            expect(page.locator('#reader-list .reader-item').filter(has_text='Travel')).to_contain_text('Default')
            assert json.loads(request('/api/account')[2])['defaultDestinationId'] == travel['id']
            for width,height,label in [(390,844,'mobile'),(1440,1000,'desktop')]:
                page.set_viewport_size({'width':width,'height':height})
                assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
                page.locator('.reader-panel').screenshot(path=str(ARTIFACTS / f'saved-readers-{label}.png'))
            page.locator('#title').fill('Saved-address proof')
            page.locator('#manuscript').fill('A local synthetic draft. No email was requested.')
            page.locator('#create-form button[type=submit]').click()
            page.locator('#created a.button').first.wait_for()
            page.locator('#created-reader').select_option(travel['id'])
            expect(page.locator('#created .send-target')).to_contain_text(travel['email'])
            expect(page.locator('#created .send-action')).to_have_text('Verify before sending')
            page.locator('#created .send-action').click()
            assert page.locator('#verify-reader-' + travel['id']).evaluate('(e)=>e===document.activeElement')
            artifact = json.loads(request('/api/account')[2])['artifacts'][0]
            status,_,payload = post('/api/send', {'artifactId':artifact['artifactId'], 'destinationId':travel['id']})
            assert status == 400 and json.loads(payload)['code'] == 'READER_UNCONFIRMED'
            page.set_viewport_size({'width':390,'height':844})
            page.locator('#created').screenshot(path=str(ARTIFACTS / 'saved-reader-send-mobile.png'))
            assert database.execute('SELECT count(*) FROM proof_mail').fetchone()[0] == 0
            assert database.execute('SELECT count(*) FROM mail_attempts').fetchone()[0] == 0
            assert database.execute('SELECT count(*) FROM challenges').fetchone()[0] == 0
            browser.close()
        cookies[:] = [foreign_cookie]
        assert json.loads(request('/api/account')[2])['destinations'] == []
        assert post('/api/destinations/' + travel['id'] + '/default', {})[0] == 404
        assert request('/api/destinations/' + travel['id'], 'DELETE')[0] == 404
        print('PASS: native Pages save/list/default/selection and pending-send refusal; seeded local browser sessions, zero email, no OAuth client registration or grants.')
        sys.exit(0)
    import io, zipfile
    status, bundle_headers, bundle = request('/palim-plugin.zip')
    assert status == 200
    assert 'zip' in bundle_headers.get('Content-Type', '')
    assert hashlib.sha256(bundle).hexdigest() in request('/palim-plugin.sha256')[2].decode()
    with zipfile.ZipFile(io.BytesIO(bundle)) as plugin:
        manifest = json.loads(plugin.read('.codex-plugin/plugin.json'))
        connection = json.loads(plugin.read('.mcp.json'))
        assert manifest['mcpServers'] == './.mcp.json'
        assert 'skills' not in manifest
        assert 'extensions' not in manifest
        assert connection['mcpServers']['palim']['url'] == json.loads((ROOT / 'wrangler.jsonc').read_text())['vars']['ORIGIN'] + '/mcp'
        assert not any(name.startswith(('skills/', 'hooks/')) for name in plugin.namelist())
    print('Complete single-install plugin ZIP and checksum served through real response headers.')
    assert database is not None, 'Local D1 schema missing'
    now = int(time.time())
    database.execute('CREATE TABLE proof_mail(payload TEXT NOT NULL)')
    database.commit()
    def login(email, ip='192.0.2.10'):
        assert post('/auth/email-otp/send-verification-otp', {'email': email, 'type': 'sign-in'}, {'CF-Connecting-IP': ip})[0] == 200
        mail = json.loads(database.execute('SELECT payload FROM proof_mail ORDER BY rowid DESC LIMIT 1').fetchone()[0])
        assert mail['to'] == email
        code = re.search(r'code is (\d{6})', mail['text']).group(1)
        stored = database.execute('SELECT value FROM auth_verifications ORDER BY rowid DESC LIMIT 1').fetchone()[0]
        assert code not in stored, 'OTP must be encrypted in D1'
        status, headers, body = post('/auth/sign-in/email-otp', {'email': email, 'otp': code}, {'CF-Connecting-IP': ip})
        assert status == 200, (status, body)
        cookie = next(c for c in headers.get_all('Set-Cookie', []) if c.startswith('__Host-palim='))
        for attr in ['Secure', 'HttpOnly', 'SameSite=Lax', 'Path=/']:
            assert attr in cookie
        assert 'Domain=' not in cookie
        assert post('/auth/sign-in/email-otp', {'email': email, 'otp': code}, {'CF-Connecting-IP': ip})[0] >= 400
        assert request('/api/account')[0] == 200
        return json.loads(body)['user']['id']
    owner = login('reader@example.invalid')
    alice_cookie = cookies.copy()
    token = next(c.split('=', 1)[1] for c in cookies if c.startswith('__Host-palim='))
    assert request('/app')[0] == 200, 'Workspace asset redirect loop'
    assert request('/mcp')[0] == 401, 'Unauthenticated MCP must be refused'
    status, _, metadata = request('/.well-known/oauth-authorization-server')
    assert status == 200 and json.loads(metadata)['issuer'] == ORIGIN
    assert request('/api/account')[0] == 200
    assert request('/api/account', headers={'Cookie': ''})[0] == 401
    assert request('/', headers={'Host': 'preview.invalid'})[0] == 400
    status, _, payload = post('/api/books', {'title': 'Refused'}, {'Origin': 'https://wrong-origin.invalid', 'X-Forwarded-Host': 'localhost:8791'})
    assert status == 403 and json.loads(payload)['code'] == 'ORIGIN'
    print('Native assets, D1 identity, discovery and authentication boundaries passed.')

    status, _, payload = post('/oauth/register', {'client_name': 'Disposable runtime proof', 'redirect_uris': ['http://localhost:3333/callback'], 'grant_types': ['authorization_code', 'refresh_token'], 'response_types': ['code'], 'token_endpoint_auth_method': 'none'})
    assert status in (200, 201), (status, payload)
    client_id = json.loads(payload)['client_id']
    verifier = secrets.token_urlsafe(48)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip('=')
    params = {'response_type': 'code', 'client_id': client_id, 'redirect_uri': 'http://localhost:3333/callback', 'scope': 'books:read books:write books:send', 'code_challenge': challenge, 'code_challenge_method': 'S256', 'state': 'local-proof', 'resource': ORIGIN + '/mcp'}
    status, _, payload = request('/authorize?' + urllib.parse.urlencode(params))
    assert status == 200, (status, payload)
    page = payload.decode()
    handle = html.unescape(re.search(r'name="handle" value="([^"]+)"', page).group(1))
    proof = html.unescape(re.search(r'name="ownerProof" value="([^"]+)"', page).group(1))
    status, headers, payload = request('/authorize', 'POST', urllib.parse.urlencode({'handle': handle, 'ownerProof': proof, 'decision': 'allow'}).encode(), 'application/x-www-form-urlencoded')
    assert status == 302, (status, payload)
    redirect = urllib.parse.urlsplit(headers['Location'])
    assert redirect.netloc == 'localhost:3333'
    code = urllib.parse.parse_qs(redirect.query)['code'][0]
    status, _, payload = request('/oauth/token', 'POST', urllib.parse.urlencode({'grant_type': 'authorization_code', 'client_id': client_id, 'code': code, 'code_verifier': verifier, 'redirect_uri': 'http://localhost:3333/callback', 'resource': ORIGIN + '/mcp'}).encode(), 'application/x-www-form-urlencoded')
    assert status == 200, (status, payload)
    bearer = json.loads(payload)['access_token']
    auth = {'Authorization': 'Bearer ' + bearer, 'Accept': 'application/json, text/event-stream'}
    status, _, payload = post('/mcp', {'jsonrpc': '2.0', 'id': 1, 'method': 'initialize', 'params': {'protocolVersion': '2025-06-18', 'capabilities': {}, 'clientInfo': {'name': 'native-proof', 'version': '1'}}}, auth)
    assert status == 200 and json.loads(payload)['result']['serverInfo']['name'] == 'palim'
    assert 'no skill installation' in json.loads(payload)['result']['instructions']
    assert ORIGIN + '/app' in json.loads(payload)['result']['instructions']
    status, _, payload = post('/mcp', {'jsonrpc': '2.0', 'id': 2, 'method': 'tools/list', 'params': {}}, auth)
    tools = json.loads(payload)['result']['tools']
    assert sorted(t['name'] for t in tools) == ['create_book', 'get_delivery', 'get_guide', 'send_document']
    status, _, guide_payload = post('/mcp', {'jsonrpc': '2.0', 'id': 20, 'method': 'tools/call', 'params': {'name': 'get_guide', 'arguments': {}}}, auth)
    guide_result = json.loads(guide_payload)['result']
    assert status == 200 and not guide_result.get('isError')
    assert 'Never call create_book to forward an original' in guide_result['content'][0]['text']
    status, _, payload = post('/mcp', {'jsonrpc': '2.0', 'id': 3, 'method': 'tools/call', 'params': {'name': 'create_book', 'arguments': {'title': 'Native runtime proof', 'chapters': [{'title': 'A real local journey', 'markdown': 'Created through actual workerd, OAuth PKCE, D1, R2 and the MCP transport. No live email was sent.'}]}}}, auth)
    result = json.loads(payload)['result']
    assert status == 200 and not result.get('isError'), result
    artifact = json.loads(result['content'][0]['text'])
    download = urllib.parse.urlsplit(artifact['downloadUrl'])
    assert download.netloc == urllib.parse.urlsplit(ORIGIN).netloc
    status, _, epub = request(download.path + '?' + download.query)
    assert status == 200 and hashlib.sha256(epub).hexdigest() == artifact['sha256']
    (ARTIFACTS / 'native-runtime-proof.epub').write_bytes(epub)
    status, _, payload = post('/api/send', {'artifactId': artifact['artifactId']})
    assert status == 400 and json.loads(payload)['code'] == 'DESTINATION_REQUIRED'
    status, _, _ = request('/api/files/' + artifact['artifactId'], 'DELETE')
    assert status == 200
    assert request(download.path + '?' + download.query)[0] == 404
    assert post('/mcp', {'jsonrpc': '2.0', 'id': 4, 'method': 'tools/list', 'params': {}}, {'Authorization': 'Bearer invalid', 'Accept': 'application/json'})[0] == 401
    print('Native consent, PKCE, MCP create, download hash, unconfirmed-send refusal and deletion passed.')

    if '--browser' in sys.argv:
        from playwright.sync_api import sync_playwright, expect
        with sync_playwright() as browser_runner:
            browser = browser_runner.chromium.launch()
            context = browser.new_context(viewport={'width': 1440, 'height': 1000}, ignore_https_errors=True)
            errors = []
            browser_page = context.new_page()
            browser_page.on('pageerror', lambda error: errors.append(str(error)))
            browser_page.goto(ORIGIN, wait_until='networkidle')
            browser_page.keyboard.press('Tab')
            browser_page.keyboard.press('Tab')
            assert browser_page.locator('.landing-header .wordmark').evaluate('(e)=>e.matches(":focus-visible")')
            dark_focus = browser_page.locator('.landing-header .wordmark').evaluate('(e)=>getComputedStyle(e).outlineColor')
            dark_bg = browser_page.locator('.landing-header').evaluate('(e)=>getComputedStyle(e).backgroundColor')
            assert contrast(dark_focus,dark_bg) >= 3
            browser_page.locator('.landing-header').screenshot(path=str(ARTIFACTS / 'focus-dark-header.png'))
            browser_page.locator('.excerpt-footer a').focus()
            assert browser_page.locator('.excerpt-footer a').evaluate('(e)=>e.matches(":focus-visible")')
            light_focus = browser_page.locator('.excerpt-footer a').evaluate('(e)=>getComputedStyle(e).outlineColor')
            light_bg = browser_page.locator('.edition-section').evaluate('(e)=>getComputedStyle(e).backgroundColor')
            assert contrast(light_focus,light_bg) >= 3
            browser_page.locator('.edition-excerpt').screenshot(path=str(ARTIFACTS / 'focus-light-excerpt.png'))
            browser_page.locator('h1').click()
            print(f'Rendered focus contrast: dark {contrast(dark_focus,dark_bg):.2f}:1, light {contrast(light_focus,light_bg):.2f}:1.')
            browser_page.screenshot(path=str(ARTIFACTS / 'landing-desktop.png'), full_page=True)
            browser_page.set_viewport_size({'width': 390, 'height': 844})
            assert not browser_page.evaluate('document.documentElement.scrollWidth > innerWidth')
            browser_page.screenshot(path=str(ARTIFACTS / 'landing-mobile.png'), full_page=True)
            sample_page = context.new_page()
            csp_errors = []
            sample_page.on('console', lambda message: csp_errors.append(message.text) if message.type == 'error' and 'Content Security Policy' in message.text else None)
            for width, height, label in [(390, 844, 'mobile'), (1440, 1000, 'desktop')]:
                sample_page.set_viewport_size({'width': width, 'height': height})
                response = sample_page.goto(ORIGIN + '/sample.html', wait_until='networkidle')
                assert "style-src 'self'" in response.headers['content-security-policy']
                expect(sample_page.locator('h1')).to_have_count(1)
                expect(sample_page.locator('h4')).to_have_count(0)
                assert sample_page.locator('main h3').count() >= 3
                assert sample_page.evaluate("[...document.fonts].some(f=>f.family==='Manrope' && f.status==='loaded')")
                assert sample_page.locator('body').evaluate('(e)=>parseFloat(getComputedStyle(e).fontSize)') >= 18
                assert not sample_page.evaluate('document.documentElement.scrollWidth > innerWidth')
                assert sample_page.locator('main p').first.bounding_box()['y'] < height - 80
                assert sample_page.evaluate('new Set([...document.querySelectorAll("[id]")].map(e=>e.id)).size === document.querySelectorAll("[id]").length')
                sample_page.screenshot(path=str(ARTIFACTS / f'sample-reader-{label}.png'), full_page=True)
                if label == 'mobile':
                    sample_page.evaluate('document.body.style.zoom="200%"')
                    assert not sample_page.evaluate('document.documentElement.scrollWidth > innerWidth')
                    sample_page.screenshot(path=str(ARTIFACTS / 'sample-reader-zoom-mobile.png'), full_page=True)
                    sample_page.evaluate('document.body.style.zoom="100%"')
                sample_page.locator('main').screenshot(path=str(ARTIFACTS / f'sample-prose-{label}.png'))
                sample_page.goto(ORIGIN, wait_until='networkidle')
                sample_page.locator('#edition').screenshot(path=str(ARTIFACTS / f'sample-landing-{label}.png'))
            assert not csp_errors, csp_errors
            sample_page.close()
            # Inspect the actual packaged EPUB, rather than assuming its browser preview is identical.
            import zipfile
            epub_dir = ARTIFACTS / 'sample-epub-unpacked'
            with zipfile.ZipFile(ROOT / 'public/sample.epub') as publication:
                publication.extractall(epub_dir)
            epub_page = context.new_page()
            for width, height, label in [(390, 844, 'mobile'), (1440, 1000, 'desktop')]:
                epub_page.set_viewport_size({'width': width, 'height': height})
                for chapter in ['cover', 'chapter-1', 'chapter-2']:
                    epub_page.goto((epub_dir / 'EPUB' / f'{chapter}.xhtml').as_uri())
                    assert not epub_page.evaluate('document.documentElement.scrollWidth > innerWidth')
                    epub_page.screenshot(path=str(ARTIFACTS / f'epub-{chapter}-{label}.png'), full_page=True)
            epub_page.close()
            print('Public sample strict CSP, first-screen prose, unique headings/anchors and packaged EPUB XHTML reflow in Chromium passed (not an EPUB-reader engine).')
            browser_page.goto(ORIGIN + '/app', wait_until='networkidle')
            browser_page.locator('#signin').wait_for(state='visible')
            placeholder = browser_page.locator('#login-email').evaluate('(e)=>getComputedStyle(e,"::placeholder").color')
            field_bg = browser_page.locator('#login-email').evaluate('(e)=>getComputedStyle(e).backgroundColor')
            assert contrast(placeholder,field_bg) >= 4.5
            print(f'Rendered placeholder contrast: {contrast(placeholder,field_bg):.2f}:1.')
            browser_page.screenshot(path=str(ARTIFACTS / 'login-mobile.png'), full_page=True)
            browser_page.locator('#login-email').fill('browser@example.invalid')
            browser_page.locator('#login-email-form button').click()
            browser_page.locator('#login-code-form').wait_for(state='visible')
            browser_page.screenshot(path=str(ARTIFACTS / 'login-code-mobile.png'), full_page=True)
            browser_mail = json.loads(database.execute('SELECT payload FROM proof_mail ORDER BY rowid DESC LIMIT 1').fetchone()[0])
            browser_code = re.search(r'code is (\d{6})', browser_mail['text']).group(1)
            browser_page.locator('#login-code').fill('111111' if browser_code == '000000' else '000000')
            browser_page.locator('#login-code-form button[type=submit]').click()
            expect(browser_page.locator('#login-code-form .action-feedback.error')).to_have_text('That code is invalid or expired. Try again or request a new code.')
            browser_page.screenshot(path=str(ARTIFACTS / 'login-error-mobile.png'), full_page=True)
            browser_page.locator('#login-code').fill(browser_code)
            browser_page.locator('#login-code-form button[type=submit]').click()
            browser_page.locator('#desk').wait_for(state='visible')
            expect(browser_page.locator('.connect-panel')).to_contain_text('get_guide')
            expect(browser_page.locator('.connect-panel a[href="/palim-plugin.zip"]')).to_have_count(1)
            expect(browser_page.locator('#reader-choice')).to_be_hidden()
            browser_page.screenshot(path=str(ARTIFACTS / 'workspace-empty-mobile.png'), full_page=True)
            assert browser_page.locator('.job-choices').bounding_box()['y'] < 600
            context.clear_cookies()
            context.add_cookies([{'name': '__Host-palim', 'value': token, 'url': ORIGIN, 'httpOnly': True, 'secure': True, 'sameSite': 'Lax'}])
            browser_page.goto(ORIGIN + '/app', wait_until='networkidle')
            browser_page.locator('#desk').wait_for(state='visible')
            expect(browser_page.locator('.connect-panel')).to_contain_text('get_guide')
            expect(browser_page.locator('.connect-panel a[href="/palim-plugin.zip"]')).to_have_count(1)
            browser_page.keyboard.press('Tab')
            browser_page.locator('.workspace-page > .nav .wordmark').focus()
            assert browser_page.locator('.workspace-page > .nav .wordmark').evaluate('(e)=>e.matches(":focus-visible")')
            workspace_focus = browser_page.locator('.workspace-page > .nav .wordmark').evaluate('(e)=>getComputedStyle(e).outlineColor')
            workspace_bg = browser_page.locator('.workspace-page > .nav').evaluate('(e)=>getComputedStyle(e).backgroundColor')
            assert contrast(workspace_focus,workspace_bg) >= 3
            browser_page.locator('.workspace-page > .nav').screenshot(path=str(ARTIFACTS / 'focus-dark-workspace.png'))
            print(f'Rendered workspace focus contrast: {contrast(workspace_focus,workspace_bg):.2f}:1.')
            browser_page.locator('h1').click()
            browser_page.locator('#example-button').click()
            expect(browser_page.locator('#title')).to_have_value('One stop of light')
            expect(browser_page.locator('#create-panel')).to_be_visible()
            expect(browser_page.locator('#upload-panel')).to_be_hidden()
            browser_page.locator('.job-choices a[href="#upload-form"]').click()
            expect(browser_page.locator('#create-panel')).to_be_hidden()
            expect(browser_page.locator('#upload-panel')).to_be_visible()
            browser_page.locator('.job-choices a[href="#create-form"]').click()
            expect(browser_page.locator('#title')).to_have_value('One stop of light')
            browser_page.locator('#create-form button[type=submit]').click()
            browser_page.locator('#created a', has_text='Download').wait_for()
            expect(browser_page.locator('#created a.button').first).to_have_text('Download EPUB')
            expect(browser_page.locator('#created .technical-details')).not_to_have_attribute('open', '')
            expect(browser_page.locator('#created .hash')).to_be_hidden()
            browser_page.locator('#created').screenshot(path=str(ARTIFACTS / 'create-result-mobile.png'))
            preview_url = browser_page.locator('#created a', has_text='Preview').get_attribute('href')
            preview_page = context.new_page()
            preview_page.set_viewport_size({'width': 390, 'height': 844})
            private_response = preview_page.goto(preview_url, wait_until='networkidle')
            assert private_response.headers['referrer-policy'] == 'no-referrer'
            assert private_response.headers['content-security-policy'].startswith("sandbox; default-src 'none'")
            expect(preview_page.locator('figure')).to_have_count(2)
            expect(preview_page.locator('h1')).to_have_count(1)
            assert preview_page.evaluate("[...document.fonts].some(f=>f.family==='Manrope' && f.status==='loaded')")
            assert not preview_page.evaluate("[...document.querySelectorAll('h1,h2,h3,h4')].some(e=>e.tagName==='H4')")
            assert preview_page.locator('body').evaluate('(e)=>parseFloat(getComputedStyle(e).fontSize)') >= 18
            preview_page.screenshot(path=str(ARTIFACTS / 'private-reader-mobile.png'), full_page=True)
            assert not preview_page.evaluate('document.documentElement.scrollWidth > innerWidth')
            chart = preview_page.locator('figure img').nth(1)
            assert chart.bounding_box()['width'] / 560 * 30 >= 14
            preview_page.locator('figure').nth(1).screenshot(path=str(ARTIFACTS / 'chart-mobile.png'))
            preview_page.locator('figure').nth(0).screenshot(path=str(ARTIFACTS / 'diagram-mobile.png'))
            preview_page.close()
            browser_page.locator('.job-choices a[href="#upload-form"]').click()
            browser_page.locator('#original').set_input_files(str(ROOT / 'public/sample.epub'))
            browser_page.locator('#upload-form button[type=submit]').click()
            browser_page.locator('#uploaded a', has_text='Download').wait_for()
            assert not browser_page.evaluate('document.documentElement.scrollWidth > innerWidth')
            expect(browser_page.locator('#shelf .shelf-item')).to_have_count(2)
            browser_page.locator('#uploaded').screenshot(path=str(ARTIFACTS / 'upload-result-mobile.png'))
            for action in browser_page.locator('#shelf a, #shelf button').all():
                bounds = action.bounding_box()
                assert bounds['height'] >= 44 and bounds['width'] >= 44, 'Shelf touch target too small'
            browser_page.locator('#shelf').screenshot(path=str(ARTIFACTS / 'shelf-unconfigured-mobile.png'))
            # Synthetic confirmed readers exercise layout and isolation, not Kindle acceptance.
            reader_ids = [secrets.token_hex(16), secrets.token_hex(16)]
            import uuid
            reader_ids = [str(uuid.uuid4()), str(uuid.uuid4())]
            for rid, label, address in zip(reader_ids, ['Bedside Kindle', 'Travel Kindle'], ['bedside@kindle.com','travel@kindle.com']):
                database.execute('INSERT INTO reader_destinations(id,owner,label,email,confirmed_at) VALUES(?,?,?,?,?)', (rid,owner,label,address,now))
            database.execute('UPDATE users SET default_destination_id=? WHERE id=?', (reader_ids[0],owner))
            database.commit()
            # A fresh upload refreshes account settings while preserving the earlier created result.
            browser_page.locator('#upload-form button[type=submit]').click()
            expect(browser_page.locator('#send-reader option')).to_have_count(3)
            expect(browser_page.locator('#shelf .shelf-item')).to_have_count(3)
            browser_page.locator('#uploaded-reader').select_option(reader_ids[1])
            expect(browser_page.locator('#send-reader')).to_have_value(reader_ids[1])
            expect(browser_page.locator('#created-reader')).to_have_value(reader_ids[1])
            expect(browser_page.locator('#uploaded .send-target')).to_contain_text('travel@kindle.com')
            browser_page.locator('#uploaded-reader').select_option(reader_ids[0])
            expect(browser_page.locator('#uploaded .send-target')).to_contain_text('bedside@kindle.com')
            browser_page.locator('#uploaded').screenshot(path=str(ARTIFACTS / 'upload-result-confirmed-mobile.png'))
            for action in browser_page.locator('#shelf a, #shelf button').all():
                bounds = action.bounding_box()
                assert bounds['height'] >= 44 and bounds['width'] >= 44, 'Confirmed shelf action too small'
            browser_page.locator('#shelf').screenshot(path=str(ARTIFACTS / 'shelf-mobile.png'))
            browser_page.locator('#setup-details').evaluate('(el) => el.open = true')
            browser_page.screenshot(path=str(ARTIFACTS / 'destinations-mobile.png'), full_page=True)
            browser_page.locator('#setup-details').evaluate('(el) => el.open = false')
            browser_page.locator('#shelf .send-action').first.click()
            browser_page.locator('#receipt-panel').wait_for(state='visible')
            expect(browser_page.locator('#receipt')).to_contain_text('bedside@kindle.com')
            expect(browser_page.locator('#receipt')).to_contain_text('not confirmed')
            assert json.loads(database.execute('SELECT payload FROM proof_mail ORDER BY rowid DESC LIMIT 1').fetchone()[0])['to'] == 'bedside@kindle.com'
            browser_page.screenshot(path=str(ARTIFACTS / 'send-receipt-mobile.png'), full_page=True)
            browser_page.locator('#setup-details').evaluate('(el) => el.open = true')
            browser_page.locator('#reader-label').fill('New Kindle')
            browser_page.locator('#kindle-email').fill('pending@kindle.com')
            before_save_mail = database.execute('SELECT count(*) FROM proof_mail').fetchone()[0]
            browser_page.locator('#destination-form button').click()
            row = browser_page.locator('#reader-list .reader-item').filter(has_text='pending@kindle.com')
            row.wait_for()
            assert database.execute('SELECT count(*) FROM proof_mail').fetchone()[0] == before_save_mail
            row.get_by_role('button', name='Send verification book').click()
            browser_page.locator('#confirm-form').wait_for(state='visible')
            expect(browser_page.locator('#confirm-form label')).to_contain_text('pending@kindle.com')
            browser_page.screenshot(path=str(ARTIFACTS / 'destination-pending-mobile.png'), full_page=True)
            browser_page.locator('#setup-details').evaluate('(el) => el.open = false')
            browser_page.locator('h1').click()
            browser_page.screenshot(path=str(ARTIFACTS / 'workspace-mobile.png'), full_page=True)
            browser_page.set_viewport_size({'width': 1440, 'height': 1000})
            browser_page.screenshot(path=str(ARTIFACTS / 'workspace-desktop.png'), full_page=True)
            browser_page.emulate_media(reduced_motion='reduce')
            assert browser_page.evaluate('getComputedStyle(document.documentElement).scrollBehavior') == 'auto'
            browser_page.set_viewport_size({'width':390,'height':844})
            browser_page.evaluate('document.body.style.zoom = "200%"')
            assert not browser_page.evaluate('document.documentElement.scrollWidth > innerWidth'), '200% zoom overflow'
            browser_page.screenshot(path=str(ARTIFACTS / 'workspace-zoom-mobile.png'), full_page=True)
            assert not errors, errors
            browser.close()
        print('Real Chromium navigation, mobile layout, illustrated preview, browser create and original-upload journeys passed.')
    if '--pages' in sys.argv:
        print('Pages front door and real Worker service binding preserved public OAuth origin, cookies, bearer tokens, request bodies, private downloads and wrong-origin refusal.')
    # Real independent login may not access another user's document or saved readers.
    cookies[:] = alice_cookie
    status, _, payload = request('/api/files', 'POST', (ROOT / 'public/sample.epub').read_bytes(), 'application/epub+zip', {'X-Filename':'private-proof.epub'})
    assert status == 201
    private = json.loads(payload)
    second_owner = login('second@example.invalid', '192.0.2.11')
    assert post('/api/send', {'artifactId':private['artifactId']})[0] == 404
    assert request('/api/files/' + private['artifactId'], 'DELETE')[0] == 404
    assert json.loads(request('/api/account')[2])['destinations'] == []
    if '--browser' in sys.argv:
        assert post('/api/destinations/' + reader_ids[0] + '/default', {})[0] == 404
        assert request('/api/destinations/' + reader_ids[0], 'DELETE')[0] == 404
        assert post('/api/send', {'artifactId':private['artifactId'], 'destinationId':reader_ids[0]})[0] == 404

    cookies[:] = alice_cookie
    assert post('/auth/logout', {})[0] == 303
    assert request('/api/account', headers={'Cookie': '; '.join(alice_cookie)})[0] == 401
    print('Real independent email-code accounts isolate private files; logout revokes the old browser session.')
    print('PASS: disposable local runtime proof. Real Better Auth with captured synthetic mail; no provider email, Amazon import or physical Kindle claim.')
finally:
    process.terminate()
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        process.kill()
    log.close()
