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
ORIGIN = 'http://localhost:8791'
CONFIG = json.loads((ROOT / 'wrangler.jsonc').read_text())
CONFIG['name'] = 'palim-native-proof'
CONFIG['main'] = str(ROOT / 'src/index.ts')
CONFIG['assets']['directory'] = str(ROOT / 'public')
CONFIG['d1_databases'][0]['migrations_dir'] = str(ROOT / 'migrations')
CONFIG['vars'] = {'ORIGIN': ORIGIN, 'SENDER': 'fixture@example.invalid', 'SIGNING_SECRET': secrets.token_hex(32), 'FILE_ORIGINS': ''}
CONFIG.pop('triggers', None)
config_path = WORK / 'wrangler.json'
config_path.write_text(json.dumps(CONFIG))
state = WORK / 'state'
command = ['node', str(ROOT / 'node_modules/wrangler/bin/wrangler.js')]
environment = dict(os.environ, WRANGLER_SEND_METRICS='false', CLOUDFLARE_CF_FETCH_ENABLED='false', CI='true')
log = (WORK / 'worker.log').open('w')
subprocess.run(command + ['d1', 'migrations', 'apply', 'palim', '--local', '--config', str(config_path), '--persist-to', str(state)], cwd=WORK, env=environment, stdout=log, stderr=log, check=True)
process = subprocess.Popen(command + ['dev', '--local', '--port', '8791', '--ip', '127.0.0.1', '--config', str(config_path), '--persist-to', str(state)], cwd=WORK, env=environment, stdout=log, stderr=log)

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None

opener = urllib.request.build_opener(NoRedirect)
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
    assert database is not None, 'Local D1 schema missing'
    token = secrets.token_hex(32)
    now = int(time.time())
    database.execute("INSERT INTO users(id,name,created_at) VALUES('runtime-proof','Runtime proof',?)", (now,))
    database.execute('INSERT INTO sessions(hash,owner,expires_at) VALUES(?,?,?)', (hashlib.sha256(token.encode()).hexdigest(), 'runtime-proof', now + 3600))
    database.commit()
    cookies.append('__Host-palim=' + token)

    assert request('/app')[0] == 200, 'Workspace asset redirect loop'
    assert request('/mcp')[0] == 401, 'Unauthenticated MCP must be refused'
    assert request('/.well-known/oauth-authorization-server')[0] == 200
    assert request('/api/account')[0] == 200
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
    status, _, payload = post('/mcp', {'jsonrpc': '2.0', 'id': 2, 'method': 'tools/list', 'params': {}}, auth)
    tools = json.loads(payload)['result']['tools']
    assert sorted(t['name'] for t in tools) == ['create_book', 'get_delivery', 'send_document']
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
        from playwright.sync_api import sync_playwright
        with sync_playwright() as browser_runner:
            browser = browser_runner.chromium.launch()
            context = browser.new_context(viewport={'width': 1440, 'height': 1000})
            errors = []
            browser_page = context.new_page()
            browser_page.on('pageerror', lambda error: errors.append(str(error)))
            browser_page.goto(ORIGIN, wait_until='networkidle')
            browser_page.screenshot(path=str(ARTIFACTS / 'landing-desktop.png'), full_page=True)
            browser_page.set_viewport_size({'width': 390, 'height': 844})
            assert not browser_page.evaluate('document.documentElement.scrollWidth > innerWidth')
            browser_page.screenshot(path=str(ARTIFACTS / 'landing-mobile.png'), full_page=True)
            context.add_cookies([{'name': '__Host-palim', 'value': token, 'url': ORIGIN, 'httpOnly': True, 'secure': True, 'sameSite': 'Lax'}])
            browser_page.goto(ORIGIN + '/app', wait_until='networkidle')
            browser_page.locator('#desk').wait_for(state='visible')
            browser_page.locator('#title').fill('A browser-created reading edition')
            browser_page.locator('#manuscript').fill('A genuine browser workflow against local workerd.\n\nThe page uses its real JavaScript, routes, database and storage.')
            browser_page.locator('#create-form button[type=submit]').click()
            browser_page.locator('#created a', has_text='Download').wait_for()
            browser_page.locator('#original').set_input_files(str(ROOT / 'public/sample.epub'))
            browser_page.locator('#upload-form button[type=submit]').click()
            browser_page.locator('#uploaded a', has_text='Download').wait_for()
            assert not browser_page.evaluate('document.documentElement.scrollWidth > innerWidth')
            browser_page.screenshot(path=str(ARTIFACTS / 'workspace-mobile.png'), full_page=True)
            browser_page.set_viewport_size({'width': 1440, 'height': 1000})
            browser_page.screenshot(path=str(ARTIFACTS / 'workspace-desktop.png'), full_page=True)
            assert not errors, errors
            browser.close()
        print('Real Chromium navigation, mobile layout, browser create and original-upload journeys passed.')
    print('PASS: disposable local runtime proof. Synthetic local identity; no live GitHub sign-in, provider email, Amazon import or physical Kindle claim.')
finally:
    process.terminate()
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        process.kill()
    log.close()
