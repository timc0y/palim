"""Disposable local workerd/D1/R2/OAuth proof; never deploys or sends real mail."""
import argparse
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
import zipfile

parser = argparse.ArgumentParser(description=__doc__, allow_abbrev=False)
parser.add_argument('--pages', action='store_true', help='run through the local Pages service binding')
parser.add_argument('--browser', action='store_true', help='also run browser acceptance checks')
modes = parser.add_mutually_exclusive_group()
modes.add_argument('--origin-only', action='store_true', help='run only the origin and form checks')
modes.add_argument('--saved-addresses-only', action='store_true', help='run only saved-address checks')
args = parser.parse_args()

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
wrapper.write_text("import app from " + json.dumps(str(ROOT / 'src/index.ts')) + ";\nexport default { fetch(request, env, ctx) { const local = {...env, EMAIL: { async send(payload) { await env.DB.prepare('INSERT INTO proof_mail(payload) VALUES(?)').bind(JSON.stringify(payload, (_key, value) => ArrayBuffer.isView(value) ? Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)) : value)).run(); return {messageId: crypto.randomUUID()}; } }}; return app.fetch(request, local, ctx); }, scheduled: app.scheduled };\n")
CONFIG['main'] = str(wrapper)
CONFIG['assets']['directory'] = str(ROOT / 'public')
CONFIG['d1_databases'][0]['migrations_dir'] = str(ROOT / 'migrations')
CONFIG['vars'] = {'ORIGIN': ORIGIN, 'SENDER': 'fixture@example.invalid', 'SIGNING_SECRET': secrets.token_hex(32), 'AUTH_SECRET': secrets.token_hex(32)}
CONFIG.pop('triggers', None)
CONFIG['dev'] = {'local_protocol': 'https', 'upstream_protocol': 'https'}
config_path = WORK / 'wrangler.json'
config_path.write_text(json.dumps(CONFIG))
state = WORK / 'state'
if not (args.origin_only or args.saved_addresses_only):
    subprocess.run(['npm','run','example'], cwd=ROOT, check=True, stdout=subprocess.DEVNULL)
command = ['node', str(ROOT / 'node_modules/wrangler/bin/wrangler.js')]
environment = dict(os.environ, WRANGLER_SEND_METRICS='false', CLOUDFLARE_CF_FETCH_ENABLED='false', CI='true')
log = (WORK / 'worker.log').open('w')
subprocess.run(command + ['d1', 'migrations', 'apply', 'palim', '--local', '--config', str(config_path), '--persist-to', str(state)], cwd=WORK, env=environment, stdout=log, stderr=log, check=True)
serve_cwd = WORK
if args.pages:
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

def select_view(page, name):
    menu = page.locator('#studio-menu')
    if not menu.evaluate('(e)=>e.open'):
        menu.locator('summary').click()
    page.get_by_role('link', name=name, exact=True).click()

def open_settings(page):
    select_view(page, 'Settings')

def contrast(foreground, background):
    def light(value):
        channels = [int(x)/255 for x in re.findall(r'\d+',value)[:3]]
        channels = [v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4 for v in channels]
        return sum(v*w for v,w in zip(channels,[.2126,.7152,.0722]))
    lo,hi=sorted([light(foreground),light(background)])
    return (hi+.05)/(lo+.05)

def backdrop_colors(locator):
    # Transparent controls inherit the nearest opaque surface, not transparent black.
    return locator.evaluate(r"""(element) => {
      const opaque = color => color.startsWith('rgb(') || /,\s*1\)$/.test(color);
      for (let node = element; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.backgroundImage !== 'none') {
          const colors = style.backgroundImage.match(/rgba?\([^)]+\)/g);
          if (colors?.length && colors.every(opaque)) return colors;
          throw new Error('Focus backdrop needs a rendered-image contrast check.');
        }
        if (opaque(style.backgroundColor)) return [style.backgroundColor];
      }
      throw new Error('No opaque focus backdrop found.');
    }""")

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
    if args.origin_only:
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
    if args.saved_addresses_only:
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
            assert page.locator('.skip-link').evaluate('(e)=>getComputedStyle(e).clipPath') == 'inset(50%)'
            page.keyboard.press('Tab')
            expect(page.locator('.skip-link')).to_be_focused()
            assert page.locator('.skip-link').evaluate('(e)=>getComputedStyle(e).clipPath') == 'none'
            page.locator('.reader-tabs a[href="#files-panel"]').click()
            page.locator('.skip-link').focus()
            page.keyboard.press('Enter')
            expect(page.locator('#main-content')).to_be_focused()
            expect(page).to_have_url(ORIGIN + '/app#files-panel')
            select_view(page, 'Forward')
            open_settings(page)
            expect(page.locator('#agent-setup')).to_be_visible()
            page.set_viewport_size({'width':320,'height':844})
            page.evaluate("document.documentElement.style.fontSize = '200%'")
            plugin_link = page.get_by_role('link', name='Download Codex plugin (ZIP) for palim.pages.dev', exact=True)
            expect(plugin_link).to_be_visible()
            assert plugin_link.evaluate('el => el.scrollWidth <= el.clientWidth && el.getBoundingClientRect().right <= innerWidth')
            assert plugin_link.locator('.plugin-host').evaluate('el => el.getClientRects().length > 0')
            page.evaluate("document.documentElement.style.removeProperty('font-size')")
            page.set_viewport_size({'width':390,'height':844})
            expect(page.locator('#workbench')).to_be_hidden()
            select_view(page, 'Create')
            page.locator('#studio-menu summary').click()
            page.get_by_role('link',name='Create',exact=True).hover()
            selected_task = page.get_by_role('link',name='Create',exact=True)
            expect(selected_task).to_have_attribute('aria-current', 'page')
            expect(page.locator('#metadata-language')).to_have_text('English')
            colors = selected_task.evaluate('(e)=>[getComputedStyle(e).color,getComputedStyle(e).backgroundColor]')
            assert contrast(*colors) >= 4.5
            page.set_viewport_size({'width':568,'height':320})
            page.evaluate("document.documentElement.style.fontSize = '200%'")
            for menu_link in page.locator('.studio-menu-content a').all():
                menu_link.focus()
                expect(menu_link).to_be_in_viewport(ratio=1)
            assert page.locator('.studio-menu-content').evaluate('el => el.getBoundingClientRect().bottom <= innerHeight')
            page.evaluate("document.documentElement.style.removeProperty('font-size')")
            page.locator('#studio-menu summary').click()
            for width,height,label in [(320,844,'narrow'),(390,844,'mobile'),(1440,1000,'desktop')]:
                page.set_viewport_size({'width':width,'height':height})
                assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
                page.screenshot(path=str(ARTIFACTS / f'authoring-workspace-{label}.png'), full_page=True)
            page.set_viewport_size({'width':390,'height':844})
            expect(page.locator('#metadata-language')).to_be_visible()
            language_box = page.locator('#metadata-language').bounding_box()
            summary_box = page.locator('.book-metadata summary > span').bounding_box()
            assert abs(language_box['x'] - summary_box['x']) <= 1
            # A normal email is valid HTML but not a Kindle destination: field-local API error.
            open_settings(page)
            status, _, response = post('/api/destinations', {'email':'nickname-test@kindle.com','label':'x' * 41})
            response = json.loads(response)
            assert status == 400 and response['code'] == 'READER_LABEL'
            assert 'Kindle nickname' in response['message']
            page.get_by_role('textbox', name='Kindle nickname (optional)', exact=True).fill('')
            page.locator('#destination-form button').click()
            expect(page.locator('#kindle-email')).to_be_focused()
            expect(page.locator('#kindle-email')).to_have_accessible_description(re.compile('Enter your Kindle email address'))
            page.keyboard.press('Tab')
            expect(page.locator('#kindle-email-help').get_by_role('link', name='Amazon.com (opens in a new tab)', exact=True)).to_be_focused()
            page.keyboard.press('Tab')
            expect(page.locator('#kindle-email-help').get_by_role('link', name='Amazon.co.uk (opens in a new tab)', exact=True)).to_be_focused()
            page.keyboard.press('Tab')
            expect(page.locator('#reader-label')).to_be_focused()
            page.locator('#kindle-email').fill('normal@example.invalid')
            page.locator('#kindle-email').press('Enter')
            expect(page.locator('#kindle-email')).to_be_focused()
            page.locator('#destination-form button').click()
            expect(page.locator('#kindle-email')).to_have_attribute('aria-invalid','true')
            expect(page.locator('#kindle-email')).to_be_focused()
            expect(page.locator('#destination-form .action-feedback')).to_contain_text('@kindle.com')
            page.locator('#destination-form').screenshot(path=str(ARTIFACTS / 'ux-address-error-mobile.png'))
            page.locator('#kindle-email').fill('reader@free.kindle')
            expect(page.locator('#kindle-email')).to_have_accessible_description(re.compile('@free.kindle.com'))
            page.locator('#kindle-email').fill('reader@free.kindle.com')
            expect(page.locator('#destination-form .action-feedback')).to_be_hidden()
            page.route('**/api/destinations', lambda route: route.fulfill(status=400, json={'code':'READER_LABEL','message':'Check the Kindle nickname.'}), times=1)
            page.locator('#destination-form button').click()
            expect(page.locator('#reader-label')).to_be_focused()
            expect(page.locator('#kindle-email')).to_have_attribute('aria-describedby', 'kindle-email-help')
            expect(page.locator('#reader-label')).to_have_accessible_description('Check the Kindle nickname.')
            page.locator('#kindle-email').fill('draft@kindle.com')
            expect(page.locator('#reader-label')).to_have_accessible_description('Check the Kindle nickname.')
            page.locator('#kindle-email').fill('')
            page.locator('#destination-form button').click()
            expect(page.locator('#kindle-email')).to_have_accessible_description(re.compile('Enter your Kindle email address'))
            expect(page.locator('#reader-label')).to_have_accessible_description('')
            page.locator('#kindle-email').fill('draft@kindle.com')
            page.locator('#reader-label').fill('Draft')
            page.route('**/api/destinations', lambda route: route.abort('failed'), times=1)
            page.locator('#destination-form button').click()
            expect(page.locator('#destination-form .action-feedback')).to_contain_text('Connection failed')
            page.locator('#kindle-email').fill('edited@kindle.com')
            expect(page.locator('#destination-form .action-feedback')).to_be_hidden()
            oversized_address = 'a' * 180 + '@kindle.com'
            page.locator('#kindle-email').fill(oversized_address)
            page.locator('#destination-form button').click()
            expect(page.locator('#kindle-email')).to_have_value(oversized_address)
            expect(page.locator('#destination-form-feedback')).to_have_text('Use a Kindle address with 180 characters or fewer.')
            page.locator('#kindle-email').fill('')
            expect(page.locator('#destination-form-feedback')).to_have_text('Enter your Kindle email address.')
            page.locator('#kindle-email').fill('@kindle.com')
            expect(page.locator('#destination-form-feedback')).to_have_text('Enter the complete Kindle email address.')
            bedside_email = 'b' * 64 + '@kindle.com'
            for label, address in [('Bedside',bedside_email), ('Travel','palim-address-fixture-travel@kindle.com')]:
                open_settings(page)
                page.locator('#reader-label').fill(label)
                page.locator('#kindle-email').fill(address)
                expect(page.locator('#destination-form .action-feedback.error')).to_be_hidden()
                page.locator('#destination-form button').click()
                expect(page.locator('#reader-list')).to_contain_text(label)
            expect(page.locator('#reader-list .reader-item')).to_have_count(2)
            page.locator('#kindle-email').fill(bedside_email)
            page.locator('#reader-label').fill('')
            with page.expect_response(lambda res: res.url.endswith('/api/destinations') and res.request.method == 'POST') as resaved:
                page.locator('#destination-form button').click()
            assert resaved.value.json()['label'] == 'Bedside'
            expect(page.locator('#destination-form button')).to_be_enabled()
            expect(page.get_by_role('group', name=f'Bedside, {bedside_email}, Default', exact=True)).to_be_visible()
            expect(page.locator('#destination-status')).to_contain_text('2 of 5 saved')
            expect(page.locator('#confirm-form')).to_have_count(0)
            expect(page.get_by_role('button',name='Send verification book')).to_have_count(0)
            account = json.loads(request('/api/account')[2])
            personal_sender = account['sender']
            assert re.fullmatch(r'p-[0-9a-f]{32}@example.invalid', personal_sender)
            expect(page.locator('#sender-address')).to_have_text(personal_sender)
            expect(page.locator('#amazon-steps ol')).to_be_hidden()
            page.locator('#amazon-steps summary').click()
            expect(page.locator('#amazon-steps ol')).to_be_visible()
            assert page.locator('.amazon-setup a').first.get_attribute('href') == 'https://www.amazon.com/mycd'
            context.grant_permissions(['clipboard-read','clipboard-write'])
            page.locator('#copy-sender').click()
            expect(page.locator('#copy-sender')).to_have_text('Copied')
            assert page.evaluate('navigator.clipboard.readText()') == personal_sender
            page.evaluate("Object.defineProperty(navigator.clipboard, 'writeText', {configurable:true, value:async () => { throw new Error('denied'); }})")
            page.locator('#copy-sender').click()
            expect(page.locator('#copy-sender-status')).to_contain_text('Copy the selected text manually')
            assert page.evaluate('getSelection().toString()') == personal_sender
            page.evaluate('delete navigator.clipboard.writeText')
            page.locator('#copy-sender').press('Enter')
            expect(page.locator('#copy-sender')).to_have_text('Copied')
            expect(page.locator('#copy-sender-status')).to_be_empty()
            assert not page.evaluate('getSelection().toString()')
            expect(page.locator('#copy-sender')).to_be_focused()
            page.locator('h1').click()
            page.locator('.sender-panel').screenshot(path=str(ARTIFACTS / 'ux-amazon-setup-mobile.png'))
            rows = json.loads(request('/api/account')[2])['destinations']
            assert all('confirmed' not in row for row in rows)
            travel = next(row for row in rows if row['label'] == 'Travel')
            open_settings(page)
            page.set_viewport_size({'width':320,'height':844})
            saved_notice = page.locator('#destination-form-feedback')
            expect(saved_notice).to_have_text(f'Saved {bedside_email}.')
            assert saved_notice.evaluate('el => el.scrollWidth <= el.clientWidth && el.getBoundingClientRect().right <= innerWidth')
            page.set_viewport_size({'width':390,'height':844})
            page.locator('#kindle-email').fill('draft@kindle.com')
            expect(page.locator('#destination-form-feedback')).to_be_empty()
            page.locator('#reader-list .reader-item').filter(has_text='Travel').get_by_role('button',name='Make default: Travel').click()
            expect(page.locator('#address-setup')).to_be_visible()
            expect(page.locator('#kindle-email')).to_have_value('draft@kindle.com')
            expect(page.locator('#reader-list .reader-item').filter(has_text='Travel')).to_contain_text('Default')
            assert json.loads(request('/api/account')[2])['defaultDestinationId'] == travel['id']
            for width,height,label in [(390,844,'mobile'),(1440,1000,'desktop')]:
                page.set_viewport_size({'width':width,'height':height})
                assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
                page.locator('.reader-panel').screenshot(path=str(ARTIFACTS / f'saved-readers-{label}.png'))
            page.set_viewport_size({'width':390,'height':844})
            select_view(page, 'Create')
            status, _, saved = post('/api/destinations', {'email':'temporary@kindle.com','label':'Temporary'})
            assert status in (200, 201)
            temporary_id = json.loads(saved)['id']
            page.locator('#title').fill('Saved-address proof')
            page.locator('#manuscript').fill('A local synthetic draft. No email was requested.')
            page.locator('.book-metadata summary').click()
            for width in [320, 768]:
                page.set_viewport_size({'width':width,'height':844})
                page.locator('#language').fill('Brazilian Portuguese')
                assert page.locator('#language').evaluate('el => el.scrollWidth <= el.clientWidth')
            page.evaluate('document.documentElement.style.fontSize="200%"')
            author_box = page.locator('#creator').bounding_box()
            language_box = page.locator('#language').bounding_box()
            assert language_box['y'] >= author_box['y'] + author_box['height']
            assert page.locator('#language').evaluate('el => el.scrollWidth <= el.clientWidth')
            page.evaluate('document.documentElement.style.removeProperty("font-size")')
            page.set_viewport_size({'width':390,'height':844})
            page.locator('#language').fill('Canadian French')
            with page.expect_request(lambda req: req.url.endswith('/api/books') and req.method == 'POST') as book_request:
                page.locator('#create-form button[type=submit]').click()
            assert book_request.value.post_data_json['language'] == 'fr-CA'
            page.locator('#created a.button').first.wait_for()
            page.locator('#created').screenshot(path=str(ARTIFACTS / 'ux-create-result-mobile.png'))
            assert database.execute('SELECT count(*) FROM proof_mail').fetchone()[0] == 0

            open_settings(page)
            for width,height,label in [(390,844,'mobile'),(1440,1000,'desktop')]:
                page.set_viewport_size({'width':width,'height':height})
                assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
                for value, button in [('#sender-address', '#copy-sender'), ('#mcp-url', '#copy-mcp')]:
                    box, action = [page.locator(selector).bounding_box() for selector in (value, button)]
                    assert abs(box['y'] - action['y']) <= 1 and abs(box['height'] - action['height']) <= 1
                page.locator('#connect-agent').screenshot(path=str(ARTIFACTS / f'agent-setup-{label}.png'))
            page.set_viewport_size({'width':320,'height':844})
            page.evaluate("Object.defineProperty(navigator.clipboard, 'writeText', {configurable:true, value:() => new Promise((_, reject) => {window.rejectSenderCopy = reject})})")
            page.locator('#copy-sender').click()
            expect(page.locator('#copy-sender')).to_have_text('Copying…')
            nickname_field = page.locator('#reader-label')
            nickname_field.fill('Draft nickname')
            nickname_field.evaluate('el => el.setSelectionRange(0, 5)')
            page.evaluate("window.rejectSenderCopy(Error('denied'))")
            expect(page.locator('#copy-sender-status')).to_have_text('Couldn’t copy. Try again.')
            expect(nickname_field).to_be_focused()
            assert nickname_field.evaluate('el => el.value.slice(el.selectionStart, el.selectionEnd)') == 'Draft'
            page.locator('#copy-sender').click()
            page.evaluate('delete navigator.clipboard.writeText')
            page.locator('#copy-mcp').click()
            expect(page.locator('#copy-mcp')).to_have_text('Copied')
            assert page.evaluate('navigator.clipboard.readText()') == ORIGIN + '/mcp'
            page.evaluate("window.rejectSenderCopy(Error('denied'))")
            expect(page.locator('#copy-sender')).to_have_text('Copy')
            expect(page.locator('#copy-sender-status')).to_be_empty()
            expect(page.locator('#copy-mcp')).to_be_focused()
            expect(page.locator('#copy-mcp')).to_have_text('Copy')
            page.evaluate("Object.defineProperty(navigator.clipboard, 'writeText', {configurable:true, value:async () => {throw Error('denied')}})")
            page.locator('#copy-mcp').press('Enter')
            expect(page.locator('#copy-mcp')).to_have_accessible_description('Copy unavailable. Copy the selected text manually.')
            assert page.evaluate('getSelection().toString()') == ORIGIN + '/mcp'
            page.evaluate('delete navigator.clipboard.writeText')
            assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
            page.set_viewport_size({'width':390,'height':844})
            select_view(page, 'Forward')
            original = b'%PDF-1.7\n% Synthetic original for local UX proof\n1 0 obj<</Type/Catalog>>endobj\n%%EOF'
            page.locator('#original').set_input_files({'name':'قراءة Étude 東京.pdf','mimeType':'application/pdf','buffer':original})
            expect(page.locator('#file-name bdi')).to_have_text('.pdf')
            page.locator('#upload-form button[type=submit]').click()
            page.locator('#uploaded a.button').first.wait_for()
            expect(page.locator('#uploaded .result-name')).to_have_text('قراءة Étude 東京.pdf')
            assert page.locator('#uploaded .result-name').evaluate('el => getComputedStyle(el).direction') == 'rtl'
            page.locator('#uploaded').screenshot(path=str(ARTIFACTS / 'ux-upload-result-mobile.png'))
            page.locator('.reader-tabs a[href="#files-panel"]').click()
            original_row = page.locator('#shelf .shelf-item').filter(has_text='قراءة Étude 東京.pdf')
            result_time = page.locator('#uploaded time')
            expect(original_row.locator('time')).to_have_text(result_time.text_content())
            expect(original_row.locator('time')).to_have_attribute('datetime', result_time.get_attribute('datetime'))
            expect(original_row.locator('h3 bdi')).to_have_text('.pdf')
            with page.expect_download() as received:
                original_row.get_by_role('link', name='Download قراءة Étude 東京.pdf', exact=True).click()
            assert received.value.suggested_filename == 'قراءة Étude 東京.pdf'
            assert received.value.path().read_bytes() == original
            uploaded = next(a for a in json.loads(request('/api/account')[2])['artifacts'] if not a['generated'] and a['kind'] == 'document')
            url = urllib.parse.urlsplit(uploaded['downloadUrl'])
            download_status, download_headers, downloaded = request(url.path+'?'+url.query)
            assert download_status == 200 and downloaded == original
            assert "filename*=UTF-8''" + urllib.parse.quote('قراءة Étude 東京.pdf') in download_headers['Content-Disposition']
            select_view(page, 'Create')
            expect(page.locator('#title')).to_have_value('Saved-address proof')
            page.locator('#created .share-trigger').click()
            page.locator('#send-reader').select_option(temporary_id)
            assert request('/api/destinations/' + temporary_id, 'DELETE')[0] == 200
            page.locator('#share-send').click()
            expect(page.locator('#share-content .action-feedback')).to_have_text('That Kindle address is no longer saved. Choose another address.')
            expect(page.locator('#send-reader')).to_have_value('')
            expect(page.locator('#send-reader')).to_be_focused()
            expect(page.locator('#send-reader')).to_have_accessible_description(re.compile('no longer saved'))
            expect(page.locator('#send-reader')).to_have_attribute('aria-invalid', 'true')
            expect(page.locator('#reader-choice + #reader-choice-error')).to_be_visible()
            expect(page.locator('#send-reader option', has_text='Temporary')).to_have_count(0)
            expect(page.locator('#created .artifact-status')).to_have_text('Not sent')
            page.locator('#send-reader').select_option(travel['id'])
            expect(page.locator('#share-content .action-feedback')).to_be_hidden()
            assert page.locator('#send-reader').get_attribute('aria-invalid') is None
            expect(page.locator('#share-content .send-target')).to_contain_text(travel['email'])
            expect(page.locator('#share-content .send-target')).to_be_visible()
            expect(page.locator('#share-send')).to_have_text('Send')
            assert database.execute('SELECT count(*) FROM proof_mail').fetchone()[0] == 0
            assert database.execute('SELECT count(*) FROM mail_attempts').fetchone()[0] == 0
            page.route('**/api/send', lambda route: route.fulfill(status=404, json={
                'code':'ARTIFACT_NOT_FOUND', 'message':'This document has expired.',
            }), times=1)
            page.locator('#share-send').click()
            expect(page.locator('#share-content .action-feedback')).to_have_text('This book is no longer on your Shelf. No new email was sent. Return to manuscript.')
            expect(page.get_by_role('link', name='Return to manuscript')).to_have_attribute('href', '#create-panel')
            expect(page.locator('#created .artifact-status')).to_have_text('Not sent')
            page.route('**/api/send', lambda route: route.fulfill(status=429, json={
                'code':'SEND_LIMIT', 'message':'No new email was sent. Check the saved Kindle address. If it’s correct, the sending allowance may be full. Try again later.',
            }))
            page.locator('#share-send').click()
            expect(page.locator('#share-content .action-feedback')).to_contain_text('No new email was sent. Check the saved Kindle address.')
            expect(page.locator('#created .artifact-status')).to_have_text('Not sent')
            assert database.execute('SELECT count(*) FROM proof_mail').fetchone()[0] == 0
            page.locator('#send-reader').select_option(label='Bedside')
            expect(page.locator('#share-content .action-feedback')).to_be_hidden()
            expect(page.locator('#send-target')).to_contain_text(bedside_email)
            page.locator('#send-reader').select_option(travel['id'])
            page.unroute('**/api/send')
            pending_send = []
            page.route('**/api/send', lambda route: pending_send.append(route), times=1)
            page.locator('#share-send').click()
            expect(page.locator('#share-send')).to_have_text('Sending…')
            expect(page.locator('#share-send')).to_be_disabled()
            expect(page.locator('#send-reader')).to_be_disabled()
            expect(page.locator('#send-reader')).to_have_value(travel['id'])
            expect(page.locator('#send-target')).to_contain_text(travel['email'])
            assert len(pending_send) == 1
            assert pending_send[0].request.post_data_json['destinationId'] == travel['id']
            page.keyboard.press('Escape')
            expect(page.locator('#share-dialog')).to_be_hidden()
            pending_trigger = page.locator('#created .share-trigger')
            expect(pending_trigger).to_have_text('Sending…')
            expect(pending_trigger).to_be_disabled()
            pending_send[0].fulfill(status=429, json={'code':'SEND_LIMIT', 'message':'No new email was sent.'})
            expect(page.locator('#created > [role=alert]')).to_have_text('No new email was sent.')
            expect(pending_trigger).to_be_enabled()
            pending_trigger.click()
            expect(page.locator('#created > [data-send-error]')).to_have_count(0)
            pending_send.clear()
            page.route('**/api/send', lambda route: pending_send.append(route), times=1)
            page.locator('#share-send').click()
            expect(page.locator('#share-send')).to_have_text('Sending…')
            page.keyboard.press('Escape')
            edit_book = page.locator('#created .result-edit')
            edit_book.focus()
            pending_send[0].continue_()
            page.locator('#receipt-panel').wait_for(state='visible')
            receipt_address = page.locator('#receipt .receipt-destination > span')
            expect(receipt_address).to_have_text(f"To {travel['label']} · {travel['email']}")
            expect(receipt_address.locator('bdi')).to_have_text([travel['label'], travel['email']])
            expect(edit_book).to_be_focused()
            expect(pending_trigger).to_have_text('Send to Kindle')
            expect(pending_trigger).to_be_enabled()
            page.locator('#created .result-edit').click()
            expect(page.locator('#manuscript')).to_be_focused()
            expect(page.locator('#receipt-panel')).to_be_hidden()
            expect(page.locator('#back-created')).to_have_accessible_description(page.locator('#created-name').text_content())
            page.locator('#back-created').click()
            expect(page.locator('#receipt-panel')).to_be_visible()
            expect(page.locator('#created h2')).to_be_focused()
            artifact = next(a for a in json.loads(request('/api/account')[2])['artifacts'] if a['generated'])
            # Repeating the same explicit intent returns the first captured-mail receipt.
            status,_,payload = post('/api/send', {'artifactId':artifact['artifactId'], 'destinationId':travel['id']})
            assert status == 200 and json.loads(payload)['sender'] == personal_sender
            mail = json.loads(database.execute('SELECT payload FROM proof_mail').fetchone()[0])
            assert mail['from']['email'] == personal_sender and mail['to'] == travel['email']
            assert database.execute('SELECT count(*) FROM proof_mail').fetchone()[0] == 1
            assert database.execute('SELECT count(*) FROM mail_attempts').fetchone()[0] == 1
            assert database.execute('SELECT count(*) FROM challenges').fetchone()[0] == 0
            # Render actual persisted receipt failures without a new submission.
            receipt_id = json.loads(payload)['deliveryId']
            expect(page.locator('#refresh-receipt')).to_be_hidden()
            colours = {}
            for state in ['submitting', 'unknown', 'rejected', 'submitted']:
                database.execute('UPDATE deliveries SET state=? WHERE id=?', (state, receipt_id))
                database.commit()
                if page.locator('#refresh-receipt').is_visible():
                    page.locator('#refresh-receipt').click()
                else:
                    page.locator('#created .share-trigger').click()
                    page.locator('#share-send').click()
                expect(page.locator('#share-dialog')).to_be_hidden()
                expect(page.locator('.receipt-state')).to_have_attribute('data-state', state)
                if state == 'rejected':
                    expect(page.locator('#receipt-panel').get_by_role('link', name='Upload to Send to Kindle (opens in a new tab)')).to_have_attribute('href', 'https://www.amazon.com/sendtokindle')
                if state == 'submitting':
                    expect(page.locator('#receipt-panel')).to_contain_text('You can check the status without sending another copy.')
                if state == 'unknown':
                    expect(page.locator('#receipt-panel')).to_contain_text('Check your Kindle library before sending another copy.')
                if state in ['submitted', 'rejected']:
                    expect(page.locator('#refresh-receipt')).to_be_hidden()
                else:
                    page.locator('#refresh-receipt').press('Enter')
                    expect(page.locator('#receipt-panel .action-feedback')).to_have_text(re.compile(r'^Checked at \d{2}:\d{2}:\d{2}\. No change\.$'))
                    expect(page.locator('#refresh-receipt')).to_be_focused()
                if state == 'rejected':
                    with page.expect_download() as rejected_epub:
                        page.locator('#receipt-panel').get_by_role('link', name=re.compile('^Download the EPUB')).click()
                    with zipfile.ZipFile(rejected_epub.value.path()) as recovered_book:
                        assert recovered_book.read('mimetype') == b'application/epub+zip'
                    for width in [320, 1440]:
                        page.set_viewport_size({'width':width, 'height':900})
                        panel = page.locator('#receipt-panel')
                        assert panel.evaluate('(e) => e.scrollWidth <= e.clientWidth')
                        panel.screenshot(path=str(ARTIFACTS / f'cleanup-receipt-rejected-{width}.png'))
                    page.set_viewport_size({'width':390, 'height':844})
                if state in ['submitting', 'unknown']:
                    pending_check = []
                    page.route('**/api/deliveries/*', lambda route: pending_check.append(route), times=1)
                    page.locator('#refresh-receipt').click()
                    expect(page.locator('#refresh-receipt')).to_be_disabled()
                    page.locator('#created .result-edit').focus()
                    if state == 'submitting':
                        pending_check[0].abort('failed')
                    else:
                        pending_check[0].fulfill(status=200, content_type='application/json', body='{')
                    expect(page.locator('#receipt .receipt-state')).to_have_attribute('data-state', state)
                    expect(page.locator('#receipt-panel .action-feedback')).to_have_text('Couldn’t update email status. Check again in a moment.')
                    expect(page.locator('#created .result-edit')).to_be_focused()
                if state == 'unknown':
                    page.set_viewport_size({'width':320, 'height':844})
                    status_box = page.locator('#created .artifact-status').bounding_box()
                    edit_box = page.locator('#created .result-edit').bounding_box()
                    assert status_box['x'] + status_box['width'] <= edit_box['x']
                    page.evaluate('document.documentElement.style.fontSize="200%"')
                    panel = page.locator('#receipt-panel')
                    assert panel.evaluate('el => el.scrollWidth <= el.clientWidth')
                    brand = page.locator('.nav .wordmark').bounding_box()
                    menu = page.locator('#studio-menu summary').bounding_box()
                    assert brand['x'] + brand['width'] < menu['x']
                    page.locator('#refresh-receipt').scroll_into_view_if_needed()
                    page.screenshot(path=str(ARTIFACTS / 'receipt-unknown-320-large-text.png'))
                    page.evaluate('document.documentElement.style.removeProperty("font-size")')
                    page.set_viewport_size({'width':390, 'height':844})
                colours[state] = page.locator('.receipt-state').evaluate('(e)=>getComputedStyle(e).color')
                page.locator('#receipt-panel').screenshot(path=str(ARTIFACTS / f'cleanup-receipt-{state}-mobile.png'))
            assert len(set(colours.values())) >= 3
            assert database.execute('SELECT count(*) FROM proof_mail').fetchone()[0] == 1
            page.set_viewport_size({'width':390,'height':844})
            page.locator('#created').screenshot(path=str(ARTIFACTS / 'saved-reader-send-mobile.png'))
            page.locator('#receipt-panel').screenshot(path=str(ARTIFACTS / 'personal-sender-receipt-mobile.png'))
            anonymous = browser.new_context(ignore_https_errors=True, viewport={'width':390,'height':844})
            login_page = anonymous.new_page()
            login_page.goto(ORIGIN + '/app#oauth-grants')
            expect(login_page).to_have_title('Sign in · Connected applications · Palim')
            expect(login_page.locator('#workspace-subtitle')).to_have_text('Sign in to review the apps with access to your account.')
            expect(login_page.locator('#login-email')).to_be_visible()
            login_page.goto(ORIGIN + '/app#sender-address')
            expect(login_page).to_have_title('Sign in · Personal sender address · Palim')
            expect(login_page.locator('#workspace-subtitle')).to_have_text('Sign in to see the address to approve in Amazon.')
            expect(login_page.locator('#login-email')).to_be_visible()
            expect(login_page.locator('#sender-address')).to_be_hidden()
            login_page.route('**/auth/email-otp/send-verification-otp', lambda route: route.fulfill(status=200, content_type='application/json', body='{"message":"Check your inbox.","resendAfterSeconds":60}'))
            login_page.goto(ORIGIN + '/app', wait_until='networkidle')
            login_page.clock.install()
            login_page.set_viewport_size({'width':320,'height':844})
            login_page.locator('#login-email').fill('synthetic.long.address.for.a.narrow.screen@example.invalid')
            login_page.locator('#login-email-form button').click()
            expect(login_page.locator('#login-code-form')).to_be_visible()
            expect(login_page.locator('#login-expiry')).to_have_text('Expires five minutes after sending.')
            for text_size in ['100%', '200%']:
                login_page.evaluate('size => document.documentElement.style.fontSize = size', text_size)
                recipient = login_page.locator('#login-sent').bounding_box()
                change = login_page.locator('#change-login-email').bounding_box()
                assert change['y'] >= recipient['y'] + recipient['height']
                assert not login_page.evaluate('document.documentElement.scrollWidth > innerWidth')
                assert login_page.locator('#login-sent').evaluate('el => el.scrollWidth <= el.clientWidth')
                login_page.locator('#change-login-email').focus()
                expect(login_page.locator('#change-login-email')).to_be_in_viewport()
            login_page.evaluate("document.documentElement.style.removeProperty('font-size')")
            login_page.set_viewport_size({'width':390,'height':844})
            login_page.locator('#login-code').fill('123456')
            expect(login_page.locator('#resend-login')).to_be_disabled()
            login_page.clock.fast_forward(61000)
            expect(login_page.locator('#resend-login')).to_be_enabled()
            for reply in [lambda route: route.abort('failed'), lambda route: route.fulfill(status=200, content_type='application/json', body='{')]:
                login_page.route('**/auth/email-otp/send-verification-otp', reply, times=1)
                login_page.locator('#resend-login').click()
                expect(login_page.locator('#login-code-form .action-feedback.error')).to_be_focused()
                expect(login_page.locator('#login-code-form .action-feedback.error')).to_have_text('Check your inbox before requesting another code. The new code may already be on its way.')
                expect(login_page.locator('#login-code')).to_have_value('123456')
                expect(login_page.locator('#login-sent')).not_to_contain_text('latest')
                expect(login_page.locator('#login-code-form button[type=submit]')).to_be_enabled()
            login_page.locator('#resend-login').click()
            expect(login_page.locator('#login-sent')).to_contain_text('your latest code')
            expect(login_page.locator('#login-code')).to_have_value('')
            expect(login_page.locator('#login-code')).to_be_focused()
            recipient = login_page.locator('#login-sent').bounding_box()
            change = login_page.locator('#change-login-email').bounding_box()
            assert change['y'] >= recipient['y'] + recipient['height']
            login_page.screenshot(path=str(ARTIFACTS / 'cleanup-signin-mobile.png'), full_page=True)
            login_page.set_viewport_size({'width':1440,'height':1000})
            login_page.screenshot(path=str(ARTIFACTS / 'cleanup-signin-desktop.png'), full_page=True)
            login_page.route('**/auth/sign-in/email-otp', lambda route: route.fulfill(status=401, content_type='text/plain', body=''), times=1)
            login_page.locator('#login-code').fill('123456')
            login_page.locator('#login-code-form button[type=submit]').click()
            expect(login_page.locator('#login-code')).to_be_focused()
            expect(login_page.locator('#login-code')).to_have_attribute('aria-invalid', 'true')
            expect(login_page.locator('#login-code')).to_have_accessible_description(re.compile('^Check the code'))
            login_page.locator('#change-login-email').click()
            expect(login_page.locator('#login-code-form .action-feedback')).to_have_text('')
            expect(login_page.locator('#login-code')).not_to_have_attribute('aria-invalid', 'true')
            email_field = login_page.locator('#login-email')
            expect(email_field).to_be_focused()
            code_requests = []
            login_page.on('request', lambda req: code_requests.append(req.post_data_json['email']) if req.url.endswith('/send-verification-otp') else None)
            login_page.get_by_role('button', name='Back to code').click()
            expect(login_page.locator('#login-code')).to_be_focused()
            expect(login_page.locator('#login-sent')).to_contain_text('your latest code')
            expect(login_page.locator('#login-code')).to_have_value('')
            login_page.locator('#login-code').fill('012')
            login_page.locator('#change-login-email').click()
            login_page.get_by_role('button', name='Back to code').click()
            expect(login_page.locator('#login-code')).to_have_value('012')
            login_page.locator('#change-login-email').click()
            login_page.keyboard.type('corrected@example.invalid')
            expect(login_page.locator('#login-email-form button')).to_have_text('Email me a code')
            expect(email_field).to_have_value('corrected@example.invalid')
            assert code_requests == []
            pending_code = []
            login_page.route('**/auth/email-otp/send-verification-otp', lambda route: pending_code.append(route), times=1)
            login_page.get_by_role('button', name='Email me a code').click()
            expect(login_page.get_by_role('button', name='Requesting code…')).to_be_disabled()
            expect(email_field).to_be_disabled()
            expect(login_page.locator('#login-code')).to_be_hidden()
            assert len(pending_code) == 1
            pending_code[0].fulfill(status=200, json={'resendAfterSeconds':60})
            expect(login_page.locator('#login-sent strong')).to_have_text('corrected@example.invalid')
            expect(login_page.locator('#login-code')).to_be_focused()
            expect(login_page.locator('#login-code')).to_have_value('')
            assert code_requests == ['corrected@example.invalid']
            anonymous.close()
            assert post('/api/destination', {'email':travel['email']})[0] == 404
            assert post('/api/confirm', {'code':'0000000000'})[0] == 404
            # Optional name, first default, five-address limit, and useful capacity feedback.
            nicknames = ['My Kindle', 'MY KINDLE', 'My Kindle']
            emails = ['extra-0@kindle.com', 'extra-1@kindle.com', 'long-address-' + 'a' * 48 + '@kindle.com']
            for i in range(3):
                open_settings(page)
                page.locator('#kindle-email').fill(emails[i])
                page.locator('#reader-label').fill(nicknames[i] if i == 1 else '')
                page.locator('#destination-form button').click()
                expect(page.locator('#reader-list .reader-item')).to_have_count(3+i)
            assert any(d['label']=='My Kindle' for d in json.loads(request('/api/account')[2])['destinations'])
            expect(page.locator('#destination-form')).to_be_hidden()
            expect(page.locator('.reader-item').filter(has_text=emails[2])).to_be_focused()
            open_settings(page)
            for i in range(3):
                name = f'{nicknames[i]} · {emails[i]}'
                expect(page.get_by_role('button', name=f'Remove {name}', exact=True)).to_have_count(1)
                expect(page.get_by_role('button', name=f'Make default: {name}', exact=True)).to_have_count(1)
            page.set_viewport_size({'width':320,'height':844})
            select_view(page, 'Create')
            page.locator('#created .share-trigger').click()
            expect(page.locator('#send-reader')).to_have_attribute('aria-describedby', 'send-target')
            duplicate_label = f'My Kindle · {emails[2]}'
            page.locator('#send-reader').select_option(label=duplicate_label)
            assert page.locator('#send-reader').get_attribute('aria-describedby') is None
            expect(page.locator('#send-target')).to_have_text(f'To {emails[2]}')
            expect(page.locator('#send-target')).to_be_in_viewport()
            for selector in ['#send-reader', '#send-target', '#share-send']:
                bounds = page.locator(selector).bounding_box()
                assert 0 <= bounds['x'] and bounds['x'] + bounds['width'] <= 320
            page.locator('#share-dialog').screenshot(path=str(ARTIFACTS / 'send-long-address-320.png'))
            assert page.locator('#share-dialog').evaluate('el => el.scrollWidth <= el.clientWidth')
            page.evaluate("document.documentElement.style.fontSize = '200%'")
            expect(page.locator('#send-target')).to_have_text(f'To {emails[2]}')
            for selector in ['#share-dialog', '#send-target']:
                assert page.locator(selector).evaluate('el => el.scrollWidth <= el.clientWidth'), selector
            page.set_viewport_size({'width':568,'height':320})
            dialog = page.locator('#share-dialog')
            assert dialog.bounding_box()['height'] >= 300
            page.locator('#send-reader').focus()
            page.keyboard.press('Tab')
            expect(page.locator('#share-send')).to_be_focused()
            expect(page.locator('#share-send')).to_be_in_viewport(ratio=1)
            page.keyboard.press('Shift+Tab')
            expect(page.locator('#send-reader')).to_be_focused()
            expect(page.locator('#send-reader')).to_be_in_viewport(ratio=1)
            page.set_viewport_size({'width':320,'height':844})
            page.evaluate("document.documentElement.style.removeProperty('font-size')")
            page.keyboard.press('Escape')
            open_settings(page)
            page.set_viewport_size({'width':390,'height':844})
            expect(page.locator('#destination-status')).to_have_text('5 of 5 saved')
            expect(page.locator('#reader-limit')).to_have_text('Remove a saved address to add another.')
            expect(page.locator('#reader-limit')).to_be_visible()
            page.locator('.reader-panel').screenshot(path=str(ARTIFACTS / 'ux-address-limit-mobile.png'))
            for width,height,label in [(390,844,'mobile'),(1440,1000,'desktop')]:
                page.set_viewport_size({'width':width,'height':height})
                assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
                page.screenshot(path=str(ARTIFACTS / f'ux-workspace-{label}.png'),full_page=True)
            page.set_viewport_size({'width':390,'height':844})
            page.evaluate('document.documentElement.style.fontSize="200%"')
            assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
            default_row = page.locator('.reader-item').filter(has=page.locator('.default-address'))
            email_bounds = default_row.locator('p').bounding_box()
            remove_bounds = default_row.get_by_role('button').bounding_box()
            assert remove_bounds['y'] >= email_bounds['y'] + email_bounds['height']
            assert remove_bounds['x'] <= email_bounds['x'] < remove_bounds['x'] + remove_bounds['width']
            brand = page.locator('.nav .wordmark').bounding_box()
            menu = page.locator('#studio-menu summary').bounding_box()
            assert brand['x'] + brand['width'] <= menu['x'], 'Header controls overlap at 200% text'
            page.screenshot(path=str(ARTIFACTS / 'ux-text-zoom-mobile.png'),full_page=True)
            page.evaluate('document.documentElement.style.fontSize=""')
            page.emulate_media(reduced_motion='reduce')
            assert page.evaluate('getComputedStyle(document.documentElement).scrollBehavior') == 'auto'
            signed_out=browser.new_context(ignore_https_errors=True,viewport={'width':390,'height':844})
            login_page=signed_out.new_page()
            login_page.goto(ORIGIN+'/app',wait_until='networkidle')
            long_address = 'a' * 64 + '@' + ('b' * 63 + '.') * 3 + 'com'
            login_page.locator('#login-email').fill(long_address)
            login_page.locator('#login-email-form button').click()
            expect(login_page.locator('#login-email')).to_have_accessible_description('Use an email address with 254 characters or fewer.')
            expect(login_page.locator('#login-email')).to_have_value(long_address)
            login_page.locator('#login-email').fill('reader@')
            login_page.locator('#login-email-form button').click()
            expect(login_page.locator('#login-email')).to_have_accessible_description('Enter a complete email address, such as name@example.com.')
            expect(login_page.locator('#login-email')).to_be_focused()
            login_page.locator('#login-email').fill('')
            expect(login_page.locator('#login-email')).to_have_accessible_description('Enter your email address.')
            login_page.locator('#login-email').fill('reader@example')
            login_page.locator('#login-email-form button').click()
            expect(login_page.locator('#login-email')).to_have_accessible_description('Enter a complete email address, such as name@example.com.')
            expect(login_page.locator('#login-email')).to_be_focused()
            login_page.locator('#login-email').fill('reader@kindle.com')
            expect(login_page.locator('#login-email')).to_have_accessible_description('That’s a Kindle delivery address. Enter your regular email address.')
            login_page.locator('#login-email-form button').click()
            expect(login_page.locator('#login-email-form .action-feedback')).to_have_text('That’s a Kindle delivery address. Enter your regular email address.')
            expect(login_page.locator('#login-email')).to_be_focused()
            assert database.execute('SELECT count(*) FROM proof_mail').fetchone()[0] == 1
            login_page.screenshot(path=str(ARTIFACTS / 'ux-login-inbox-mobile.png'),full_page=True)
            login_page.locator('#login-email').fill('reader..test@example.invalid')
            login_page.locator('#login-email-form button').click()
            expect(login_page.locator('#login-email')).to_have_accessible_description('Enter a valid inbox email.')
            expect(login_page.locator('#login-email')).to_be_focused()
            expect(login_page.locator('#login-email')).to_have_attribute('aria-invalid', 'true')
            login_page.locator('#login-email').fill('reader@example.invalid')
            expect(login_page.locator('#login-email-form .action-feedback')).to_be_hidden()
            login_page.route('**/auth/email-otp/send-verification-otp', lambda route: route.abort('failed'), times=1)
            login_page.locator('#login-email-form button').click()
            expect(login_page.locator('#login-email-form .action-feedback')).to_contain_text('Connection failed')
            login_page.locator('#login-email').fill('other@example.invalid')
            expect(login_page.locator('#login-email-form .action-feedback')).to_be_hidden()
            signed_out.close()
            surface = context.new_page()
            for path, label in [('/app','workspace'), ('/','landing'), ('/privacy.html','privacy')]:
                surface.goto(ORIGIN + path, wait_until='networkidle')
                for width, height, size in [(390,844,'mobile'), (1440,1000,'desktop')]:
                    surface.set_viewport_size({'width':width,'height':height})
                    assert not surface.evaluate('document.documentElement.scrollWidth > innerWidth')
                    surface.screenshot(path=str(ARTIFACTS / f'cleanup-{label}-{size}.png'))
            surface.close()
            select_view(page, 'Create')
            page.locator('#created .result-edit').click()
            expect(page.locator('#create-form button[type=submit]')).to_have_text('Create another EPUB')
            second_title = 'A field guide to reading illustrated books on a small screen'
            page.set_viewport_size({'width':320,'height':844})
            page.evaluate('document.documentElement.style.fontSize="200%"')
            actions = page.locator('#create-form .actions')
            for button in actions.get_by_role('button').all():
                assert button.evaluate('el => el.scrollWidth <= el.clientWidth && el.getBoundingClientRect().right <= innerWidth')
            actions.screenshot(path=str(ARTIFACTS / 'edit-actions-320-large-text.png'))
            page.evaluate('document.documentElement.style.removeProperty("font-size")')
            page.locator('#title').fill(second_title)
            page.locator('#create-form button[type=submit]').click()
            expect(page.locator('#created h2')).to_have_text(second_title)
            title_box = page.locator('#created h2').bounding_box()
            edit_box = page.locator('#created .result-edit').bounding_box()
            assert title_box['y'] + title_box['height'] <= edit_box['y'] + 1
            assert page.locator('#created').evaluate('el => el.scrollWidth <= el.clientWidth')
            page.locator('#created').screenshot(path=str(ARTIFACTS / 'created-long-title-320.png'))
            page.evaluate('document.documentElement.style.fontSize="200%"')
            status_box = page.locator('#created .artifact-topline').bounding_box()
            edit_box = page.locator('#created .result-edit').bounding_box()
            assert edit_box['y'] >= status_box['y'] + status_box['height']
            edit_text = page.locator('#created .result-edit').evaluate('''button => {
                const range = document.createRange();
                range.selectNodeContents(button);
                return range.getBoundingClientRect().left;
            }''')
            assert abs(edit_text - status_box['x']) <= 1
            assert page.locator('#created').evaluate('el => el.scrollWidth <= el.clientWidth')
            page.locator('#created .result-header').screenshot(path=str(ARTIFACTS / 'created-header-320-large-text.png'))
            page.evaluate('document.documentElement.style.removeProperty("font-size")')
            page.locator('#created .share-trigger').click()
            for i in range(3):
                expect(page.get_by_role('option', name=f'{nicknames[i]} · {emails[i]}', exact=True)).to_have_count(1)
            recovered_id = page.locator('#created').get_attribute('data-artifact-id')
            expect(page.locator(f'#shelf-title-{recovered_id}')).to_have_count(1)
            draft = {field: page.locator('#' + field).input_value() for field in ['title', 'manuscript', 'creator', 'language']}
            page.route('**/api/send', lambda route: route.fulfill(status=404, json={
                'code':'ARTIFACT_NOT_FOUND', 'message':'This document has expired.',
            }), times=1)
            page.locator('#share-send').click()
            expect(page.locator(f'#shelf-title-{recovered_id}')).to_have_count(0)
            page.get_by_role('link', name='Return to manuscript').press('Enter')
            expect(page.locator('#share-dialog')).to_be_hidden()
            expect(page.locator('#receipt-panel')).to_be_hidden()
            expect(page.locator('#back-created')).to_be_hidden()
            expect(page.locator('#manuscript')).to_be_focused()
            for field, value in draft.items():
                expect(page.locator('#' + field)).to_have_value(value)
            expect(page.locator('#create-form button[type=submit]')).to_have_text('Create EPUB')
            # Reload restores the fixture whose expiry was simulated in the browser.
            page.reload()
            page.locator('.reader-tabs a[href="#files-panel"]').click()
            rows = page.locator('#shelf article')
            assert rows.count() >= 2
            shelf_row = rows.filter(has=page.locator(f'#shelf-title-{recovered_id}'))
            for count in range(rows.count(), 0, -1):
                row_index = shelf_row.evaluate('row => [...row.parentElement.children].indexOf(row)')
                shelf_row.locator('.share-trigger').click()
                page.route('**/api/send', lambda route: route.fulfill(status=404, json={
                    'code':'ARTIFACT_NOT_FOUND', 'message':'This document has expired.',
                }), times=1)
                page.locator('#share-send').click()
                expect(rows).to_have_count(count - 1)
                page.keyboard.press('Escape')
                if count > 1:
                    shelf_row = rows.nth(min(row_index, count - 2))
                    expect(shelf_row.locator('h3 button')).to_be_focused()
            create_from_shelf = page.locator('#empty-shelf-actions').get_by_role('link', name='Create a book')
            expect(page.locator('#empty-shelf-help')).to_have_text('Files expire 24 hours after creation or upload.')
            expect(create_from_shelf).to_be_focused()
            page.keyboard.press('Enter')
            expect(page.locator('#create-editor')).to_be_visible()
            open_settings(page)
            page.get_by_role('button', name=f'Remove My Kindle · {emails[2]}', exact=True).click()
            expect(page.locator('#destination-status')).to_have_text('4 of 5 saved')
            expect(page.locator('#destination-form')).to_be_visible()
            expect(page.locator('#reader-limit')).to_be_hidden()
            expect(page.locator('#reader-list .reader-item:focus')).to_have_count(1)
            page.locator('#kindle-email').fill('extra-1@kindle.com')
            page.locator('#destination-form button').click()
            expect(saved_notice).to_have_text('Saved extra-1@kindle.com.')
            page.get_by_role('button', name='Remove MY KINDLE · extra-1@kindle.com', exact=True).click()
            expect(saved_notice).to_be_empty()
            address_label = 'reader@kindle.com'
            page.locator('#kindle-email').fill(address_label)
            page.locator('#reader-label').fill(address_label)
            page.locator('#destination-form button').click()
            address_row = page.get_by_role('group', name=address_label, exact=True)
            expect(address_row).to_be_visible()
            assert address_row.inner_text().count(address_label) == 1
            expect(address_row.get_by_role('button', name='Remove ' + address_label)).to_be_enabled()
            second_address = 'other-reader@kindle.com'
            page.locator('#kindle-email').fill(second_address)
            page.locator('#reader-label').fill(address_label)
            page.locator('#destination-form button').click()
            expect(page.locator('#destination-status')).to_have_text('5 of 5 saved')
            expect(address_row.get_by_role('button', name='Remove ' + address_label, exact=True)).to_be_enabled()
            choices = page.locator('#send-reader option').all_text_contents()
            assert address_label in choices and f'{address_label} · {second_address}' in choices
            page.get_by_role('button', name='Remove ' + address_label, exact=True).click()
            nickname = address_label + '.au'
            page.locator('#kindle-email').fill(address_label)
            page.locator('#reader-label').fill(nickname)
            page.locator('#destination-form button').click()
            remove_named = page.get_by_role('button', name='Remove ' + nickname, exact=True)
            expect(remove_named).to_have_accessible_description(address_label)
            set_default = page.get_by_role('button', name='Make default: ' + nickname, exact=True)
            expect(set_default).to_have_accessible_description(address_label)
            pending_default = []
            page.route('**/api/destinations/*/default', lambda route: pending_default.append(route), times=1)
            set_default.press('Enter')
            expect(remove_named).to_be_disabled()
            expect(page.get_by_role('button', name='Setting default…: ' + nickname, exact=True)).to_be_disabled()
            pending_default.pop().continue_()
            expect(page.get_by_role('group', name=f'{nickname}, {address_label}, Default', exact=True)).to_be_focused()
            expect(remove_named).to_have_accessible_description(address_label + ' Default')
            def lose_removal_reply(route):
                assert route.fetch().ok
                route.abort('failed')
            page.route('**/api/destinations/*', lose_removal_reply, times=1)
            remove_named.click()
            row_notice = remove_named.locator('xpath=ancestor::*[@role="group"]').get_by_role('alert')
            expect(row_notice).to_be_focused()
            expect(row_notice).to_have_text('Couldn’t confirm the change. Check saved addresses')
            address_check = []
            page.route('**/api/account', lambda route: address_check.append(route), times=1)
            row_notice.get_by_role('button', name='Check saved addresses').press('Enter')
            expect(row_notice.get_by_role('button', name='Checking…')).to_be_disabled()
            address_check.pop().abort('failed')
            expect(row_notice).to_be_focused()
            expect(row_notice).to_have_text('Couldn’t load your saved addresses. Check saved addresses')
            row_notice.get_by_role('button', name='Check saved addresses').press('Enter')
            expect(page.locator('#destination-status')).to_be_focused()
            expect(page.locator('#destination-status')).to_have_text('4 of 5 saved')
            expect(remove_named).to_have_count(0)
            assert database.execute('SELECT count(*) FROM proof_mail').fetchone()[0] == 1
            browser.close()
        cookies[:] = [foreign_cookie]
        foreign_account=json.loads(request('/api/account')[2])
        assert foreign_account['destinations'] == [] and foreign_account['sender'] != personal_sender
        assert post('/api/destinations/' + travel['id'] + '/default', {})[0] == 404
        assert request('/api/destinations/' + travel['id'], 'DELETE')[0] == 404
        print('PASS: native Pages save/list/default/selection and personal-sender delivery to captured mail, no Kindle code; isolated accounts, retired endpoints, no OAuth registration/grants or real email.')
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
        origin = json.loads((ROOT / 'wrangler.jsonc').read_text())['vars']['ORIGIN']
        assert connection['mcpServers']['palim']['url'] == origin + '/mcp'
        assert manifest['interface']['websiteURL'] == origin
        assert manifest['interface']['privacyPolicyURL'] == origin + '/privacy'
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
        code = re.search(r'(?m)^(\d{6})$', mail['text']).group(1)
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
    assert 'reader@example.invalid' in page
    assert 'Switch account' in page
    assert '30 days' in page
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
    assert 'no skill installation' in json.loads(payload)['result']['instructions'].lower()
    assert ORIGIN + '/app' in json.loads(payload)['result']['instructions']
    status, _, payload = post('/mcp', {'jsonrpc': '2.0', 'id': 2, 'method': 'tools/list', 'params': {}}, auth)
    tools = json.loads(payload)['result']['tools']
    assert sorted(t['name'] for t in tools) == ['create_book', 'get_artifact', 'get_delivery', 'get_guide', 'import_image', 'list_destinations', 'send_document']
    status, _, guide_payload = post('/mcp', {'jsonrpc': '2.0', 'id': 20, 'method': 'tools/call', 'params': {'name': 'get_guide', 'arguments': {}}}, auth)
    guide_result = json.loads(guide_payload)['result']
    assert status == 200 and not guide_result.get('isError')
    status, _, options_payload = post('/mcp', {'jsonrpc': '2.0', 'id': 21, 'method': 'tools/call', 'params': {'name': 'list_destinations', 'arguments': {}}}, auth)
    options_result = json.loads(options_payload)['result']
    assert status == 200 and not options_result.get('isError')
    assert options_result['structuredContent'] == json.loads(options_result['content'][0]['text'])
    assert options_result['structuredContent']['destinations'] == []
    assert options_result['structuredContent']['setupUrl'] == ORIGIN + '/app#studio-settings'
    assert 'Never call create_book to forward an original' in guide_result['content'][0]['text']
    status, _, payload = post('/mcp', {'jsonrpc': '2.0', 'id': 3, 'method': 'tools/call', 'params': {'name': 'create_book', 'arguments': {'title': 'Native runtime proof', 'chapters': [{'title': 'A real local journey', 'markdown': 'Created through actual workerd, OAuth PKCE, D1, R2 and the MCP transport. No live email was sent.'}]}}}, auth)
    result = json.loads(payload)['result']
    assert status == 200 and not result.get('isError'), result
    artifact = json.loads(result['content'][0]['text'])
    assert result['structuredContent'] == artifact
    download = urllib.parse.urlsplit(artifact['downloadUrl'])
    assert download.netloc == urllib.parse.urlsplit(ORIGIN).netloc
    status, _, epub = request(download.path + '?' + download.query)
    assert status == 200 and hashlib.sha256(epub).hexdigest() == artifact['sha256']
    (ARTIFACTS / 'native-runtime-proof.epub').write_bytes(epub)
    status, _, payload = post('/mcp', {'jsonrpc': '2.0', 'id': 22, 'method': 'tools/call', 'params': {'name': 'get_artifact', 'arguments': {'artifactId': artifact['artifactId']}}}, auth)
    refreshed = json.loads(payload)['result']
    assert status == 200 and not refreshed.get('isError'), refreshed
    assert refreshed['structuredContent'] == json.loads(refreshed['content'][0]['text'])
    for key in ['artifactId', 'sha256', 'bytes', 'expiresAt']:
        assert refreshed['structuredContent'][key] == artifact[key]
    assert refreshed['structuredContent']['linksExpireAt'] < artifact['expiresAt']
    renewed_download = urllib.parse.urlsplit(refreshed['structuredContent']['downloadUrl'])
    status, _, renewed_epub = request(renewed_download.path + '?' + renewed_download.query)
    assert status == 200 and renewed_epub == epub
    status, _, payload = post('/api/send', {'artifactId': artifact['artifactId']})
    assert status == 400 and json.loads(payload)['code'] == 'DESTINATION_REQUIRED'
    status, _, _ = request('/api/files/' + artifact['artifactId'], 'DELETE')
    assert status == 200
    assert request(download.path + '?' + download.query)[0] == 404
    status, _, recovery = request(download.path + '?' + download.query, headers={'Accept': 'text/html'})
    assert status == 404 and b'<h1>File unavailable</h1>' in recovery
    assert b'href="/app#create-panel">Recreate from manuscript' in recovery
    assert b'href="/app#upload-panel">Upload original file' in recovery
    assert b'ask them for another copy' in recovery
    assert b'#files-panel' not in recovery
    assert post('/mcp', {'jsonrpc': '2.0', 'id': 4, 'method': 'tools/list', 'params': {}}, {'Authorization': 'Bearer invalid', 'Accept': 'application/json'})[0] == 401
    print('Native consent, PKCE, seven-tool discovery, MCP create, link refresh, download hash, missing-destination refusal and deletion passed.')

    assert json.loads(request('/api/account')[2])['hasMcpToken'] is False
    status, _, token_payload = post('/api/mcp-token', {})
    assert status == 201, (status, token_payload)
    personal_token = json.loads(token_payload)['token']
    assert personal_token.startswith('palim_')
    account_raw = request('/api/account')[2].decode()
    assert json.loads(account_raw)['hasMcpToken'] is True and personal_token not in account_raw
    token_auth = {'Authorization': 'Bearer ' + personal_token, 'Accept': 'application/json, text/event-stream'}
    status, _, init_res = post('/mcp', {'jsonrpc': '2.0', 'id': 30, 'method': 'initialize', 'params': {'protocolVersion': '2025-06-18', 'capabilities': {}, 'clientInfo': {'name': 'token-proof', 'version': '1'}}}, token_auth)
    assert status == 200 and json.loads(init_res)['result']['serverInfo']['name'] == 'palim'
    status, _, tools_res = post('/mcp', {'jsonrpc': '2.0', 'id': 31, 'method': 'tools/list', 'params': {}}, token_auth)
    assert status == 200 and len(json.loads(tools_res)['result']['tools']) == 7
    assert post('/mcp', {'jsonrpc': '2.0', 'id': 32, 'method': 'tools/list', 'params': {}}, {**token_auth, 'Origin': 'https://evil.example'})[0] == 403
    assert request('/api/account', headers={'Cookie': '', 'Authorization': 'Bearer ' + personal_token})[0] == 401
    status, _, revoke_payload = request('/api/mcp-token', 'DELETE')
    assert status == 200 and json.loads(revoke_payload)['hasMcpToken'] is False
    assert post('/mcp', {'jsonrpc': '2.0', 'id': 33, 'method': 'tools/list', 'params': {}}, token_auth)[0] == 401
    account_with_grant = json.loads(request('/api/account')[2])
    assert len(account_with_grant['grants']) == 1 and account_with_grant['grants'][0]['clientName'] == 'Disposable runtime proof'
    grant_id = account_with_grant['grants'][0]['id']
    if not args.browser:
        assert request('/api/oauth-grants/' + urllib.parse.quote(grant_id, safe=''), 'DELETE')[0] == 200
        assert json.loads(request('/api/account')[2])['grants'] == []
    print('Personal MCP bearer token creation, /mcp authentication, /api isolation, revocation, and OAuth grant listing/revocation passed.')

    if args.browser:
        from playwright.sync_api import sync_playwright, expect
        with sync_playwright() as browser_runner:
            browser = browser_runner.chromium.launch()
            context = browser.new_context(viewport={'width': 1440, 'height': 1000}, ignore_https_errors=True)
            errors = []
            browser_page = context.new_page()
            browser_page.on('pageerror', lambda error: errors.append(str(error)))
            browser_page.goto(ORIGIN, wait_until='networkidle')
            static_context = browser.new_context(java_script_enabled=False, ignore_https_errors=True)
            static_page = static_context.new_page()
            static_page.set_viewport_size({'width':320, 'height':844})
            assert static_page.goto(download.geturl()).status == 404
            static_page.evaluate("document.documentElement.style.fontSize = '200%'")
            create_link = static_page.get_by_role('link', name='Recreate from manuscript')
            forward_link = static_page.get_by_role('link', name='Upload original file')
            create_box, forward_box = create_link.bounding_box(), forward_link.bounding_box()
            assert forward_box['y'] >= create_box['y'] + create_box['height']
            assert create_box['width'] == forward_box['width']
            assert static_page.evaluate('document.documentElement.scrollWidth === innerWidth')
            create_link.focus()
            static_page.keyboard.press('Tab')
            expect(forward_link).to_be_focused()
            forward_link.press('Enter')
            expect(static_page).to_have_url(ORIGIN + '/app#upload-panel')
            expect(static_page.locator('#studio-script-help')).to_be_visible()
            expect(static_page.get_by_role('link', name='Use Palim with an agent')).to_have_attribute('href', 'https://github.com/timc0y/palim#connect-an-agent')
            static_page.goto(ORIGIN)
            static_page.keyboard.press('Tab')
            expect(static_page.get_by_role('link', name='Skip to content')).to_be_focused()
            static_page.keyboard.press('Enter')
            expect(static_page.get_by_role('heading', name='Ship a thing to a Kindle')).to_be_focused()
            static_page.keyboard.press('Tab')
            focused_cta = static_page.get_by_role('link', name='Connect an agent', exact=True)
            expect(focused_cta).to_be_focused()
            assert focused_cta.evaluate('el => { const r = el.getBoundingClientRect(); const css = getComputedStyle(el); const edge = parseFloat(css.outlineOffset) + parseFloat(css.outlineWidth); return r.left >= edge && r.right + edge <= innerWidth; }')
            expect(static_page.locator('#mcp-label')).to_have_text('MCP path on this site')
            expect(static_page.locator('#mcp-address')).to_have_text('/mcp')
            connect_toggle = static_page.locator('.connect summary')
            connect_toggle.press('Enter')
            expect(static_page.get_by_role('link', name='Connection guide')).to_be_visible()
            with static_page.expect_download() as plugin_download:
                static_page.get_by_role('link', name='Download Codex plugin (ZIP) for palim.pages.dev', exact=True).press('Enter')
            assert plugin_download.value.suggested_filename == 'palim-plugin.zip'
            static_page.get_by_role('link', name='Forward a file', exact=True).click()
            expect(static_page.locator('#studio-script-help')).to_be_visible()
            expect(static_page.locator('#workspace-subtitle')).to_be_hidden()
            expect(static_page.locator('.reader-tabs')).to_be_hidden()
            static_page.get_by_role('link', name='Palim home').click()
            expect(static_page.get_by_role('heading', name='Ship a thing to a Kindle')).to_be_visible()
            static_context.close()
            for link_name, studio_title, subtitle in [
                ('Studio', 'Create a book', 'Sign in to turn your manuscript into an EPUB.'),
                ('Forward a file', 'Forward a file', 'Sign in to upload your EPUB or PDF.'),
            ]:
                browser_page.get_by_role('link', name=link_name, exact=True).click()
                expect(browser_page.locator('#studio-title')).to_have_text(studio_title)
                expect(browser_page.locator('#workspace-subtitle')).to_have_text(subtitle)
                expect(browser_page.locator('#login-email')).to_be_visible()
                browser_page.get_by_role('link', name='Palim home').click()
            for width, height, label in [(390, 844, 'mobile'), (1440, 1000, 'desktop')]:
                browser_page.set_viewport_size({'width': width, 'height': height})
                expect(browser_page.locator('.connect__body')).to_be_hidden()
                expect(browser_page.get_by_role('heading', name='Ship a thing to a Kindle')).to_be_in_viewport()
                browser_page.screenshot(path=str(ARTIFACTS / f'landing-{label}.png'), full_page=True)
            for width in (320, 390, 639, 640, 768, 864, 1440):
                browser_page.set_viewport_size({'width': width, 'height': 900})
                if width in (390, 1440):
                    browser_page.screenshot(path=str(ARTIFACTS / f'publishing-desk-{width}.png'))
                cover_box = browser_page.locator('.book-page--cover').bounding_box()
                chapter_box = browser_page.locator('.book-page--chapter').bounding_box()
                if width >= 768:
                    assert cover_box['x'] < chapter_box['x']
                else:
                    assert cover_box['y'] < chapter_box['y']
                assert not browser_page.evaluate('document.documentElement.scrollWidth > innerWidth')
            browser_page.set_viewport_size({'width': 320, 'height': 480})
            browser_page.evaluate("document.documentElement.style.fontSize = '200%'")
            assert not browser_page.evaluate('document.documentElement.scrollWidth > innerWidth')
            browser_page.evaluate("document.documentElement.style.removeProperty('font-size')")
            browser_page.set_viewport_size({'width': 1440, 'height': 1000})
            browser_page.locator('.site-footer .privacy').focus()
            browser_page.keyboard.press('Shift+Tab')
            browser_page.keyboard.press('Tab')
            assert browser_page.locator('.site-footer .privacy').evaluate('(e)=>e.matches(":focus-visible")')
            light_focus = browser_page.locator('.site-footer .privacy').evaluate('(e)=>getComputedStyle(e).outlineColor')
            light_contrast = min(contrast(light_focus, bg) for bg in backdrop_colors(browser_page.locator('.site-footer')))
            assert light_contrast >= 3
            browser_page.locator('.site-footer').screenshot(path=str(ARTIFACTS / 'focus-light-footer.png'))
            browser_page.locator('.cta-primary').focus()
            browser_page.keyboard.press('Tab')
            browser_page.keyboard.press('Shift+Tab')
            assert browser_page.locator('.cta-primary').evaluate('(e)=>e.matches(":focus-visible")')
            primary_focus = browser_page.locator('.cta-primary').evaluate('(e)=>getComputedStyle(e).outlineColor')
            primary_contrast = min(contrast(primary_focus, bg) for bg in backdrop_colors(browser_page.locator('.hero')))
            assert primary_contrast >= 3
            browser_page.locator('.hero').screenshot(path=str(ARTIFACTS / 'focus-hero.png'))
            browser_page.locator('h1').click()
            context.grant_permissions(['clipboard-read', 'clipboard-write'])
            browser_page.locator('.connect summary').click()
            home_copy = browser_page.locator('#copy-mcp')
            browser_page.evaluate('''() => {
                Object.defineProperty(navigator.clipboard, 'writeText', {configurable:true,
                    value:() => new Promise((_, reject) => { window.rejectEarlierCopy = reject; })});
            }''')
            browser_page.locator('#copy-codex').click()
            expect(browser_page.locator('#copy-codex')).to_have_text('Copying…')
            expect(browser_page.locator('#copy-codex')).to_have_attribute('aria-busy', 'true')
            browser_page.keyboard.press('Escape')
            browser_page.locator('.connect summary').press('Enter')
            browser_page.evaluate("window.rejectEarlierCopy(Error('denied'))")
            expect(browser_page.locator('#copy-codex')).to_have_text('Copy')
            expect(browser_page.locator('#copy-codex')).not_to_have_attribute('aria-busy', 'true')
            expect(browser_page.locator('#codex-copy-feedback')).to_be_empty()
            browser_page.locator('#copy-codex').click()
            guide = browser_page.get_by_role('link', name='Connection guide', exact=True)
            browser_page.keyboard.press('Tab')
            expect(guide).to_be_focused()
            browser_page.evaluate("window.rejectEarlierCopy(Error('denied'))")
            expect(browser_page.locator('#copy-codex')).to_have_accessible_description('Couldn’t copy. Try again.')
            expect(browser_page.locator('#copy-mcp')).to_have_accessible_description('')
            expect(guide).to_be_focused()
            assert not browser_page.evaluate('getSelection().toString()')
            browser_page.locator('#copy-codex').click()
            browser_page.evaluate('delete navigator.clipboard.writeText')
            home_copy.scroll_into_view_if_needed()
            initial_bounds = home_copy.bounding_box()
            home_copy.click()
            expect(home_copy).to_have_text('Copied')
            assert browser_page.evaluate('navigator.clipboard.readText()') == ORIGIN + '/mcp'
            expect(browser_page.locator('#mcp-copy-feedback')).to_have_text('MCP address copied.')
            browser_page.evaluate("window.rejectEarlierCopy(Error('denied'))")
            expect(browser_page.locator('#copy-codex')).to_have_text('Copy')
            expect(browser_page.locator('.line__feedback:not(.sr-only)')).to_have_count(0)
            after_bounds = home_copy.bounding_box()
            assert after_bounds['width'] == initial_bounds['width'] and after_bounds['height'] == initial_bounds['height']
            expect(home_copy).to_have_text('Copy')
            expect(browser_page.locator('#mcp-copy-feedback')).to_be_empty()
            browser_page.evaluate("Object.defineProperty(navigator.clipboard, 'writeText', {configurable:true, value:async () => {throw Error('denied')}})")
            browser_page.locator('#copy-codex').click()
            expect(browser_page.locator('.line__feedback:not(.sr-only)')).to_have_text('Copy unavailable. Copy the selected text manually.')
            assert browser_page.evaluate('getSelection().toString()') == browser_page.locator('.line__commands').last.inner_text()
            expect(home_copy).to_have_text('Copy')
            browser_page.evaluate("getSelection().getRangeAt(0).setEnd(document.querySelector('.command').firstChild, 5)")
            expect(browser_page.locator('#copy-codex')).to_have_text('Copy')
            assert browser_page.evaluate('getSelection().toString()') == 'codex'
            browser_page.locator('#copy-codex').click()
            expect(browser_page.locator('#copy-codex')).to_have_text('Selected')
            browser_page.evaluate('delete navigator.clipboard.writeText')
            home_copy.click()
            expect(browser_page.locator('.line__feedback:not(.sr-only)')).to_have_count(0)
            expect(browser_page.locator('#copy-codex')).to_have_text('Copy')
            assert not browser_page.evaluate('getSelection().toString()')
            assert not browser_page.evaluate('document.documentElement.scrollWidth > innerWidth')
            print(f'Rendered focus contrast: primary action {primary_contrast:.2f}:1, footer {light_contrast:.2f}:1.')
            browser_page.set_viewport_size({'width': 390, 'height': 844})
            assert not browser_page.evaluate('document.documentElement.scrollWidth > innerWidth')
            browser_page.evaluate("Object.defineProperty(navigator.clipboard, 'writeText', {configurable:true, value:async () => {throw Error('denied')}})")
            browser_page.locator('#copy-codex').click()
            expect(browser_page.locator('#copy-codex')).to_have_text('Selected')
            browser_page.evaluate('delete navigator.clipboard.writeText')
            browser_page.keyboard.press('Escape')
            expect(browser_page.locator('.connect summary')).to_be_focused()
            expect(browser_page.locator('#copy-codex')).to_have_text('Copy')
            assert browser_page.evaluate('getSelection().rangeCount') == 0
            expect(browser_page.locator('.connect__body')).to_be_hidden()
            browser_page.locator('.connect summary').dispatch_event('keydown', {'key': 'Escape', 'repeat': True})
            expect(browser_page.locator('.connect summary')).to_be_focused()
            for path in ['/sample.html', '/sample.epub', '/example.json', '/images/sample-cover.png', '/images/sample-exposure.png']:
                assert request(path)[0] == 404, path
            sample_page = context.new_page()
            csp_errors = []
            sample_page.on('console', lambda message: csp_errors.append(message.text) if message.type == 'error' and 'Content Security Policy' in message.text else None)
            for width, height, label in [(390, 844, 'mobile'), (1440, 1000, 'desktop')]:
                sample_page.set_viewport_size({'width': width, 'height': height})
                sample_page.goto((ARTIFACTS / 'palim-sample.html').as_uri(), wait_until='networkidle')
                expect(sample_page.locator('h1')).to_have_count(1)
                expect(sample_page.locator('h4')).to_have_count(0)
                assert sample_page.locator('main h3').count() >= 3
                assert sample_page.evaluate("[...document.fonts].some(f=>f.family==='Manrope' && f.status==='loaded')")
                assert sample_page.locator('body').evaluate('(e)=>parseFloat(getComputedStyle(e).fontSize)') >= 18
                assert sample_page.evaluate("""() => {
                    const left = document.querySelector('.preview-heading').getBoundingClientRect().left;
                    return [...document.querySelectorAll('main > section > p, main > section > h3, figure > img, .caption-text')]
                        .every(e => Math.abs(e.getBoundingClientRect().left - left) <= 1);
                }""")
                assert not sample_page.evaluate('document.documentElement.scrollWidth > innerWidth')
                assert sample_page.locator('main section > p').first.bounding_box()['y'] < height - 80
                assert sample_page.evaluate('new Set([...document.querySelectorAll("[id]")].map(e=>e.id)).size === document.querySelectorAll("[id]").length')
                sample_page.screenshot(path=str(ARTIFACTS / f'sample-reader-{label}.png'), full_page=True)
                if label == 'mobile':
                    sample_page.evaluate('document.body.style.zoom="200%"')
                    assert not sample_page.evaluate('document.documentElement.scrollWidth > innerWidth')
                    sample_page.screenshot(path=str(ARTIFACTS / 'sample-reader-zoom-mobile.png'), full_page=True)
                    sample_page.evaluate('document.body.style.zoom="100%"')
                chart = sample_page.locator('.figure-bars img')
                assert chart.bounding_box()['width'] / 560 * 30 >= 14
                if label == 'mobile':
                    sample_page.locator('.figure-bars').screenshot(path=str(ARTIFACTS / 'chart-mobile.png'))
                    sample_page.locator('.figure-image').screenshot(path=str(ARTIFACTS / 'diagram-mobile.png'))
                sample_page.locator('main').screenshot(path=str(ARTIFACTS / f'sample-prose-{label}.png'))
                sample_page.goto(ORIGIN, wait_until='networkidle')
                sample_page.locator('.page-shell').screenshot(path=str(ARTIFACTS / f'sample-landing-{label}.png'))
                if label == 'mobile':
                    sample_page.evaluate("document.documentElement.style.fontSize = '200%'")
                    assert not sample_page.evaluate('document.documentElement.scrollWidth > innerWidth')
                    sample_page.evaluate("document.documentElement.style.removeProperty('font-size')")
            assert not csp_errors, csp_errors
            sample_page.close()
            # Inspect the actual packaged EPUB, rather than assuming its browser preview is identical.
            epub_dir = ARTIFACTS / 'sample-epub-unpacked'
            import shutil
            if epub_dir.exists():
                shutil.rmtree(epub_dir)
            with zipfile.ZipFile(ARTIFACTS / 'palim-sample.epub') as publication:
                assert 'EPUB/cover.xhtml' not in publication.namelist()
                assert not any(name.endswith('.svg') for name in publication.namelist())
                assert publication.read('EPUB/cover.png').startswith(b'\x89PNG\r\n\x1a\n')
                assert 'rendition:layout">reflowable' in publication.read('EPUB/package.opf').decode()
                publication.extractall(epub_dir)
            epub_page = context.new_page()
            for width, height, label in [(390, 844, 'mobile'), (1440, 1000, 'desktop')]:
                epub_page.set_viewport_size({'width': width, 'height': height})
                for chapter in ['title', 'chapter-1', 'chapter-2']:
                    epub_page.goto((epub_dir / 'EPUB' / f'{chapter}.xhtml').as_uri())
                    assert not epub_page.evaluate('document.documentElement.scrollWidth > innerWidth')
                    epub_page.screenshot(path=str(ARTIFACTS / f'epub-{chapter}-{label}.png'), full_page=True)
            epub_page.close()
            print('Local EPUB fixture preview, first-screen prose, unique headings/anchors and packaged EPUB XHTML reflow in Chromium passed (not an EPUB-reader engine).')
            browser_page.route('**/app.js', lambda route: route.abort(), times=1)
            browser_page.goto(ORIGIN + '/app#upload-panel')
            expect(browser_page.locator('#workspace-subtitle')).to_have_text('If Studio doesn’t open, reload this page.')
            expect(browser_page.locator('.reader-tabs')).to_be_hidden()
            browser_page.locator('#studio-menu summary').click()
            expect(browser_page.locator('.job-choices')).to_be_hidden()
            expect(browser_page.locator('.privacy-link')).to_be_visible()
            opening = []
            browser_page.route('**/api/account', lambda route: opening.append(route))
            browser_page.goto(ORIGIN + '/app', wait_until='commit')
            expect(browser_page.locator('#workspace-subtitle')).to_have_text('Opening your workspace…')
            browser_page.wait_for_function("document.readyState !== 'loading'")
            for _ in range(250):
                if opening:
                    break
                browser_page.wait_for_timeout(20)
            assert opening, "Expected the intercepted workspace request"
            opening.pop().abort()
            expect(browser_page.locator('#startup')).to_be_visible()
            expect(browser_page.locator('#workspace-subtitle')).to_be_hidden()
            browser_page.screenshot(path=str(ARTIFACTS / 'startup-retry-mobile.png'))
            expect(browser_page.locator('#startup-error')).to_have_text('Connection failed. Check your network.')
            expect(browser_page.locator('#signin')).to_be_hidden()
            browser_page.unroute('**/api/account')
            browser_page.route('**/api/account', lambda route: route.abort(), times=1)
            retry = browser_page.locator('#retry-startup')
            retry.press('Enter')
            expect(retry).to_be_enabled()
            expect(retry).to_be_focused()
            retry.press('Enter')
            browser_page.locator('#signin').wait_for(state='visible')
            expect(browser_page.locator('#startup')).to_be_hidden()
            expect(browser_page.locator('#login-email')).to_be_focused()
            expect(browser_page.locator('.settings-link')).to_be_hidden()
            browser_page.locator('#studio-menu summary').click()
            expect(browser_page.locator('.privacy-link')).to_be_visible()
            with context.expect_page() as policy_tab:
                browser_page.locator('.privacy-link').press('Enter')
            policy_page = policy_tab.value
            expect(policy_page).to_have_url(ORIGIN + '/privacy')
            expect(policy_page.get_by_role('heading', name='Privacy & limits', exact=True)).to_be_visible()
            policy_page.screenshot(path=str(ARTIFACTS / 'privacy-mobile.png'))
            policy_page.get_by_role('link', name='Shelf', exact=True).click()
            expect(policy_page.locator('#studio-title')).to_have_text('Shelf')
            expect(policy_page.locator('#signin')).to_be_visible()
            policy_page.go_back()
            expect(policy_page.get_by_role('heading', name='Privacy & limits')).to_be_visible()
            policy_page.get_by_role('link', name='Studio', exact=True).click()
            policy_page.locator('#signin').wait_for(state='visible')
            policy_page.close()
            browser_page.locator('#studio-menu summary').press('Escape')
            expect(browser_page.locator('#studio-menu summary')).to_be_focused()
            placeholder = browser_page.locator('#login-email').evaluate('(e)=>getComputedStyle(e,"::placeholder").color')
            field_bg = browser_page.locator('#login-email').evaluate('(e)=>getComputedStyle(e).backgroundColor')
            assert contrast(placeholder,field_bg) >= 4.5
            print(f'Rendered placeholder contrast: {contrast(placeholder,field_bg):.2f}:1.')
            browser_page.screenshot(path=str(ARTIFACTS / 'login-mobile.png'), full_page=True)
            browser_page.locator('.reader-tabs').get_by_role('link', name='Shelf').click()
            expect(browser_page.locator('#studio-title')).to_have_text('Shelf')
            expect(browser_page.locator('#workspace-subtitle')).to_have_text('Sign in to see your files.')
            expect(browser_page).to_have_title('Sign in · Shelf · Palim')
            expect(browser_page.get_by_role('navigation', name='Reader navigation').get_by_role('link', name='Shelf')).to_have_attribute('aria-current', 'page')
            browser_page.locator('#login-email').fill('browser@example.invalid')
            expect(browser_page.locator('#login-email')).to_have_js_property('enterKeyHint', 'go')
            browser_page.locator('#login-email').press('Enter')
            browser_page.locator('#login-code-form').wait_for(state='visible')
            expect(browser_page.locator('#resend-login')).to_be_disabled()
            expect(browser_page.locator('#login-code')).to_be_enabled()
            browser_page.screenshot(path=str(ARTIFACTS / 'login-code-mobile.png'), full_page=True)
            browser_mail = json.loads(database.execute('SELECT payload FROM proof_mail ORDER BY rowid DESC LIMIT 1').fetchone()[0])
            browser_code = re.search(r'(?m)^(\d{6})$', browser_mail['text']).group(1)
            browser_page.locator('#login-code').fill('12345x')
            browser_page.locator('#login-code-form button[type=submit]').click()
            expect(browser_page.locator('#login-code')).to_be_focused()
            expect(browser_page.locator('#login-code')).to_have_js_property('validationMessage', 'Enter the six digits from your email.')
            expect(browser_page.locator('#login-code-form .action-feedback')).to_have_text('Enter the six digits from your email.')
            expect(browser_page.locator('#login-expiry')).to_be_hidden()
            expect(browser_page.locator('#login-code')).to_have_accessible_description(re.compile('^Enter the six digits from your email'))
            browser_page.locator('#login-code').fill('111111' if browser_code == '000000' else '000000')
            browser_page.locator('#login-code-form button[type=submit]').click()
            expect(browser_page.locator('#login-code-form .action-feedback.error')).to_have_text('Check the code. If it has expired, use Resend code.')
            expect(browser_page.locator('#login-code')).to_have_accessible_description(re.compile('^Check the code'))
            browser_page.screenshot(path=str(ARTIFACTS / 'login-error-mobile.png'), full_page=True)
            expect(browser_page.locator('#login-code')).to_be_focused()
            browser_page.context.grant_permissions(['clipboard-read', 'clipboard-write'], origin=ORIGIN)
            code_field = browser_page.locator('#login-code')
            code_field.fill('123456')
            code_field.evaluate('field => field.setSelectionRange(2, 4)')
            browser_page.evaluate("navigator.clipboard.writeText(' - ')")
            browser_page.keyboard.press('ControlOrMeta+v')
            expect(code_field).to_have_value('123456')
            expect(code_field).to_have_accessible_description(re.compile('Paste the six-digit code from your email'))
            expect(browser_page.locator('#login-code-form .action-feedback')).to_have_text('Paste the six-digit code from your email.')
            browser_page.evaluate("navigator.clipboard.writeText('９８')")
            browser_page.keyboard.press('ControlOrMeta+v')
            expect(code_field).to_have_value('129856')
            assert code_field.evaluate('field => field.selectionStart === 4 && field.selectionEnd === 4')
            browser_page.evaluate("navigator.clipboard.writeText('０１２　３４５')")
            browser_page.keyboard.press('ControlOrMeta+v')
            expect(code_field).to_have_value('012345')
            browser_page.evaluate('(code) => navigator.clipboard.writeText(code)', browser_code[:3] + ' ' + browser_code[3:])
            browser_page.keyboard.press('ControlOrMeta+v')
            expect(browser_page.locator('#login-code')).to_have_value(browser_code)
            expect(browser_page.locator('#login-code-form .action-feedback')).to_be_hidden()
            expect(browser_page.locator('#login-expiry')).to_be_visible()
            expect(browser_page.locator('#login-code')).to_have_attribute('aria-describedby', 'login-sent login-expiry')
            expect(code_field).to_have_js_property('enterKeyHint', 'go')
            code_field.press('Enter')
            browser_page.locator('#desk').wait_for(state='visible')
            expect(browser_page.locator('#files-panel')).to_be_visible()
            expect(browser_page).to_have_title('Shelf · Palim')
            expect(browser_page.locator('#empty-shelf-help')).to_be_visible()
            browser_page.locator('#empty-shelf-actions a[href="#create-panel"]').click()
            expect(browser_page.locator('.connect-panel a[href="https://github.com/timc0y/palim#connect-an-agent"]')).to_have_count(1)
            expect(browser_page.locator('.connect-panel a[href="/palim-plugin.zip"]')).to_have_count(1)
            expect(browser_page.locator('#reader-choice')).to_be_hidden()
            browser_page.screenshot(path=str(ARTIFACTS / 'workspace-empty-mobile.png'), full_page=True)
            assert abs(browser_page.locator('#studio-title').bounding_box()['x'] - browser_page.locator('#title').bounding_box()['x']) <= 1
            assert browser_page.locator('#studio-menu summary').bounding_box()['y'] < 600
            browser_page.locator('.reader-tabs a[href="#files-panel"]').click()
            expect(browser_page.locator('#files-heading')).to_be_hidden()
            expect(browser_page.locator('#empty-shelf-help')).to_be_visible()
            browser_page.screenshot(path=str(ARTIFACTS / 'empty-shelf-mobile.png'))
            browser_page.set_viewport_size({'width':320,'height':844})
            empty_actions = browser_page.locator('#empty-shelf-actions a')
            first, second = [action.bounding_box() for action in empty_actions.all()]
            assert first['x'] == second['x'] and first['width'] == second['width']
            assert second['y'] >= first['y'] + first['height'] and second['x'] + second['width'] <= 320
            browser_page.set_viewport_size({'width':390,'height':844})
            browser_page.evaluate("document.documentElement.style.fontSize = '200%'")
            first, second = [action.bounding_box() for action in empty_actions.all()]
            assert first['x'] == second['x'] and first['width'] == second['width']
            assert second['y'] >= first['y'] + first['height'] and second['x'] + second['width'] <= 390
            assert empty_actions.last.evaluate('el => el.scrollWidth <= el.clientWidth')
            browser_page.evaluate("document.documentElement.style.removeProperty('font-size')")
            browser_page.locator('#empty-shelf-actions a[href="#upload-panel"]').click()
            expect(browser_page.locator('#upload-panel')).to_be_visible()
            context.clear_cookies()
            context.add_cookies([{'name': '__Host-palim', 'value': token, 'url': ORIGIN, 'httpOnly': True, 'secure': True, 'sameSite': 'Lax'}])
            for route, title in [('create-panel', 'Create a book'), ('upload-panel', 'Forward a file'), ('files-panel', 'Shelf'), ('studio-settings', 'Settings')]:
                browser_page.goto(ORIGIN)
                browser_page.locator(f'a[href="/app#{route}"]').first.click()
                expect(browser_page.locator('#studio-title')).to_have_text(title)
                expect(browser_page.locator('#' + route)).to_be_visible()
                browser_page.get_by_role('link', name='Palim home', exact=True).click()
                expect(browser_page.get_by_role('heading', name='Ship a thing to a Kindle')).to_be_visible()
            read_only = dict(params, scope='books:read')
            browser_page.goto(ORIGIN + '/authorize?' + urllib.parse.urlencode(read_only))
            expect(browser_page.locator('.consent-host')).to_have_text('localhost:3333')
            with context.expect_page() as policy_tab:
                browser_page.get_by_role('link', name='Access lasts up to 30 days (opens in a new tab)').click()
            expect(policy_tab.value.locator('#agent-access')).to_be_in_viewport()
            assert policy_tab.value.evaluate('document.referrer') == ''
            access_terms = policy_tab.value.locator('#agent-access + dl')
            expect(access_terms).to_contain_text('Review the permissions the app requests before you connect it.')
            access_terms.get_by_role('link', name='Connected applications').click()
            expect(policy_tab.value.locator('#grants-heading')).to_be_focused()
            expect(policy_tab.value.locator('#studio-title')).to_have_text('Settings')
            policy_tab.value.close()
            permissions = browser_page.locator('.consent li')
            expect(permissions).to_have_count(1)
            expect(permissions.first).to_contain_text('download files')
            expect(browser_page.get_by_text('send documents', exact=False)).to_have_count(0)
            for width in (320, 1440):
                browser_page.set_viewport_size({'width':width,'height':844})
                assert not browser_page.evaluate('document.documentElement.scrollWidth > innerWidth')
            browser_page.set_viewport_size({'width':390,'height':844})
            account_line = browser_page.locator('.consent-account > span').bounding_box()
            switch_account = browser_page.get_by_role('button', name='Switch account')
            switch_label = switch_account.evaluate('''el => {
                const range = document.createRange();
                range.selectNodeContents(el);
                return range.getBoundingClientRect().left;
            }''')
            assert abs(switch_label - account_line['x']) <= 1
            assert switch_account.bounding_box()['height'] >= 44
            browser_page.screenshot(path=str(ARTIFACTS / 'consent-mobile.png'), full_page=True)
            browser_page.set_viewport_size({'width':320,'height':844})
            browser_page.evaluate("document.documentElement.style.fontSize = '200%'")
            assert browser_page.evaluate('document.documentElement.scrollWidth === innerWidth')
            destination_label = browser_page.locator('.consent-destination dt').last.bounding_box()
            destination_value = browser_page.locator('.consent-host').bounding_box()
            assert destination_value['y'] >= destination_label['y'] + destination_label['height']
            connect_box, cancel_box = [button.bounding_box() for button in browser_page.locator('form.consent-actions button').all()]
            assert connect_box['x'] == cancel_box['x'] and connect_box['width'] == cancel_box['width']
            assert cancel_box['y'] >= connect_box['y'] + connect_box['height']
            browser_page.set_viewport_size({'width':390,'height':844})
            browser_page.goto(ORIGIN + '/app', wait_until='networkidle')
            browser_page.locator('#desk').wait_for(state='visible')
            expect(browser_page.locator('.connect-panel a[href="https://github.com/timc0y/palim#connect-an-agent"]')).to_have_count(1)
            expect(browser_page.locator('.connect-panel a[href="/palim-plugin.zip"]')).to_have_count(1)
            browser_page.keyboard.press('Tab')
            browser_page.locator('.workspace-page .nav .wordmark').focus()
            assert browser_page.locator('.workspace-page .nav .wordmark').evaluate('(e)=>e.matches(":focus-visible")')
            workspace_focus = browser_page.locator('.workspace-page .nav .wordmark').evaluate('(e)=>getComputedStyle(e).outlineColor')
            workspace_contrast = min(contrast(workspace_focus,bg) for bg in backdrop_colors(browser_page.locator('.workspace-page .nav')))
            assert workspace_contrast >= 3
            browser_page.locator('.workspace-page .nav').screenshot(path=str(ARTIFACTS / 'focus-workspace.png'))
            print(f'Rendered workspace focus contrast: {workspace_contrast:.2f}:1.')
            open_settings(browser_page)
            expect(browser_page.locator('#studio-settings')).to_be_visible()
            expect(browser_page.locator('#studio-title')).to_be_focused()
            grant = browser_page.get_by_role('group', name='Disposable runtime proof', exact=True)
            expect(grant.get_by_role('listitem')).to_have_text([
                'Read your books, download files and check delivery status.',
                'Create books and import images.',
                'List your saved Kindle address labels and send documents to a selected address.',
            ])
            disconnect = grant.get_by_role('button', name='Disconnect Disposable runtime proof')
            expect(disconnect).to_have_accessible_description(grant.locator('p').inner_text())
            disconnect_prompts = []
            def cancel_disconnect(dialog):
                disconnect_prompts.append(dialog.message)
                dialog.dismiss()
            browser_page.once('dialog', cancel_disconnect)
            disconnect.press('Enter')
            assert disconnect_prompts == ['Disconnect Disposable runtime proof? The app will need your approval to reconnect.']
            expect(disconnect).to_be_focused()
            browser_page.once('dialog', lambda dialog: dialog.accept())
            browser_page.route('**/api/oauth-grants/*', lambda route: route.abort('failed'), times=1)
            disconnect.click()
            error = grant.locator(':scope > [role=alert]')
            expect(error).to_be_focused()
            expect(error).to_have_text('Couldn’t confirm disconnection. Check connected applications.')
            with context.expect_page() as checked_access:
                error.get_by_role('link', name='Check connected applications (opens in a new tab)').press('Enter')
            expect(checked_access.value.locator('#grants-heading')).to_be_focused()
            expect(checked_access.value.get_by_role('button', name='Disconnect Disposable runtime proof')).to_be_visible()
            checked_access.value.once('dialog', lambda dialog: dialog.accept())
            checked_access.value.get_by_role('button', name='Disconnect Disposable runtime proof').click()
            expect(checked_access.value.get_by_role('status', name='', exact=True).filter(has_text='Disconnected Disposable runtime proof.')).to_be_visible()
            expect(checked_access.value.locator('#grant-list')).to_be_empty()
            checked_access.value.close()
            expect(disconnect).to_be_enabled()
            browser_page.once('dialog', lambda dialog: dialog.accept())
            pending_disconnect = []
            browser_page.route('**/api/oauth-grants/*', lambda route: pending_disconnect.append(route), times=1)
            disconnect.click()
            disconnecting = grant.get_by_role('button', name='Disconnecting… Disposable runtime proof', exact=True)
            expect(disconnecting).to_have_text('Disconnecting…')
            expect(disconnecting).to_be_disabled()
            pending_disconnect.pop().continue_()
            expect(browser_page.locator('#grants-heading')).to_be_hidden()
            expect(browser_page.locator('#oauth-grants').get_by_role('status')).to_be_focused()
            expect(browser_page.locator('#oauth-grants').get_by_role('status')).to_have_text('Disposable runtime proof is no longer listed as connected.')
            account_name = browser_page.locator('#account-name').inner_text()
            assert account_name == 'reader@example.invalid'
            for action in ['Sign out', 'Delete account']:
                expect(browser_page.get_by_role('button', name=action, exact=True)).to_have_accessible_description(account_name)
            previous_viewport = browser_page.viewport_size
            browser_page.set_viewport_size({'width':320, 'height':568})
            browser_page.evaluate("document.documentElement.style.fontSize = '200%'")
            account_email = browser_page.locator('#account-name')
            account_email.evaluate("(el, email) => el.textContent = email", 'a' * 64 + '@example.invalid')
            assert account_email.evaluate('el => el.scrollWidth <= el.clientWidth && el.getBoundingClientRect().right <= innerWidth')
            account_email.evaluate("(el, email) => el.textContent = email", account_name)
            browser_page.evaluate("document.documentElement.style.removeProperty('font-size')")
            browser_page.set_viewport_size(previous_viewport)
            logout_page = context.new_page()
            logout_page.set_viewport_size({'width':390, 'height':844})
            logout_page.goto(ORIGIN + '/app#studio-settings')
            logout_page.evaluate("document.documentElement.style.fontSize='150%'")
            logout_requests = []
            def capture_logout(route):
                logout_requests.append(route.request.method)
                route.fulfill(status=200, content_type='text/html', body='Signed out')
            logout_page.route('**/auth/logout', capture_logout)
            expect(logout_page.locator('#logout button')).to_be_visible()
            with logout_page.expect_response('**/auth/logout'):
                pending_state = logout_page.evaluate('''() => {
                    const form = document.querySelector('#logout');
                    const button = form.querySelector('button');
                    const remove = document.querySelector('#delete-account');
                    const bounds = () => [button, remove].map(el => el.getBoundingClientRect().toJSON());
                    const before = JSON.stringify(bounds());
                    button.click();
                    const stable = JSON.stringify(bounds()) === before;
                    let prevented = false;
                    form.addEventListener('submit', event => { prevented = event.defaultPrevented }, {once: true});
                    form.requestSubmit();
                    return [button.textContent, button.disabled, remove.disabled, prevented, stable];
                }''')
            assert pending_state == ['Signing out…', True, True, True, True]
            assert logout_requests == ['POST']
            logout_page.close()
            def cancel_account_deletion(dialog):
                assert dialog.message.startswith(f'Delete the Palim account for {account_name}?\n\n')
                assert 'permanently deletes your Shelf files' in dialog.message
                assert 'Files already in your Kindle library stay there.' in dialog.message
                dialog.dismiss()
            browser_page.once('dialog', cancel_account_deletion)
            browser_page.locator('#delete-account').press('Enter')
            expect(browser_page.locator('#delete-account')).to_be_focused()
            interrupted_deletion = []
            browser_page.route('**/api/account', lambda route: interrupted_deletion.append(route), times=1)
            browser_page.once('dialog', lambda dialog: dialog.accept())
            browser_page.locator('#delete-account').click()
            expect(browser_page.locator('#delete-account')).to_have_text('Deleting account…')
            expect(browser_page.locator('#logout button')).to_be_disabled()
            browser_page.set_viewport_size({'width':1440,'height':1000})
            interrupted_deletion.pop().abort('failed')
            expect(browser_page.locator('.account-actions [role=alert]')).to_have_text('Couldn’t confirm account deletion. Reload Settings to check whether you still have access.')
            account_error = browser_page.locator('.account-actions [role=alert]').bounding_box()
            for action in browser_page.locator('.account-actions button').all():
                bounds = action.bounding_box()
                assert account_error['y'] >= bounds['y'] + bounds['height']
                expect(action).to_be_enabled()
            browser_page.set_viewport_size(previous_viewport)
            expect(browser_page.locator('#studio-settings')).to_be_visible()
            browser_page.locator('#personal-token summary').click()
            interrupted_token = []
            browser_page.route('**/api/mcp-token', lambda route: interrupted_token.append(route), times=1)
            browser_page.once('dialog', lambda dialog: dialog.accept())
            browser_page.locator('#create-token').click()
            browser_page.locator('#personal-token summary').click()
            browser_page.locator('#personal-token summary').click()
            interrupted_token.pop().continue_()
            expect(browser_page.locator('#token-badge')).to_have_text('Active')
            expect(browser_page.locator('#token-value')).to_be_hidden()
            expect(browser_page.locator('#token-secret')).to_have_value('')
            expect(browser_page.locator('#personal-token summary')).to_be_focused()
            browser_page.once('dialog', lambda dialog: dialog.accept())
            browser_page.locator('#revoke-token').click()
            expect(browser_page.locator('#token-badge')).to_have_text('None')
            lost_token = []
            browser_page.route('**/api/mcp-token', lambda route: lost_token.append(route), times=1)
            browser_page.once('dialog', lambda dialog: dialog.accept())
            browser_page.locator('#create-token').click()
            expect(browser_page.locator('#create-token')).to_have_text('Creating…')
            deadline = time.monotonic() + 5
            while not lost_token and time.monotonic() < deadline:
                browser_page.wait_for_timeout(20)
            route = lost_token.pop()
            assert route.fetch().status == 201
            route.abort('failed')
            expect(browser_page.locator('#token-status')).to_contain_text('A token is active.')
            expect(browser_page.locator('#create-token')).to_have_text('Replace token')
            expect(browser_page.locator('#token-secret')).to_have_value('')
            browser_page.once('dialog', lambda dialog: dialog.accept())
            browser_page.locator('#revoke-token').click()
            expect(browser_page.locator('#token-badge')).to_have_text('None')
            browser_page.route('**/api/mcp-token', lambda route: lost_token.append(route), times=1)
            browser_page.route('**/api/account', lambda route: route.abort('failed'), times=1)
            browser_page.once('dialog', lambda dialog: dialog.accept())
            browser_page.locator('#create-token').click()
            expect(browser_page.locator('#create-token')).to_have_text('Creating…')
            deadline = time.monotonic() + 5
            while not lost_token and time.monotonic() < deadline:
                browser_page.wait_for_timeout(20)
            route = lost_token.pop()
            assert route.fetch().status == 201
            route.abort('failed')
            expect(browser_page.locator('#token-badge')).to_have_text('Unknown')
            pending_status = []
            browser_page.route('**/api/account', lambda route: pending_status.append(route), times=1)
            browser_page.get_by_role('button', name='Check token status').click()
            expect(browser_page.locator('#create-token')).to_have_text('Checking token status…')
            expect(browser_page.locator('#token-status')).to_be_empty()
            pending_status.pop().continue_()
            expect(browser_page.locator('#token-status')).to_have_attribute('role', 'status')
            expect(browser_page.locator('#token-status')).to_have_text('A token is active.')
            expect(browser_page.locator('#token-badge')).to_have_text('Active')
            browser_page.once('dialog', lambda dialog: dialog.accept())
            browser_page.locator('#revoke-token').click()
            expect(browser_page.locator('#token-badge')).to_have_text('None')
            for action, pending_label in [('create-token', 'Creating…'), ('create-token', 'Replacing…'), ('revoke-token', 'Revoking…')]:
                pending_token = []
                browser_page.route('**/api/mcp-token', lambda route: pending_token.append(route), times=1)
                browser_page.once('dialog', lambda dialog: dialog.accept())
                browser_page.locator('#' + action).click()
                expect(browser_page.locator('#' + action)).to_have_text(pending_label)
                expect(browser_page.locator('#' + action)).to_be_disabled()
                pending_token.pop().continue_()
                if action == 'create-token':
                    expect(browser_page.locator('#token-value')).to_be_visible()
                    expect(browser_page.locator('#token-secret')).to_have_accessible_name('Copy your token before closing this section.')
                    expect(browser_page.locator('#token-badge')).to_have_text('Active')
                    expect(browser_page.locator('#personal-token summary')).to_have_accessible_name('Personal MCP token')
                    expect(browser_page.locator('#personal-token summary')).to_have_accessible_description('Active')
                    browser_page.locator('#copy-token').click()
                    expect(browser_page.locator('#copy-token')).to_have_text('Copied')
                    assert browser_page.evaluate("navigator.clipboard.readText().then(value => value === document.getElementById('token-secret').value)")
                    browser_page.evaluate("() => { navigator.clipboard.writeText = async () => { throw Error('denied') } }")
                    browser_page.locator('#copy-token').press('Enter')
                    token_field = browser_page.locator('#token-secret')
                    expect(token_field).to_be_focused()
                    expect(token_field).to_have_accessible_description('Copy unavailable. Copy the selected text manually.')
                    assert token_field.evaluate('el => el.selectionStart === 0 && el.selectionEnd === el.value.length && el.value.length > 0')
                    token_field.press('Tab')
                    expect(browser_page.locator('#copy-token')).to_be_focused()
                    expect(browser_page.locator('#copy-token')).to_have_text('Copy')
                    expect(browser_page.locator('#token-status')).to_be_empty()
                    browser_page.evaluate("() => { navigator.clipboard.writeText = () => new Promise((_, reject) => { window.denyCopy = reject }) }")
                    browser_page.locator('#copy-token').click()
                    expect(browser_page.locator('#copy-token')).to_have_text('Copying…')
                    browser_page.locator('#personal-token summary').click()
                    expect(browser_page.locator('#token-secret')).to_have_value('')
                    browser_page.evaluate("window.denyCopy(); delete navigator.clipboard.writeText")
                    expect(browser_page.locator('#copy-token')).to_have_text('Copy')
                    expect(browser_page.locator('#token-status')).to_be_empty()
                    expect(browser_page.locator('#personal-token summary')).to_be_focused()
                    browser_page.locator('#personal-token summary').click()
                else:
                    expect(browser_page.locator('#token-badge')).to_have_text('None')
                    expect(browser_page.locator('#personal-token summary')).to_have_accessible_name('Personal MCP token')
                    expect(browser_page.locator('#personal-token summary')).to_have_accessible_description('None')
                    expect(browser_page.locator('#token-secret')).to_have_value('')
            browser_page.locator('#personal-token summary').click()
            browser_page.locator('#studio-menu summary').click()
            expect(browser_page.locator('#studio-menu')).to_have_js_property('open', True)
            browser_page.go_back()
            expect(browser_page.locator('#studio-menu')).to_have_js_property('open', False)
            expect(browser_page.locator('#create-panel')).to_be_visible()
            expect(browser_page.locator('#studio-title')).to_be_focused()
            browser_page.go_forward()
            expect(browser_page.locator('#studio-settings')).to_be_visible()
            expect(browser_page.locator('#studio-title')).to_be_focused()
            previous_size = browser_page.viewport_size
            browser_page.set_viewport_size({'width':844, 'height':320})
            browser_page.evaluate("document.documentElement.style.fontSize = '200%'")
            browser_page.locator('#studio-menu summary').click()
            privacy = browser_page.locator('#studio-menu .privacy-link')
            privacy.focus()
            expect(privacy).to_be_in_viewport(ratio=1)
            assert browser_page.locator('.studio-menu-content').evaluate('el => (el.scrollHeight <= el.clientHeight || el.scrollTop > 0) && el.getBoundingClientRect().bottom <= innerHeight')
            privacy.press('Escape')
            expect(browser_page.locator('#studio-menu summary')).to_be_focused()
            browser_page.evaluate("document.documentElement.style.removeProperty('font-size')")
            browser_page.set_viewport_size(previous_size)
            select_view(browser_page, 'Create')
            browser_page.locator('h1').click()
            for blank_title in ['', '   ']:
                browser_page.locator('#title').fill(blank_title)
                browser_page.locator('#title').press('Enter')
                expect(browser_page.locator('#title')).to_be_focused()
                expect(browser_page.locator('#title')).to_have_accessible_description('Enter a book title.')
            browser_page.locator('#title').fill('Chapter limits')
            browser_page.locator('#title').press('Enter')
            expect(browser_page.locator('#manuscript')).to_be_focused()
            expect(browser_page.locator('#manuscript-count')).to_be_hidden()
            oversized_draft = 'a' * 240000 + 'Ending'
            browser_page.locator('#manuscript').focus()
            browser_page.keyboard.insert_text(oversized_draft)
            expect(browser_page.locator('#manuscript')).to_have_value(oversized_draft)
            expect(browser_page.locator('#manuscript-count')).to_contain_text('exceeds 240,000 characters by 6')
            browser_page.locator('#create-form button[type=submit]').click()
            expect(browser_page.locator('#manuscript')).to_be_focused()
            assert browser_page.locator('#manuscript').evaluate('field => !field.validity.valid')
            for length in [44999, 45000, 49999, 50000]:
                browser_page.locator('#manuscript').fill('# Short\nA note.\n# Long\n' + 'x' * length)
                count = browser_page.locator('#manuscript-count')
                if length < 45000:
                    expect(count).to_be_hidden()
                else:
                    expect(count).to_have_text({
                        45000: 'Chapter 2 “Long” · 5,000 characters left',
                        49999: 'Chapter 2 “Long” · 1 character left',
                        50000: 'Chapter 2 “Long” is at the 50,000-character limit.',
                    }[length])
            browser_page.locator('#manuscript').fill('# First\n' + 'a' * 45100 + '\n# Second\n' + 'b' * 49800)
            expect(count).to_have_text('Chapter 2 “Second” · 200 characters left')
            near_limits = '# First\n' + 'a' * 49998 + ('\n# More\n' + 'b' * 47000) * 4
            browser_page.locator('#manuscript').fill(near_limits)
            expect(count).to_have_text('Chapter 1 “First” · 2 characters left')
            browser_page.locator('#manuscript').fill(near_limits.ljust(239999, 'c'))
            expect(count).to_have_text('Manuscript · 1 character left')
            browser_page.locator('#manuscript').fill('# Short\nA note.\n# Long\n' + 'x' * 50001)
            expect(browser_page.locator('#manuscript-count')).to_contain_text('Chapter 2 “Long” exceeds 50,000 characters by 1.')
            browser_page.locator('#create-form button[type=submit]').click()
            assert browser_page.locator('#manuscript').evaluate('field => field.validationMessage') == browser_page.locator('#manuscript-count').inner_text()
            browser_page.locator('#manuscript').fill('A shorter draft.')
            expect(browser_page.locator('#manuscript-count')).to_be_hidden()
            browser_page.locator('#title').fill('   ')
            browser_page.locator('#manuscript').fill('   ')
            browser_page.locator('#create-form button[type=submit]').click()
            expect(browser_page.locator('#title')).to_be_focused()
            expect(browser_page.locator('#title')).to_have_accessible_description('Enter a book title.')
            expect(browser_page.locator('#title-error')).to_be_visible()
            assert browser_page.locator('#title').evaluate('e => e.validationMessage') == 'Enter a book title.'
            browser_page.locator('#title').fill('Field notes')
            expect(browser_page.locator('#title-error')).to_be_hidden()
            browser_page.locator('#create-form button[type=submit]').click()
            expect(browser_page.locator('#manuscript')).to_be_focused()
            expect(count).to_have_text('Write or paste your manuscript.')
            expect(count).to_have_css('border-top-width', '1px')
            expect(count).to_have_css('border-inline-start-width', '1px')
            assert browser_page.locator('#manuscript').evaluate('''field => {
                const style = getComputedStyle(field);
                const ring = parseFloat(style.outlineOffset) + parseFloat(style.outlineWidth);
                return field.nextElementSibling.getBoundingClientRect().top > field.getBoundingClientRect().bottom + ring;
            }''')
            browser_page.screenshot(path=str(ARTIFACTS / 'create-manuscript-error.png'))
            expect(browser_page.locator('#manuscript')).to_have_accessible_description(re.compile('^Write or paste your manuscript'))
            browser_page.locator('#manuscript').fill('One paragraph.')
            expect(count).to_be_hidden()
            expect(browser_page.locator('#manuscript')).not_to_have_attribute('aria-invalid', 'true')
            browser_page.set_viewport_size({'width':320,'height':844})
            browser_page.evaluate("document.documentElement.style.fontSize = '200%'")
            browser_page.locator('#manuscript').fill('# First\nText\n# ' + 'W' * 160 + '\n' + 'x' * 50001)
            expect(count).to_contain_text('Chapter 2 “' + 'W' * 32 + '…” exceeds 50,000 characters by 1')
            assert count.evaluate('el => el.scrollWidth <= el.clientWidth')
            assert not browser_page.evaluate('document.documentElement.scrollWidth > innerWidth')
            browser_page.evaluate("document.documentElement.style.removeProperty('font-size')")
            browser_page.set_viewport_size({'width':390,'height':844})
            for draft, warning in [
                ('# One\nFirst.\n# ' + 'x' * 161 + '\nSecond.', 'Shorten chapter 2’s heading “' + 'x' * 32 + '…” by 1 character.'),
                ('x' * 50001, 'Chapter 1 exceeds'),
                ('# Short\nText\n' * 23 + '# Long\n' + 'x' * 50001, 'move text to another chapter'),
                ('# Chapter\nText\n' * 25, 'This manuscript has 25 chapters'),
            ]:
                browser_page.locator('#manuscript').fill(draft)
                browser_page.locator('#create-form button[type=submit]').click()
                expect(browser_page.locator('#manuscript')).to_be_focused()
                assert warning in browser_page.locator('#manuscript').evaluate('e => e.validationMessage')
                expect(browser_page.locator('#title')).to_have_value('Field notes')
            browser_page.locator('#manuscript').fill('# First chapter ###\n\nA note from the field.\n\n````markdown\n```\n# Inside the example\n```` with text\n# Still inside\n````\n\n# Second chapter\n\nFinal paragraph.')
            expect(browser_page.locator('#title')).to_have_value('Field notes')
            browser_page.locator('.book-metadata summary').click()
            for field_id in ['title', 'creator', 'manuscript']:
                field = browser_page.locator('#' + field_id)
                original_text = field.input_value()
                for value, direction in [('123 · العربية', 'rtl'), ('# Chapter', 'ltr')]:
                    field.fill(value)
                    assert field.evaluate('el => getComputedStyle(el).direction') == direction
                field.fill(original_text)
            browser_page.locator('#creator').press('Enter')
            expect(browser_page.locator('#language')).to_be_focused()
            browser_page.locator('#language').fill('')
            browser_page.locator('.book-metadata summary').click()
            browser_page.locator('#create-form button[type=submit]').click()
            expect(browser_page.locator('#language')).to_be_focused()
            expect(browser_page.locator('#language')).to_have_accessible_description('Choose the language your book is written in.')
            browser_page.locator('#language').fill('invalid!')
            browser_page.locator('.book-metadata summary').click()
            browser_page.locator('#create-form button[type=submit]').click()
            expect(browser_page.locator('#language')).to_be_focused()
            expect(browser_page.locator('#language')).to_have_js_property('validationMessage', 'Choose a suggested language or enter a code such as en-GB.')
            expect(browser_page.locator('#language')).to_have_accessible_description('Choose a suggested language or enter a code such as en-GB.')
            expect(browser_page.locator('#language-error')).to_be_visible()
            browser_page.locator('#language').fill('still!')
            expect(browser_page.locator('#language-error')).to_be_visible()
            expect(browser_page.locator('#language')).to_have_attribute('aria-invalid', 'true')
            original_author = browser_page.locator('#creator').input_value()
            browser_page.locator('#creator').fill('A' * 160)
            browser_page.locator('#language').fill('fr_CA')
            browser_page.locator('.book-metadata summary').click()
            expect(browser_page.locator('#metadata-language')).to_have_text('Canadian French')
            browser_page.locator('.book-metadata summary').click()
            expect(browser_page.locator('#language')).to_have_value('fr_CA')
            browser_page.locator('#language').fill('en_GB')
            expect(browser_page.locator('#language-error')).to_be_hidden()
            browser_page.locator('.book-metadata summary').click()
            expect(browser_page.locator('#metadata-values')).to_be_visible()
            expect(browser_page.locator('#metadata-language')).to_have_text('British English')
            metadata_toggle = browser_page.locator('.book-metadata summary')
            expect(metadata_toggle).to_have_accessible_name('Author and language')
            expect(metadata_toggle).to_have_accessible_description(re.compile('A{160}.*British English'))
            assert browser_page.locator('#metadata-author').evaluate('el => el.scrollWidth > el.clientWidth')
            assert browser_page.locator('#metadata-language').evaluate('el => el.scrollWidth <= el.clientWidth')
            browser_page.locator('.book-metadata summary').click()
            browser_page.locator('#creator').fill(original_author)
            browser_page.locator('.book-metadata summary').click()
            expect(browser_page.locator('#create-panel')).to_be_visible()
            expect(browser_page.locator('#upload-panel')).to_be_hidden()
            select_view(browser_page, 'Forward')
            expect(browser_page.locator('#create-panel')).to_be_hidden()
            expect(browser_page.locator('#upload-panel')).to_be_visible()
            select_view(browser_page, 'Create')
            expect(browser_page.locator('#title')).to_have_value('Field notes')
            draft_before_limit = browser_page.locator('#manuscript').input_value()
            browser_page.locator('#studio-menu summary').click()
            with context.expect_page() as policy_tab:
                browser_page.locator('.privacy-link').press('Enter')
            expect(policy_tab.value).to_have_url(ORIGIN + '/privacy')
            policy_tab.value.close()
            browser_page.locator('#studio-menu summary').press('Escape')
            open_settings(browser_page)
            with context.expect_page() as policy_tab:
                browser_page.locator('.settings-links').get_by_role('link', name='Privacy (opens in a new tab)').press('Enter')
            expect(policy_tab.value).to_have_url(ORIGIN + '/privacy')
            policy_tab.value.close()
            select_view(browser_page, 'Create')
            expect(browser_page.locator('#manuscript')).to_have_value(draft_before_limit)
            invalid_book = []
            browser_page.route('**/api/books', lambda route: invalid_book.append(route), times=1)
            browser_page.locator('#create-form button[type=submit]').click()
            browser_page.locator('#studio-menu summary').click()
            invalid_book[0].fulfill(status=400, json={
                'code':'INVALID_MANUSCRIPT', 'message':'Check the manuscript.'
            })
            draft_feedback = browser_page.locator('#create-form .action-feedback')
            expect(draft_feedback).to_have_text('Check the manuscript.')
            expect(browser_page.locator('#studio-menu summary')).to_be_focused()
            assert browser_page.locator('#studio-menu').evaluate('menu => menu.open')
            browser_page.keyboard.press('Escape')
            browser_page.locator('#manuscript').fill(draft_before_limit + ' Updated.')
            expect(draft_feedback).to_be_hidden()
            browser_page.locator('#manuscript').fill(draft_before_limit)
            browser_page.route('**/api/books', lambda route: route.abort('failed'), times=1)
            browser_page.locator('#create-form button[type=submit]').click()
            expect(draft_feedback).to_have_text('Couldn’t confirm EPUB creation. Check your Shelf before trying again.')
            with browser_page.expect_popup() as draft_shelf:
                draft_feedback.get_by_role('link', name='Check your Shelf (opens in a new tab)').click()
            expect(draft_shelf.value.locator('#studio-title')).to_have_text('Shelf')
            draft_shelf.value.close()
            expect(browser_page.locator('#manuscript')).to_have_value(draft_before_limit)
            quota_rows = [(secrets.token_hex(16), owner, 'render', int(time.time())) for _ in range(2)]
            database.executemany('INSERT INTO operations(id,owner,kind,created_at) VALUES(?,?,?,?)', quota_rows)
            database.commit()
            browser_page.locator('#create-form button[type=submit]').click()
            limit_feedback = browser_page.locator('#create-form .action-feedback.error')
            expect(limit_feedback).to_be_focused()
            browser_page.locator('#title').fill('Field notes revised')
            expect(limit_feedback).to_contain_text('after ' + browser_page.locator('#daily-reset').get_attribute('title'))
            expect(browser_page.locator('#shelf .shelf-item')).to_have_count(0)
            expect(limit_feedback).not_to_contain_text('Shelf')
            database.executemany('DELETE FROM operations WHERE id=?', [(row[0],) for row in quota_rows])
            database.commit()
            browser_page.locator('#title').fill('Field notes')
            browser_page.locator('.reader-tabs a[href="#files-panel"]').click()
            select_view(browser_page, 'Create')
            expect(browser_page.locator('#manuscript')).to_have_value(draft_before_limit)
            expect(browser_page.locator('#title')).to_have_value('Field notes')
            creating = []
            browser_page.route('**/api/books', lambda route: creating.append(route))
            browser_page.locator('#create-form button[type=submit]').click()
            expect(browser_page.locator('#create-form')).to_have_attribute('aria-busy', 'true')
            expect(browser_page.locator('#create-form button[type=submit]')).to_have_text('Creating…')
            expect(browser_page.locator('#title')).to_be_disabled()
            for _ in range(250):
                if creating:
                    break
                browser_page.wait_for_timeout(20)
            assert creating, "Expected the intercepted workspace request"
            browser_page.locator('#studio-menu summary').click()
            creating.pop().continue_()
            browser_page.unroute('**/api/books')
            browser_page.locator('#created a', has_text='Download').wait_for()
            expect(browser_page.locator('#studio-menu summary')).to_be_focused()
            assert browser_page.locator('#studio-menu').evaluate('menu => menu.open')
            browser_page.keyboard.press('Escape')
            expect(browser_page.locator('#created a.button').first).to_have_text('Download')
            download = urllib.parse.urlsplit(browser_page.locator('#created a.button').first.get_attribute('href'))
            status, _, epub_bytes = request(download.path + '?' + download.query)
            assert status == 200
            with zipfile.ZipFile(io.BytesIO(epub_bytes)) as edition:
                assert b'<dc:language>en-GB</dc:language>' in edition.read('EPUB/package.opf')
            expect(browser_page.locator('#create-editor')).to_be_hidden()
            expect(browser_page.locator('#created .artifact-status')).to_have_text('Not sent')
            expect(browser_page.locator('#created .result-name')).to_have_accessible_description(re.compile(r'EPUB.*Not sent'))
            draft_color = browser_page.locator('#created .artifact-status').evaluate('(e)=>getComputedStyle(e).color')
            draft_background = backdrop_colors(browser_page.locator('#created .artifact-topline'))
            assert min(contrast(draft_color, bg) for bg in draft_background) >= 4.5
            expect(browser_page.locator('#share-dialog')).not_to_be_visible()
            expect(browser_page.locator('#file-info-dialog')).not_to_be_visible()
            expect(browser_page.locator('#workspace-subtitle')).to_be_hidden()
            details_button = browser_page.locator('#created .artifact-footer button')
            expect(details_button).to_have_attribute('aria-haspopup', 'dialog')
            expect(details_button).to_have_accessible_name('Details for ' + browser_page.locator('#created .result-name').inner_text())
            details_button.focus()
            details_button.press('Enter')
            details_dialog = browser_page.get_by_role('dialog', name='File details')
            expect(details_dialog).to_have_accessible_description(re.compile(r'\.epub$'))
            expect(browser_page.locator('#file-info-dialog')).to_contain_text('Generated EPUB · ')
            browser_page.keyboard.press('Escape')
            expect(details_button).to_be_focused()
            details_button.press('Enter')
            expect(browser_page.locator('#file-info-dialog .hash')).to_have_text(hashlib.sha256(epub_bytes).hexdigest())
            result_expiry = browser_page.locator('#created time')
            detail_expiry = browser_page.locator('#file-info-dialog time')
            expect(detail_expiry).to_have_attribute('datetime', result_expiry.get_attribute('datetime'))
            expect(detail_expiry).to_have_attribute('title', result_expiry.get_attribute('title'))
            expect(detail_expiry).to_have_text(re.compile(r'^Expires \d{1,2} \w+ \d{4}, \d{2}:\d{2} \S+$'))
            browser_page.screenshot(path=str(ARTIFACTS / 'file-info-dialog-mobile.png'), full_page=True)
            copy_checksum = browser_page.get_by_role('button', name='Copy SHA-256 checksum', exact=True)
            original_viewport = browser_page.viewport_size
            browser_page.set_viewport_size({'width':320,'height':844})
            browser_page.evaluate("document.documentElement.style.fontSize = '200%'")
            for selector in ['#file-info-dialog', '#file-info-content', '#file-info-content .hash']:
                assert browser_page.locator(selector).evaluate('el => el.scrollWidth <= el.clientWidth'), selector
            copy_checksum.focus()
            expect(copy_checksum).to_be_in_viewport(ratio=1)
            browser_page.set_viewport_size({'width':568,'height':320})
            details_body = browser_page.locator('#file-info-content')
            assert details_body.bounding_box()['height'] >= details_dialog.bounding_box()['height'] * 2 / 3
            details_dialog.get_by_role('button', name=re.compile('Close')).focus()
            browser_page.keyboard.press('Tab')
            expect(details_dialog.get_by_role('link', name='Download manuscript (JSON)')).to_be_focused()
            browser_page.keyboard.press('Tab')
            expect(copy_checksum).to_be_focused()
            expect(copy_checksum).to_be_in_viewport(ratio=1)
            copy_checksum.press('Enter')
            expect(browser_page.get_by_role('button', name='Copied SHA-256 checksum', exact=True)).to_have_text('Copied')
            assert details_body.evaluate('el => el.scrollTop > 0')
            browser_page.keyboard.press('Escape')
            expect(details_button).to_be_focused()
            details_button.press('Enter')
            expect(details_body.locator('.dialog-filename')).to_be_in_viewport(ratio=1)
            assert details_body.evaluate('el => el.scrollTop === 0')
            expect(copy_checksum).to_have_text('Copy')
            browser_page.evaluate("document.documentElement.style.removeProperty('font-size')")
            browser_page.set_viewport_size(original_viewport)
            idle_bounds = copy_checksum.bounding_box()
            browser_page.evaluate('''() => {
                window.copyAttempts = 0;
                const write = navigator.clipboard.writeText.bind(navigator.clipboard);
                Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: async text => {
                    window.copyAttempts++;
                    await new Promise(resolve => { window.finishCopy = resolve; });
                    await write(text);
                }});
            }''')
            copy_checksum.click()
            pending_copy = browser_page.get_by_role('button', name='Copying SHA-256 checksum', exact=True)
            expect(pending_copy).to_have_text('Copying…')
            assert pending_copy.bounding_box() == idle_bounds
            pending_copy.press('Enter')
            assert browser_page.evaluate('window.copyAttempts') == 1
            browser_page.evaluate('window.finishCopy()')
            expect(browser_page.get_by_role('button', name='Copied SHA-256 checksum', exact=True)).to_have_text('Copied')
            assert browser_page.evaluate('navigator.clipboard.readText()') == browser_page.locator('#file-info-content .hash').inner_text()
            browser_page.evaluate("Object.defineProperty(navigator.clipboard, 'writeText', {configurable:true, value:async () => {throw Error('denied')}})")
            checksum_button = browser_page.locator('.checksum-heading button')
            checksum_button.focus()
            checksum_button.press('Enter')
            expect(checksum_button).to_have_text('Selected')
            expect(checksum_button).to_have_accessible_name('Selected SHA-256 checksum')
            expect(checksum_button).to_have_accessible_description('Copy unavailable. Copy the selected text manually.')
            expect(browser_page.locator('#file-info-content [role=status]')).to_have_text('Copy unavailable. Copy the selected text manually.')
            assert browser_page.evaluate('getSelection().toString()') == hashlib.sha256(epub_bytes).hexdigest()
            browser_page.evaluate('getSelection().removeAllRanges()')
            expect(checksum_button).to_have_text('Copy')
            expect(browser_page.locator('#file-info-content [role=status]')).to_be_empty()
            browser_page.evaluate("Object.defineProperty(navigator.clipboard, 'writeText', {configurable:true, value:() => new Promise((_, reject) => {window.failCopy = reject})})")
            checksum_button.click()
            browser_page.keyboard.press('Escape')
            details_button.focus()
            browser_page.evaluate('''() => {
                const selection = getSelection();
                selection.selectAllChildren(document.querySelector('#created .result-name'));
                window.failCopy(Error('denied'));
            }''')
            expect(details_button).to_be_focused()
            assert browser_page.evaluate('getSelection().toString()') == 'Field notes'
            details_button.press('Enter')
            browser_page.evaluate('delete navigator.clipboard.writeText')
            with browser_page.expect_download() as source_download:
                browser_page.get_by_role('link', name='Download manuscript (JSON)').click()
            assert source_download.value.suggested_filename == 'manuscript.json'
            assert json.loads(source_download.value.path().read_bytes())['title'] == 'Field notes'
            expect(browser_page.locator('#file-info-dialog')).to_be_visible()
            browser_page.go_back()
            expect(browser_page.locator('#file-info-dialog')).not_to_be_visible()
            expect(browser_page.locator('#studio-title')).to_be_focused()
            browser_page.go_forward()
            expect(browser_page.locator('#created')).to_be_visible()
            browser_page.locator('#created').screenshot(path=str(ARTIFACTS / 'create-result-mobile.png'))
            preview_link = browser_page.locator('#created').get_by_role('link', name=re.compile(r'^Preview .+ \(opens in a new tab\)$'))
            preview_url = preview_link.get_attribute('href')
            with context.expect_page() as opened:
                preview_link.click()
            preview_page = opened.value
            preview_page.wait_for_url(preview_url)
            expect(browser_page.locator('#created')).to_be_visible()
            preview_page.set_viewport_size({'width': 390, 'height': 844})
            parts = urllib.parse.urlsplit(preview_url)
            params_expired = dict(urllib.parse.parse_qsl(parts.query), expires='1000000000')
            expired_url = parts._replace(query=urllib.parse.urlencode(params_expired))
            status, _, body = request(expired_url.path + '?' + expired_url.query)
            assert status == 400 and json.loads(body)['code'] == 'LINK_EXPIRED'
            expired_response = preview_page.goto(expired_url.geturl())
            assert expired_response.status == 400
            expect(preview_page.get_by_role('heading', name='Link unavailable')).to_be_visible()
            expect(preview_page.locator('main')).to_contain_text('Private links last 15 minutes. Files expire 24 hours after creation or upload.')
            expect(preview_page.locator('main')).to_contain_text('ask the sender for a new link')
            assert expired_response.headers['referrer-policy'] == 'no-referrer'
            assert 'no-store' in expired_response.headers['cache-control']
            preview_page.screenshot(path=str(ARTIFACTS / 'expired-file-mobile.png'))
            recovery_cta = preview_page.get_by_role('link', name='Find preview on Shelf')
            recovery_fg, recovery_bg = recovery_cta.evaluate('el => { const s = getComputedStyle(el); return [s.color, s.backgroundColor]; }')
            assert contrast(recovery_fg, recovery_bg) >= 4.5, (recovery_fg, recovery_bg)
            recovery_cta.click()
            expect(preview_page.get_by_role('link', name='Preview Field notes.epub (opens in a new tab)', exact=True)).to_be_focused()
            expect(preview_page).to_have_url(ORIGIN + '/app#files-panel')
            with context.expect_page() as restored_preview:
                preview_page.keyboard.press('Enter')
            restored_book = restored_preview.value
            expect(restored_book.locator('h1')).to_have_text('Field notes')
            assert urllib.parse.urlsplit(restored_book.url).path == parts.path
            restored_book.close()
            expect(preview_page).to_have_url(ORIGIN + '/app#files-panel')
            expired_file = expired_url._replace(path=expired_url.path.removesuffix('/preview') + '/file')
            preview_page.goto(expired_file.geturl())
            preview_page.get_by_role('link', name='Find download on Shelf').press('Enter')
            expect(preview_page.get_by_role('link', name='Download Field notes.epub', exact=True)).to_be_focused()
            with preview_page.expect_download() as restored_epub:
                preview_page.keyboard.press('Enter')
            assert restored_epub.value.path().read_bytes() == epub_bytes
            expired_source = expired_url._replace(path=expired_url.path.removesuffix('/preview') + '/source')
            preview_page.goto(expired_source.geturl())
            preview_page.get_by_role('link', name='Find manuscript on Shelf').click()
            expect(preview_page.locator('#files-panel')).to_be_visible()
            shelf_details = preview_page.get_by_role('button', name='Field notes.epub file details')
            expect(preview_page.get_by_role('link', name='Download manuscript (JSON)')).to_be_focused()
            expect(preview_page).to_have_url(ORIGIN + '/app#files-panel')
            with preview_page.expect_download() as shelf_source:
                preview_page.get_by_role('link', name='Download manuscript (JSON)').click()
            assert shelf_source.value.path().read_bytes() == source_download.value.path().read_bytes()
            preview_page.keyboard.press('Escape')
            expect(shelf_details).to_be_focused()
            preview_page.goto(ORIGIN + '/app?file=00000000-0000-4000-8000-000000000000#files-panel')
            missing_file = preview_page.locator('#files-panel').get_by_role('status')
            expect(missing_file).to_contain_text('This file isn’t on the Shelf for reader@example.invalid.')
            expect(missing_file).to_be_focused()
            expect(preview_page.locator('#files-heading + [role=status] + #shelf')).to_be_visible()
            expect(preview_page).to_have_url(ORIGIN + '/app#files-panel')
            preview_page.evaluate("location.hash = 'create-panel'")
            expect(preview_page.locator('#create-panel')).to_be_visible()
            preview_page.go_back()
            expect(shelf_details).to_be_visible()
            expect(missing_file).to_have_count(0)
            private_response = preview_page.goto(preview_url, wait_until='networkidle')
            assert private_response.headers['referrer-policy'] == 'no-referrer'
            assert private_response.headers['content-security-policy'].startswith("sandbox; default-src 'none'")
            assert preview_page.locator('.preview-contents ol a').all_text_contents() == ['First chapter', 'Second chapter']
            expect(preview_page.locator('html')).to_have_attribute('lang', 'en-GB')
            expect(preview_page.locator('main pre')).to_contain_text('# Inside the example')
            expect(preview_page.locator('main')).to_contain_text('A note from the field.')
            expect(preview_page.locator('h1')).to_have_count(1)
            preview_page.keyboard.press('Tab')
            skip_text = preview_page.get_by_role('link', name='Skip to book text')
            expect(skip_text).to_be_focused()
            skip_text.press('Enter')
            expect(preview_page.locator('main')).to_be_focused()
            preview_page.evaluate('window.scrollTo(0, 0)')
            contents_toggle = preview_page.locator('.preview-contents summary')
            expect(preview_page.locator('.preview-contents ol')).to_be_hidden()
            contents_toggle.press('Enter')
            preview_page.set_viewport_size({'width': 320, 'height': 844})
            chapter_link = preview_page.locator('.preview-contents ol a').first
            original_label = chapter_link.inner_text()
            chapter_link.evaluate("(el) => el.textContent = 'A'.repeat(160)")
            assert chapter_link.bounding_box()['height'] > 44
            assert not preview_page.evaluate('document.documentElement.scrollWidth > innerWidth')
            chapter_link.evaluate('(el, label) => el.textContent = label', original_label)
            preview_page.set_viewport_size({'width': 390, 'height': 844})
            contents_toggle.focus()
            contents_toggle.press('Enter')
            expect(preview_page.locator('.preview-contents ol')).to_be_hidden()
            assert '+' in contents_toggle.evaluate("el => getComputedStyle(el, '::after').content")
            contents_toggle.press('Space')
            expect(preview_page.locator('.preview-contents ol')).to_be_visible()
            assert '−' in contents_toggle.evaluate("el => getComputedStyle(el, '::after').content")
            assert preview_page.evaluate("[...document.fonts].some(f=>f.family==='Manrope' && f.status==='loaded')")
            assert not preview_page.evaluate("[...document.fonts].some(f=>f.family.includes('IBM Plex Mono') && f.status==='loaded')")
            assert not preview_page.evaluate("[...document.querySelectorAll('h1,h2,h3,h4')].some(e=>e.tagName==='H4')")
            assert preview_page.locator('body').evaluate('(e)=>parseFloat(getComputedStyle(e).fontSize)') >= 18
            preview_page.screenshot(path=str(ARTIFACTS / 'private-reader-mobile.png'), full_page=True)
            assert not preview_page.evaluate('document.documentElement.scrollWidth > innerWidth')
            preview_page.get_by_role('link', name='Second chapter', exact=True).press('Enter')
            second_chapter = preview_page.get_by_role('region', name='Second chapter')
            expect(second_chapter).to_be_focused()
            expect(second_chapter.get_by_role('heading', name='Second chapter')).to_have_css('text-decoration-line', 'underline')
            preview_page.emulate_media(media='print')
            expect(second_chapter).to_have_css('outline-style', 'none')
            expect(second_chapter.get_by_role('heading', name='Second chapter')).to_have_css('text-decoration-line', 'none')
            expect(preview_page.locator('.preview-skip')).to_be_hidden()
            expect(preview_page.locator('.preview-tools').first).to_be_hidden()
            expect(preview_page.locator('.preview-tools').last).to_be_hidden()
            expect(preview_page.locator('#contents')).to_be_hidden()
            expect(preview_page.locator('main h2').first).to_be_visible()
            preview_page.emulate_media(media='screen')
            preview_page.get_by_role('link', name='Back to contents').click()
            expect(contents_toggle).to_be_in_viewport()
            expect(contents_toggle).to_be_focused()
            preview_page.keyboard.press('Tab')
            expect(chapter_link).to_be_focused()
            preview_page.get_by_role('link', name='Open Shelf').click()
            expect(preview_page.locator('#shelf .shelf-item')).to_have_count(1)
            preview_page.close()
            select_view(browser_page, 'Forward')
            for name, data, message in [('empty.pdf', b'', 'This file is empty.'), ('notes.txt', b'A note', 'Choose an EPUB or PDF file.')]:
                browser_page.locator('#original').set_input_files({'name':name,'mimeType':'text/plain','buffer':data})
                expect(browser_page.locator('#file-error')).to_contain_text(message)
                expect(browser_page.locator('.file-drop')).to_have_css('min-height', '0px')
                expect(browser_page.locator('#original')).to_have_accessible_description(browser_page.locator('#file-error').inner_text() + f' {len(data)} bytes')
            browser_page.set_viewport_size({'width':320,'height':844})
            expect(browser_page.locator('#workspace-subtitle')).to_be_visible()
            long_name = 'fieldnotes' * 16 + '.pdf'
            browser_page.locator('#original').set_input_files({'name':long_name,'mimeType':'application/pdf','buffer':b'x'})
            expect(browser_page.locator('#file-name')).to_have_text(long_name)
            expect(browser_page.locator('#original')).to_have_accessible_name('Change file ' + long_name)
            assert not browser_page.evaluate('document.documentElement.scrollWidth > innerWidth')
            # Measure the drag styling in one render turn so scrolling between
            # Playwright calls cannot be mistaken for movement of the filename.
            drag = browser_page.locator('.file-drop').evaluate('''async el => {
                await document.fonts.ready;
                const filename = el.querySelector('#file-name');
                const bounds = () => [el, filename].map(node => node.getBoundingClientRect().toJSON());
                const before = bounds();
                const transfer = new DataTransfer();
                transfer.items.add(new File(['pdf'], 'replacement.pdf', {type:'application/pdf'}));
                el.dispatchEvent(new DragEvent('dragenter', {dataTransfer:transfer, cancelable:true}));
                return {before, after: bounds(), active: el.classList.contains('is-dragging')};
            }''')
            assert drag['active'] and drag['before'] == drag['after'], drag
            browser_page.locator('.file-drop').dispatch_event('dragleave')
            browser_page.set_viewport_size({'width':390,'height':844})
            browser_page.locator('#original').set_input_files({'name':'small.pdf','mimeType':'application/pdf','buffer':b'x' * 512})
            expect(browser_page.locator('.file-drop')).to_have_css('border-top-style', 'solid')
            browser_page.screenshot(path=str(ARTIFACTS / 'forward-selected-mobile.png'))
            expect(browser_page.locator('#file-info')).to_contain_text('512 bytes')
            expect(browser_page.locator('#original')).to_have_accessible_description('512 bytes')
            browser_page.locator('#original').set_input_files([])
            expect(browser_page.locator('#file-name')).to_have_text('Choose an EPUB or PDF')
            expect(browser_page.locator('.file-drop')).to_have_css('border-top-style', 'dashed')
            expect(browser_page.locator('#file-info')).to_have_text('Drop a file here · 20 MiB maximum', use_inner_text=True)
            touch_page = context.new_page()
            touch_page.set_viewport_size({'width':390,'height':844})
            touch_session = context.new_cdp_session(touch_page)
            touch_session.send('Emulation.setTouchEmulationEnabled', {'enabled': True})
            touch_page.goto(ORIGIN + '/app#upload-panel')
            expect(touch_page.locator('#file-info')).to_have_text('20 MiB maximum', use_inner_text=True)
            touch_session.detach()
            touch_page.close()
            expect(browser_page.locator('#file-info .drop-hint')).to_be_visible()
            browser_page.locator('.file-drop').evaluate('''el => {
                const transfer = new DataTransfer();
                for (const name of ['first.pdf', 'second.pdf'])
                    transfer.items.add(new File(['pdf'], name, {type: 'application/pdf'}));
                el.dispatchEvent(new DragEvent('drop', {dataTransfer: transfer, cancelable: true}));
            }''')
            expect(browser_page.locator('#file-error')).to_have_text('You dropped 2 files. Choose one EPUB or PDF.')
            expect(browser_page.locator('#original')).to_be_focused()
            expect(browser_page.locator('#original')).to_have_accessible_description(re.compile('You dropped 2 files'))
            assert browser_page.locator('#original').evaluate('el => el.files.length') == 0
            browser_page.locator('#studio-title').focus()
            browser_page.locator('.file-drop').evaluate('''el => {
                const transfer = new DataTransfer();
                transfer.items.add(new File(['pdf'], 'chosen.pdf', {type: 'application/pdf'}));
                el.dispatchEvent(new DragEvent('drop', {dataTransfer: transfer, cancelable: true}));
            }''')
            expect(browser_page.locator('#original')).to_be_focused()
            browser_page.keyboard.press('Tab')
            expect(browser_page.locator('#upload-form button[type=submit]')).to_be_focused()
            expect(browser_page.locator('#file-name')).to_have_text('chosen.pdf')
            expect(browser_page.locator('#file-error')).to_be_hidden()
            expect(browser_page.locator('#upload-form button[type=submit]')).to_be_visible()
            browser_page.locator('.file-drop').evaluate('''el => {
                const transfer = new DataTransfer();
                for (const name of ['first.pdf', 'second.pdf'])
                    transfer.items.add(new File(['pdf'], name, {type: 'application/pdf'}));
                el.dispatchEvent(new DragEvent('drop', {dataTransfer: transfer, cancelable: true}));
            }''')
            expect(browser_page.locator('.upload-field > [role=alert]:visible')).to_contain_text('Your previous selection is still here.')
            expect(browser_page.locator('#original')).to_have_accessible_description(re.compile('^You dropped 2 files.*previous selection'))
            assert browser_page.locator('#original').evaluate("el => el.validity.valid && el.files[0].name === 'chosen.pdf'")
            limits_page = context.new_page()
            limits_page.goto(ORIGIN + '/app#upload-panel')
            picker = limits_page.locator('#original')
            expect(picker).to_be_enabled()
            picker.evaluate('''input => {
                const transfer = new DataTransfer();
                transfer.items.add(new File([new Uint8Array(20 * 1024 * 1024 + 1)], 'oversized.pdf', {type:'application/pdf'}));
                input.files = transfer.files;
                input.dispatchEvent(new Event('change', {bubbles:true}));
            }''')
            expect(picker).to_have_attribute('aria-invalid', 'true')
            expect(limits_page.locator('#file-error')).to_contain_text('1 byte over the 20 MiB limit. Choose a smaller file.')
            with context.expect_page() as limits_tab:
                limits_page.get_by_role('link', name='View file limits (opens in a new tab)').click()
            policy = limits_tab.value
            expect(policy).to_have_url(ORIGIN + '/privacy#file-upload-limit')
            expect(policy.locator('#file-upload-limit')).to_be_focused()
            policy.close()
            policy = context.new_page()
            policy.set_viewport_size({'width':320,'height':320})
            def enlarged_policy_css(route):
                response = route.fetch()
                route.fulfill(response=response, body=response.text() + '\n:root { font-size: 200%; }')
            policy.route('**/style.css', enlarged_policy_css)
            policy.goto(ORIGIN + '/privacy#file-upload-limit')
            expect(policy.locator('html')).to_have_css('font-size', '32px')
            expect(policy.locator('#file-upload-limit dt')).to_be_in_viewport(ratio=1)
            expect(policy.locator('#file-upload-limit dd')).to_be_in_viewport(ratio=1)
            policy.close()
            assert picker.evaluate('input => input.files[0].name') == 'oversized.pdf'
            expect(limits_page.locator('#upload-panel')).to_be_visible()
            picker.set_input_files({'name':'replacement.pdf','mimeType':'application/pdf','buffer':b'%PDF-'})
            expect(limits_page.locator('#file-error')).to_be_hidden()
            expect(limits_page.locator('#upload-form button[type=submit]')).to_be_visible()
            expect(picker).to_have_accessible_description('5 bytes')
            limits_page.close()
            email_limit = browser_page.evaluate("async () => (await (await fetch('/api/account')).json()).limits.emailUploadBytes")
            for size in (email_limit + 1, email_limit):
                browser_page.locator('#original').evaluate('''(input, size) => {
                    const transfer = new DataTransfer();
                    transfer.items.add(new File([new Uint8Array(size)], 'boundary.pdf', {type:'application/pdf'}));
                    input.files = transfer.files;
                    input.dispatchEvent(new Event('change', {bubbles:true}));
                }''', size)
                assert browser_page.locator('#file-note').is_visible() == (size > email_limit)
                expect(browser_page.locator('#upload-form button[type=submit]')).to_be_visible()
            large_file = ARTIFACTS / 'large-email-check.pdf'
            with large_file.open('wb') as output:
                output.write(b'%PDF-1.7\n% Local oversized upload fixture\n')
                output.seek(20 * 1024 * 1024 - 6)
                output.write(b'%%EOF\n')
            assert large_file.stat().st_size == 20 * 1024 * 1024
            browser_page.locator('#original').set_input_files(str(large_file))
            expect(browser_page.locator('#file-error')).to_be_hidden()
            expect(browser_page.locator('#file-note')).to_be_visible()
            expect(browser_page.locator('#original')).to_have_accessible_description(re.compile(r'Too large to email \(limit about [0-9.]+ MiB\)'))
            expect(browser_page.locator('#file-note')).to_contain_text('To send it, use Amazon’s Send to Kindle')
            expect(browser_page.locator('#file-note a')).to_have_attribute('href', 'https://www.amazon.com/sendtokindle')
            with context.expect_page() as amazon_tab:
                context.route('https://www.amazon.com/sendtokindle', lambda route: route.fulfill(body='Amazon upload page'))
                browser_page.locator('#file-note a').click()
            expect(amazon_tab.value).to_have_url('https://www.amazon.com/sendtokindle')
            amazon_tab.value.close()
            context.unroute('https://www.amazon.com/sendtokindle')
            assert browser_page.locator('#original').evaluate('el => el.files[0].name') == large_file.name
            browser_page.locator('#upload-form button[type=submit]').click()
            expect(browser_page.locator('#workspace-subtitle')).to_be_hidden()
            expect(browser_page.locator('#uploaded .result-name')).to_have_accessible_description(re.compile(r'PDF.*Not sent.*Too large to email.*original file'))
            expect(browser_page.locator('#uploaded').get_by_role('link', name='Amazon’s Send to Kindle')).to_be_visible()
            expect(browser_page.locator('#uploaded')).to_contain_text('Upload your original file on Amazon.')
            amazon_action = browser_page.locator('#uploaded .share-zone > a')
            expect(amazon_action).to_have_text('Amazon’s Send to Kindle')
            primary_box = amazon_action.bounding_box()
            secondary_box = browser_page.locator('#uploaded .file-transfers').bounding_box()
            assert primary_box['x'] == secondary_box['x'] and primary_box['width'] == secondary_box['width']
            assert primary_box['y'] + primary_box['height'] <= secondary_box['y']
            expect(browser_page.locator('#uploaded .file-transfers > a.secondary')).to_have_text('Download')
            expect(browser_page.locator('#uploaded .share-trigger')).to_have_count(0)
            with browser_page.expect_download() as large_download:
                browser_page.locator('#uploaded').get_by_role('link', name='Download large-email-check.pdf').click()
            assert large_download.value.path().read_bytes() == large_file.read_bytes()
            browser_page.locator('.reader-tabs a[href="#files-panel"]').click()
            large_row = browser_page.get_by_role('article', name=large_file.name, exact=True)
            amazon_link = large_row.get_by_role('link', name='Amazon’s Send to Kindle (opens in a new tab)')
            expect(amazon_link).to_have_attribute('href', 'https://www.amazon.com/sendtokindle')
            expect(amazon_link).to_be_visible()
            expect(amazon_link).to_have_accessible_description(large_file.name)
            assert not browser_page.evaluate('document.documentElement.scrollWidth > innerWidth')
            large_row.get_by_role('button', name=large_file.name + ' file details').click()
            expect(browser_page.locator('#file-info-dialog')).to_contain_text('Original PDF · ')
            expect(browser_page.locator('#file-info-dialog').get_by_role('link', name='Amazon’s Send to Kindle')).to_have_attribute('href', 'https://www.amazon.com/sendtokindle')
            browser_page.keyboard.press('Escape')
            browser_page.once('dialog', lambda dialog: dialog.accept())
            pending_delete = []
            browser_page.route('**/api/files/*', lambda route: pending_delete.append(route), times=1)
            large_row.locator('.delete-trigger').click()
            expect(large_row.locator('.delete-trigger')).to_have_text('Deleting…')
            expect(large_row.locator('.delete-trigger')).to_be_disabled()
            menu_button = browser_page.locator('#studio-menu summary')
            menu_button.focus()
            pending_delete.pop().continue_()
            expect(large_row).to_have_count(0)
            expect(menu_button).to_be_focused()
            shelf_notice = browser_page.locator('#files-panel > .action-feedback')
            expect(shelf_notice).to_have_text(f'Deleted {large_file.name}.')
            select_view(browser_page, 'Forward')
            expect(shelf_notice).to_have_count(0)
            browser_page.locator('#original').set_input_files(str(ARTIFACTS / 'palim-sample.epub'))
            expect(browser_page.locator('#file-note')).to_be_hidden()
            lost_reply_name = 'uploaded-before-disconnect.epub'
            browser_page.locator('#original').set_input_files({
                'name': lost_reply_name, 'mimeType': 'application/epub+zip',
                'buffer': (ARTIFACTS / 'palim-sample.epub').read_bytes(),
            })
            pending_upload = []
            browser_page.route('**/api/files', lambda route: pending_upload.append(route), times=1)
            browser_page.locator('#upload-form button[type=submit]').click()
            expect(browser_page.locator('#original')).to_be_disabled()
            expect(browser_page.locator('.change-file')).to_be_hidden()
            expect(browser_page.locator('#file-name')).to_have_text(lost_reply_name)
            pending_upload.pop().fulfill(status=200, content_type='application/json', body='{')
            expect(browser_page.locator('.change-file')).to_be_visible()
            expect(browser_page.get_by_role('link', name='Check your Shelf (opens in a new tab)')).to_be_visible()
            assert browser_page.locator('#original').evaluate('el => el.files[0]?.name') == lost_reply_name
            def lose_upload_reply(route):
                response = route.fetch()
                assert response.ok
                route.abort('failed')
            browser_page.route('**/api/files', lose_upload_reply, times=1)
            browser_page.locator('#upload-form button[type=submit]').click()
            recovery = browser_page.get_by_role('link', name='Check your Shelf (opens in a new tab)')
            with browser_page.expect_popup() as recovery_popup:
                recovery.click()
            recovery_page = recovery_popup.value
            expect(recovery_page.locator('#studio-title')).to_have_text('Shelf')
            recovered_file = recovery_page.get_by_role('article', name=lost_reply_name, exact=True)
            expect(recovered_file).to_be_visible()
            recovery_page.once('dialog', lambda dialog: dialog.accept())
            recovered_file.locator('.delete-trigger').click()
            expect(recovered_file).to_have_count(0)
            recovery_page.close()
            assert browser_page.locator('#original').evaluate('el => el.files[0]?.name') == lost_reply_name
            large_file.unlink()
            quota_rows = [(secrets.token_hex(16), owner, 'upload', int(time.time())) for _ in range(6)]
            database.executemany('INSERT INTO operations(id,owner,kind,created_at) VALUES(?,?,?,?)', quota_rows)
            database.commit()
            browser_page.locator('#upload-form button[type=submit]').click()
            expect(browser_page.locator('#upload-form .action-feedback.error')).to_be_focused()
            browser_page.locator('#original').set_input_files({'name':'another.pdf','mimeType':'application/pdf','buffer':b'%PDF-'})
            expect(browser_page.locator('#upload-form .action-feedback.error')).to_contain_text('after ' + browser_page.locator('#daily-reset').get_attribute('title'))
            browser_page.locator('#original').set_input_files(str(ARTIFACTS / 'palim-sample.epub'))
            browser_page.locator('#upload-form .action-feedback').get_by_role('link', name='Shelf').click()
            expect(browser_page.locator('#studio-title')).to_be_focused()
            expect(browser_page.locator('#studio-title')).to_have_text('Shelf')
            select_view(browser_page, 'Forward')
            assert browser_page.locator('#original').evaluate('el => el.files[0]?.name') == 'palim-sample.epub'
            expect(browser_page.locator('#upload-form .action-feedback.error')).to_contain_text('after ' + browser_page.locator('#daily-reset').get_attribute('title'))
            database.executemany('DELETE FROM operations WHERE id=?', [(row[0],) for row in quota_rows])
            database.commit()
            browser_page.locator('#upload-form button[type=submit]').click()
            browser_page.locator('#uploaded a', has_text='Download').wait_for()
            assert not browser_page.evaluate('document.documentElement.scrollWidth > innerWidth')
            expect(browser_page.locator('#shelf .shelf-item')).to_have_count(2)
            browser_page.locator('#uploaded').screenshot(path=str(ARTIFACTS / 'upload-result-mobile.png'))
            browser_page.set_viewport_size({'width':320,'height':844})
            browser_page.evaluate("document.documentElement.style.fontSize = '200%'")
            transfer_actions = browser_page.locator('#uploaded .file-transfers').locator(':scope > *')
            download_box, another_box = [el.bounding_box() for el in transfer_actions.all()]
            assert another_box['y'] >= download_box['y'] + download_box['height']
            assert another_box['width'] == download_box['width']
            assert not browser_page.evaluate('document.documentElement.scrollWidth > innerWidth')
            browser_page.evaluate("document.documentElement.style.removeProperty('font-size')")
            browser_page.set_viewport_size({'width':390,'height':844})
            browser_page.locator('.reader-tabs a[href="#files-panel"]').click()
            for action in browser_page.locator('#shelf a, #shelf button').all():
                bounds = action.bounding_box()
                assert bounds['height'] >= 44 and bounds['width'] >= 44, 'Shelf touch target too small'
            for row in browser_page.locator('#shelf article').all():
                heading = row.get_by_role('heading', level=3)
                copy_label = heading.locator('small')
                name = heading.get_by_role('button').inner_text()
                if copy_label.count():
                    name += f' ({copy_label.inner_text()})'
                expect(row).to_have_accessible_name(name)
            browser_page.locator('#shelf').screenshot(path=str(ARTIFACTS / 'shelf-unconfigured-mobile.png'))
            browser_page.locator('#shelf .share-trigger').first.click()
            expect(browser_page.locator('#share-send')).to_have_text('Add Kindle address')
            expect(browser_page.locator('#share-send')).to_have_accessible_description(re.compile('You’ll confirm the address before sending.'))
            browser_page.screenshot(path=str(ARTIFACTS / 'share-dialog-mobile.png'), full_page=True)
            browser_page.locator('#share-send').click()
            expect(browser_page.locator('#studio-settings')).to_be_visible()
            expect(browser_page.locator('#amazon-steps ol')).to_be_visible()
            expect(browser_page.locator('#email-limit')).to_be_hidden()
            browser_page.locator('.limits summary').click()
            expect(browser_page.locator('#allowance')).to_contain_text('Shelf accepts files up to 20 MiB and keeps them for 24 hours.')
            expect(browser_page.locator('#email-limit')).to_be_visible()
            expect(browser_page.locator('#email-limit')).to_contain_text('18.2 MiB')
            expect(browser_page.locator('#email-limit').get_by_role('link', name='Amazon’s Send to Kindle')).to_have_attribute('href', 'https://www.amazon.com/sendtokindle')
            expect(browser_page.locator('#limit-sends').locator('..')).to_have_text(re.compile(r'Kindle email submissions\s*3'))
            expect(browser_page.locator('#setup-return')).to_contain_text('Approve your personal sender in Amazon before the first send')
            browser_page.get_by_role('link', name='your personal sender').click()
            expect(browser_page.locator('#copy-sender')).to_be_focused()
            expect(browser_page.locator('#amazon-steps ol')).to_be_visible()
            expect(browser_page).to_have_url(ORIGIN + '/app#sender-address')
            sender_tab = context.new_page()
            sender_tab.goto(ORIGIN + '/privacy')
            sender_tab.get_by_role('link', name='personal sender address').click()
            expect(sender_tab).to_have_url(ORIGIN + '/app#sender-address')
            expect(sender_tab.locator('#studio-title')).to_have_text('Settings')
            expect(sender_tab.locator('#copy-sender')).to_be_focused()
            expect(sender_tab.locator('#amazon-steps ol')).to_be_visible()
            sender_tab.close()
            expect(browser_page.locator('#destination-form button[type=submit]')).to_have_text('Save and return')
            setup_filename = browser_page.locator('#setup-return-filename').inner_text()
            assert setup_filename
            for action in ['#return-to-file', '#destination-form button[type=submit]']:
                expect(browser_page.locator(action)).to_have_accessible_description(setup_filename)
            back_to_shelf = browser_page.get_by_role('button', name='Back to Shelf')
            back_to_shelf.click()
            expect(browser_page.locator('#shelf .share-trigger').first).to_be_focused()
            expect(browser_page.locator('#share-dialog')).to_be_hidden()
            browser_page.keyboard.press('Enter')
            expect(browser_page.locator('#share-filename')).to_have_text(setup_filename)
            expect(browser_page.locator('#share-send')).to_have_text('Add Kindle address')
            browser_page.locator('#share-send').click()
            browser_page.locator('#reader-label').fill('قارئ السفر')
            expect(browser_page.locator('#reader-label')).to_have_css('direction', 'rtl')
            browser_page.locator('#kindle-email').fill('first@kindle.com')
            browser_page.locator('#kindle-email').press('Enter')
            expect(browser_page.locator('#reader-label')).to_be_focused()
            browser_page.locator('#reader-label').press('Enter')
            expect(browser_page.locator('#share-dialog')).to_be_visible()
            expect(browser_page.locator('#share-content .action-feedback')).to_contain_text('Approve your personal sender in Amazon before the first send')
            expect(browser_page.locator('#share-filename')).to_be_focused()
            with context.expect_page() as approval_tab:
                browser_page.locator('#share-content').get_by_role('link', name='your personal sender (opens in a new tab)').press('Enter')
            expect(approval_tab.value.locator('#copy-sender')).to_be_focused()
            expect(approval_tab.value.locator('#amazon-steps ol')).to_be_visible()
            approval_tab.value.close()
            expect(browser_page.locator('#share-dialog')).to_be_visible()
            expect(browser_page.locator('#share-filename')).to_have_accessible_description('To قارئ السفر · first@kindle.com')
            expect(browser_page.locator('#send-target bdi').first).to_have_css('direction', 'rtl')
            expect(browser_page.locator('#send-target bdi').last).to_have_css('direction', 'ltr')
            filename_box = browser_page.locator('#share-filename').bounding_box()
            address_box = browser_page.locator('#send-target').bounding_box()
            send_box = browser_page.locator('#share-send').bounding_box()
            notice_box = browser_page.locator('#share-content .action-feedback').bounding_box()
            assert address_box['y'] + address_box['height'] <= notice_box['y']
            assert notice_box['y'] + notice_box['height'] <= send_box['y']
            identity_gap = address_box['y'] - (filename_box['y'] + filename_box['height'])
            action_gap = send_box['y'] - (address_box['y'] + address_box['height'])
            assert 0 <= identity_gap < action_gap
            browser_page.keyboard.press('Enter')
            expect(browser_page.locator('#share-dialog')).to_be_visible()
            expect(browser_page.locator('#share-send')).to_have_text('Send')
            browser_page.locator('#share-dialog .close-dialog').click()
            open_settings(browser_page)
            expect(browser_page.locator('#reader-list strong')).to_have_css('direction', 'rtl')
            expect(browser_page.locator('#reader-list .reader-item p')).to_have_css('direction', 'ltr')
            remove_reader = browser_page.get_by_role('button', name='Remove قارئ السفر')
            expect(remove_reader).to_have_accessible_description('first@kindle.com Default')
            remove_reader.click()
            expect(browser_page.locator('#destination-status')).to_have_text('None saved')
            expect(browser_page.locator('#kindle-email')).to_be_focused()
            select_view(browser_page, 'Forward')
            recovery_tab = context.new_page()
            recovery_tab.goto(ORIGIN + '/app#files-panel')
            first_send = recovery_tab.locator('#shelf .share-trigger').first
            vanished_id = first_send.get_attribute('data-artifact-id')
            first_send.click()
            recovery_tab.locator('#share-send').click()
            recovery_tab.locator('#kindle-email').fill('temporary-recovery@kindle.com')
            def omit_file(route):
                response = route.fetch()
                account = response.json()
                account['artifacts'] = [a for a in account['artifacts'] if a['artifactId'] != vanished_id]
                route.fulfill(response=response, json=account)
            recovery_tab.route('**/api/account', omit_file, times=1)
            recovery_tab.locator('#destination-form button[type=submit]').click()
            saved_notice = recovery_tab.locator('#files-panel > [role=status]')
            expect(saved_notice).to_have_text('Kindle address saved. The file is no longer on your Shelf.')
            expect(saved_notice).to_be_focused()
            expect(recovery_tab.locator('#share-dialog')).to_be_hidden()
            open_settings(recovery_tab)
            recovery_tab.locator('#reader-list').get_by_role('button', name=re.compile('^Remove')).click()
            expect(recovery_tab.locator('#destination-status')).to_have_text('None saved')
            recovery_tab.close()
            # Synthetic saved readers exercise layout and isolation, not Kindle acceptance.
            reader_ids = [secrets.token_hex(16), secrets.token_hex(16)]
            import uuid
            reader_ids = [str(uuid.uuid4()), str(uuid.uuid4())]
            for rid, label, address in zip(reader_ids, ['Bedside Kindle', 'Travel Kindle'], ['bedside@kindle.com','travel@kindle.com']):
                database.execute('INSERT INTO reader_destinations(id,owner,label,email,confirmed_at) VALUES(?,?,?,?,?)', (rid,owner,label,address,now))
            database.execute('UPDATE users SET default_destination_id=? WHERE id=?', (reader_ids[0],owner))
            database.commit()
            # A fresh upload refreshes account settings while preserving the earlier created result.
            browser_page.locator('#uploaded').get_by_role('button', name='Upload another file').click()
            expect(browser_page.locator('#original')).to_be_focused()
            expect(browser_page.locator('#original')).to_have_value('')
            expect(browser_page.locator('#upload-form button[type=submit]')).to_be_hidden()
            expect(browser_page.locator('#back-uploaded')).to_have_accessible_description(browser_page.locator('#uploaded-name').text_content())
            browser_page.locator('#back-uploaded').click()
            expect(browser_page.locator('#uploaded .result-name')).to_be_focused()
            browser_page.locator('#uploaded').get_by_role('button', name='Upload another file').click()
            browser_page.locator('#original').set_input_files(str(ARTIFACTS / 'palim-sample.epub'))
            browser_page.locator('#upload-form button[type=submit]').click()
            browser_page.locator('#uploaded .share-trigger').click()
            expect(browser_page.get_by_role('combobox', name='Choose a Kindle')).to_be_visible()
            expect(browser_page.locator('#send-reader option')).to_have_count(3)
            expect(browser_page.locator('#send-reader')).to_be_focused()
            expect(browser_page.locator('#send-reader option:checked')).to_have_text(re.compile(r'\(default\)$'))
            expect(browser_page.locator('#send-reader option').filter(has_text='Travel Kindle')).to_have_text('Travel Kindle')
            expect(browser_page.locator('#shelf .shelf-item')).to_have_count(3)
            browser_page.locator('#send-reader').select_option(reader_ids[1])
            expect(browser_page.locator('#send-reader')).to_have_value(reader_ids[1])
            expect(browser_page.locator('#send-reader')).to_have_accessible_description('To travel@kindle.com')
            expect(browser_page.locator('#share-send')).to_have_accessible_description(re.compile('palim-sample.epub To travel@kindle.com'))
            expect(browser_page.locator('#share-content .send-target')).to_have_text('To travel@kindle.com')
            browser_page.screenshot(path=str(ARTIFACTS / 'choose-kindle-mobile.png'))
            expect(browser_page.locator('#share-content .send-target')).to_be_visible()
            browser_page.locator('#send-reader').select_option(reader_ids[0])
            expect(browser_page.locator('#share-content .send-target')).to_contain_text('bedside@kindle.com')
            browser_page.locator('#share-dialog .close-dialog').click()
            browser_page.locator('#uploaded').screenshot(path=str(ARTIFACTS / 'upload-result-confirmed-mobile.png'))
            browser_page.locator('#uploaded .share-trigger').click()
            browser_page.route('**/api/send', lambda route: route.fulfill(status=404, json={
                'code':'ARTIFACT_NOT_FOUND', 'message':'This document has expired.',
            }), times=1)
            browser_page.locator('#share-send').click()
            expect(browser_page.locator('#share-content [role=alert]')).to_have_text('This file is no longer on your Shelf. No new email was sent. Upload the original file again.')
            expect(browser_page.locator('#uploaded .artifact-status')).to_have_text('Uploaded · Not sent')
            browser_page.get_by_role('link', name='Upload the original file again').press('Enter')
            expect(browser_page.locator('#original')).to_be_focused()
            browser_page.locator('#original').set_input_files(str(ARTIFACTS / 'palim-sample.epub'))
            expect(browser_page.get_by_role('button', name='Upload to Shelf')).to_be_enabled()
            expect(browser_page.locator('#back-uploaded')).to_be_hidden()
            browser_page.locator('.reader-tabs a[href="#files-panel"]').click()
            for action in browser_page.locator('#shelf a, #shelf button').all():
                bounds = action.bounding_box()
                assert bounds['height'] >= 44 and bounds['width'] >= 44, 'Saved shelf action too small'
            for row in browser_page.locator('#shelf article').all():
                heading = row.get_by_role('heading', level=3)
                copy_label = heading.locator('small')
                name = heading.get_by_role('button').inner_text()
                if copy_label.count():
                    name += f' ({copy_label.inner_text()})'
                expect(row).to_have_accessible_name(name)
            browser_page.locator('#shelf').screenshot(path=str(ARTIFACTS / 'shelf-mobile.png'))
            expiry_context = browser.new_context(ignore_https_errors=True, storage_state=context.storage_state())
            expiry_page = expiry_context.new_page()
            expiry_page.clock.install()
            expiry_page.goto(ORIGIN + '/app#files-panel')
            shelf_expiry = expiry_page.locator('#shelf time').first
            expect(shelf_expiry).to_have_text(re.compile('^Expires '))
            previous_reset = expiry_page.locator('#daily-reset').get_attribute('datetime')
            expiry_page.clock.fast_forward(25 * 60 * 60 * 1000)
            expect(shelf_expiry).to_have_text(re.compile('^Expired '))
            open_settings(expiry_page)
            expiry_page.locator('.limits summary').click()
            expect(expiry_page.locator('#daily-reset')).not_to_have_attribute('datetime', previous_reset)
            assert expiry_page.locator('#daily-reset').evaluate('el => Date.parse(el.dateTime) > Date.now()')
            expiry_context.close()
            expect(browser_page.locator('#shelf time').first).to_have_text(re.compile('^Expires '))
            open_settings(browser_page)
            browser_page.locator('#kindle-email').fill('draft@kindle.com')
            browser_page.locator('#reader-label').fill('Draft address')
            browser_page.locator('#reader-list .reader-item').filter(has_text='Travel Kindle').get_by_role('button', name='Make default: Travel Kindle').click()
            expect(browser_page.get_by_role('group', name='Travel Kindle, travel@kindle.com, Default')).to_be_focused()
            expect(browser_page.locator('#address-setup')).to_be_visible()
            expect(browser_page.locator('#kindle-email')).to_have_value('draft@kindle.com')
            expect(browser_page.locator('#reader-label')).to_have_value('Draft address')
            browser_page.screenshot(path=str(ARTIFACTS / 'destinations-mobile.png'), full_page=True)
            open_settings(browser_page)
            browser_page.locator('.reader-tabs a[href="#files-panel"]').click()
            second_copy = browser_page.get_by_role('article', name='palim-sample.epub (Copy 2 of 2)', exact=True)
            delete_second = second_copy.get_by_role('button', name='Delete palim-sample.epub (Copy 2 of 2) from Shelf')
            duplicate_prompts = []
            def keep_second_copy(dialog):
                duplicate_prompts.append(dialog.message)
                dialog.dismiss()
            browser_page.once('dialog', keep_second_copy)
            delete_second.focus()
            delete_second.press('Enter')
            assert duplicate_prompts == ['Delete palim-sample.epub (Copy 2 of 2) from Shelf? Any copy already in your Kindle library stays there.']
            expect(delete_second).to_be_focused()
            expect(browser_page.get_by_role('article', name='palim-sample.epub (Copy 1 of 2)', exact=True)).to_be_visible()
            second_copy.get_by_role('button', name='palim-sample.epub (Copy 2 of 2) file details').click()
            expect(browser_page.locator('#file-info-dialog')).to_contain_text('Original EPUB · ')
            expect(browser_page.get_by_role('dialog', name='File details')).to_have_accessible_description('palim-sample.epub (Copy 2 of 2)')
            browser_page.keyboard.press('Escape')
            browser_page.locator('#shelf .share-trigger').first.click()
            expect(browser_page.locator('#send-reader')).to_have_value(reader_ids[0])
            expect(browser_page.locator('#share-filename')).to_have_text('palim-sample.epub (Copy 1 of 2)')
            expect(browser_page.locator('#share-filename bdi')).to_have_text('.epub (Copy 1 of 2)')
            expect(browser_page.locator('#send-reader option').filter(has_text='Travel Kindle')).to_have_text('Travel Kindle (default)')
            expect(browser_page.locator('#send-target')).to_have_text('To bedside@kindle.com')
            shelf_send = []
            browser_page.route('**/api/send', lambda route: shelf_send.append(route), times=1)
            browser_page.locator('#share-send').click()
            expect(browser_page.locator('#share-send')).to_have_text('Sending…')
            browser_page.keyboard.press('Escape')
            select_view(browser_page, 'Create')
            shelf_send[0].continue_()
            expect(browser_page.locator('#receipt .receipt-destination strong')).to_have_text('palim-sample.epub (Copy 1 of 2)')
            expect(browser_page.locator('#receipt-panel')).to_be_hidden()
            expect(browser_page.locator('#studio-title')).to_be_focused()
            browser_page.locator('.reader-tabs a[href="#files-panel"]').click()
            browser_page.locator('#receipt-panel').wait_for(state='visible')
            expect(browser_page.locator('#receipt .receipt-destination strong')).to_have_text('palim-sample.epub (Copy 1 of 2)')
            expect(browser_page.locator('#receipt')).to_contain_text('bedside@kindle.com')
            expect(browser_page.locator('#receipt')).to_contain_text('Check your Kindle library to confirm the file arrived.')
            captured = json.loads(database.execute('SELECT payload FROM proof_mail ORDER BY rowid DESC LIMIT 1').fetchone()[0])
            assert captured['to'] == 'bedside@kindle.com'
            assert bytes(captured['attachments'][0]['content']) == (ARTIFACTS / 'palim-sample.epub').read_bytes()
            browser_page.screenshot(path=str(ARTIFACTS / 'send-receipt-mobile.png'), full_page=True)
            uploaded_id = browser_page.locator('#receipt-panel').get_attribute('data-artifact-id')
            browser_page.route('**/api/send', lambda route: route.fulfill(json={
                'deliveryId':'fixture-rejected', 'artifactId':uploaded_id, 'state':'rejected', 'destinationId':reader_ids[0],
            }), times=1)
            browser_page.locator('#shelf .share-trigger').first.click()
            browser_page.locator('#share-send').click()
            recovery_links = browser_page.locator('#receipt .receipt-recovery a')
            expect(recovery_links).to_have_count(1)
            expect(recovery_links).to_have_text('Upload your file to Amazon')
            expect(recovery_links).to_have_attribute('href', 'https://www.amazon.com/sendtokindle')
            open_settings(browser_page)
            browser_page.locator('#reader-label').fill('New Kindle')
            browser_page.locator('#kindle-email').fill('pending@kindle.com')
            before_save_mail = database.execute('SELECT count(*) FROM proof_mail').fetchone()[0]
            browser_page.locator('#destination-form button').click()
            row = browser_page.locator('#reader-list .reader-item').filter(has_text='pending@kindle.com')
            row.wait_for()
            assert database.execute('SELECT count(*) FROM proof_mail').fetchone()[0] == before_save_mail
            expect(browser_page.locator('#confirm-form')).to_have_count(0)
            browser_page.screenshot(path=str(ARTIFACTS / 'saved-address-added-mobile.png'), full_page=True)
            open_settings(browser_page)
            select_view(browser_page, 'Forward')
            browser_page.locator('h1').click()
            browser_page.screenshot(path=str(ARTIFACTS / 'workspace-mobile.png'), full_page=True)
            open_settings(browser_page)
            scroll_metrics = browser_page.evaluate("""() => {
                const workspace = document.querySelector('.workspace');
                const shell = document.querySelector('.studio-screen');
                return {
                    clientHeight: workspace.clientHeight,
                    scrollHeight: workspace.scrollHeight,
                    shellHeight: shell.getBoundingClientRect().height,
                    documentHeight: document.documentElement.scrollHeight,
                    viewportHeight: innerHeight,
                };
            }""")
            assert scroll_metrics['scrollHeight'] > scroll_metrics['clientHeight'] + 100
            assert scroll_metrics['shellHeight'] <= scroll_metrics['viewportHeight']
            assert scroll_metrics['documentHeight'] <= scroll_metrics['viewportHeight'] + 1
            browser_page.locator('.workspace').evaluate('(e)=>{e.scrollTop=e.scrollHeight}')
            browser_page.screenshot(path=str(ARTIFACTS / 'workspace-scrolled-mobile.png'), full_page=True)
            select_view(browser_page, 'Forward')
            assert browser_page.locator('.workspace').evaluate('(e)=>e.scrollTop') == 0
            expect(browser_page.locator('#studio-title')).to_be_focused()
            assert browser_page.title() == browser_page.locator('#studio-title').inner_text() + ' · Palim'
            open_settings(browser_page)
            expect(browser_page.locator('#workspace-subtitle')).to_be_hidden()
            browser_page.set_viewport_size({'width': 1440, 'height': 1000})
            browser_page.screenshot(path=str(ARTIFACTS / 'workspace-desktop.png'), full_page=True)
            browser_page.emulate_media(reduced_motion='reduce')
            assert browser_page.evaluate('getComputedStyle(document.documentElement).scrollBehavior') == 'auto'
            browser_page.set_viewport_size({'width':390,'height':844})
            browser_page.evaluate('document.body.style.zoom = "200%"')
            overflow = browser_page.evaluate('''() => {
                const limit = document.documentElement.clientWidth;
                const wide = [];
                for (const el of document.querySelectorAll('body *')) {
                    const box = el.getBoundingClientRect();
                    if (box.width && box.right > limit + 1)
                        wide.push(`${el.tagName}.${(el.className || '').toString().slice(0, 40)} right=${Math.round(box.right)} width=${Math.round(box.width)}`);
                }
                return { limit, scroll: document.documentElement.scrollWidth, wide: wide.slice(0, 8) };
            }''')
            assert not browser_page.evaluate('document.documentElement.scrollWidth > innerWidth'), f'200% zoom overflow {overflow}'
            browser_page.screenshot(path=str(ARTIFACTS / 'workspace-zoom-mobile.png'), full_page=True)
            browser_page.evaluate('document.body.style.zoom = ""')
            browser_page.get_by_role('button', name='Remove Travel Kindle').click()
            expect(browser_page.locator('#reader-list .reader-item:focus')).to_have_count(1)
            expect(browser_page.get_by_role('button', name='Remove Travel Kindle')).to_have_count(0)
            browser_page.locator('.reader-tabs a[href="#files-panel"]').click()
            rows = browser_page.locator('#shelf .shelf-item')
            count = rows.count()
            assert count >= 2
            name = rows.last.get_by_role('heading', level=3).inner_text()
            prompts = []
            def keep_file(dialog):
                prompts.append(dialog.message)
                dialog.dismiss()
            browser_page.once('dialog', keep_file)
            rows.last.locator('.delete-trigger').focus()
            browser_page.keyboard.press('Enter')
            expect(rows).to_have_count(count)
            expect(rows.last.locator('.delete-trigger')).to_be_focused()
            assert prompts and name in prompts[0] and 'from Shelf' in prompts[0]
            for target_row, lost_connection in [(rows.first, True), (rows.last, False)]:
                other_download = target_row.get_by_role('link', name=re.compile('^Download'))
                interrupted_delete = []
                browser_page.route('**/api/files/*', lambda route: interrupted_delete.append(route), times=1)
                browser_page.once('dialog', lambda dialog: dialog.accept())
                rows.last.locator('.delete-trigger').click()
                other_download.focus()
                if lost_connection:
                    interrupted_delete[0].abort('failed')
                else:
                    interrupted_delete[0].fulfill(status=200, content_type='application/json', body='{')
                expect(rows.last.get_by_role('alert')).to_have_text('Couldn’t confirm deletion. Reload your Shelf to see whether the file is still there.')
                expect(rows.last.locator('.delete-trigger')).to_be_enabled()
                expect(other_download).to_be_focused()
                expect(rows).to_have_count(count)
            for remaining in reversed(range(count)):
                deleted_name = rows.last.get_attribute('aria-label')
                browser_page.once('dialog', lambda dialog: dialog.accept())
                keep_download = remaining == count - 1
                if keep_download:
                    pending_delete = []
                    browser_page.route('**/api/files/*', lambda route: pending_delete.append(route), times=1)
                rows.last.locator('.delete-trigger').click()
                if keep_download:
                    download = rows.first.get_by_role('link', name=re.compile('^Download'))
                    download.focus()
                    pending_delete.pop().continue_()
                expect(rows).to_have_count(remaining)
                confirmation = f'Deleted {deleted_name}.'
                expect(browser_page.locator('#files-panel > .action-feedback')).to_have_text(confirmation)
                if keep_download:
                    expect(download).to_be_focused()
                elif remaining:
                    expect(rows.last.get_by_role('heading').get_by_role('button')).to_be_focused()
            expect(browser_page.locator('#empty-shelf-actions a').first).to_be_focused()
            expect(browser_page.locator('#receipt-panel')).to_be_hidden()
            open_settings(browser_page)
            for selector in ['#amazon-steps', '.limits']:
                section = browser_page.locator(selector)
                if not section.evaluate('el => el.open'):
                    section.locator('summary').click()
            select_view(browser_page, 'Create')
            browser_page.locator('.book-metadata summary').click()
            browser_page.locator('#creator').fill('Private author')
            browser_page.locator('.book-metadata summary').click()
            browser_page.locator('#title').fill('Private draft')
            browser_page.locator('#manuscript').fill('Private writing')
            context.clear_cookies()
            browser_page.route('**/api/books', lambda route: route.fulfill(status=401, body=''), times=1)
            browser_page.locator('#create-form button[type=submit]').click()
            expect(browser_page.locator('#login-email')).to_be_focused()
            expect(browser_page.locator('#signin')).to_contain_text('Your session ended.')
            expect(browser_page.locator('#account-name')).to_be_empty()
            expect(browser_page.locator('#desk details[open]')).to_have_count(0)
            expect(browser_page.locator('#metadata-author')).to_be_empty()
            expect(browser_page.locator('#metadata-values')).to_be_hidden()
            for field in ['title', 'creator', 'manuscript', 'original', 'kindle-email', 'reader-label']:
                expect(browser_page.locator('#' + field)).to_have_value('')
            # Model reauthentication after the synthetic account's initial code cooldown.
            database.execute("UPDATE mail_attempts SET created_at=created_at-61 WHERE purpose='login'")
            database.execute('UPDATE auth_rate_limits SET lastRequest=lastRequest-300000')
            database.commit()
            for email, recover in [('reader@example.invalid', True), ('fresh-draft@example.invalid', False)]:
                browser_page.locator('#login-email').fill(email)
                browser_page.locator('#login-email-form button').click()
                expect(browser_page.locator('#login-code')).to_be_visible()
                envelope = json.loads(database.execute('SELECT payload FROM proof_mail ORDER BY rowid DESC LIMIT 1').fetchone()[0])
                assert envelope['to'] == email and envelope['subject'] == 'Your Palim sign-in code'
                otp = re.search(r'(?m)^(\d{6})$', envelope['text']).group(1)
                browser_page.locator('#login-code').fill(otp)
                browser_page.locator('#login-code-form button[type=submit]').click()
                expect(browser_page.locator('#desk')).to_be_visible()
                expect(browser_page.locator('#account-name')).to_have_text(email)
                expect(browser_page.locator('#title')).to_have_value('Private draft' if recover else '')
                expect(browser_page.locator('#manuscript')).to_have_value('Private writing' if recover else '')
                expect(browser_page.locator('#metadata-author')).to_have_text('Private author' if recover else '')
                if recover:
                    expect(browser_page.locator('#draft-recovery')).to_be_visible()
                    expect(browser_page.locator('#manuscript')).to_have_accessible_description(re.compile('Draft restored.*Markdown'))
                    expect(browser_page.locator('#manuscript')).to_be_focused()
                    browser_page.locator('#title').fill('')
                    expect(browser_page.locator('#draft-recovery')).to_be_hidden()
                    expect(browser_page.locator('#manuscript')).to_have_accessible_description(browser_page.locator('#manuscript-help').inner_text())
                    browser_page.locator('#manuscript').fill('')
                    open_settings(browser_page)
                    browser_page.locator('#kindle-email').fill('metadata-check@kindle.com')
                    context.clear_cookies()
                    browser_page.locator('#destination-form button[type=submit]').click()
                    expect(browser_page.locator('#signin')).to_contain_text('recover your draft')
                    expect(browser_page.locator('#login-email')).to_be_focused()
            open_settings(browser_page)
            expect(browser_page.locator('#account-name')).to_be_visible()
            def cancel_switched_account(dialog):
                assert 'fresh-draft@example.invalid' in dialog.message
                assert 'reader@example.invalid' not in dialog.message
                dialog.dismiss()
            browser_page.once('dialog', cancel_switched_account)
            browser_page.locator('#delete-account').click()
            expect(browser_page.locator('#delete-account')).to_be_focused()
            pending_deletion = []
            browser_page.route('**/api/account', lambda route: pending_deletion.append(route), times=1)
            browser_page.once('dialog', lambda dialog: dialog.accept())
            delete_account = browser_page.locator('#delete-account')
            with browser_page.expect_request(lambda req: req.url.endswith('/api/account') and req.method == 'DELETE'):
                delete_account.click()
            expect(delete_account).to_have_text('Deleting account…')
            expect(delete_account).to_be_disabled()
            pending_deletion.pop().continue_()
            expect(browser_page.locator('#signin').get_by_role('status')).to_have_text('Account deleted.')
            expect(browser_page.locator('#login-email')).to_be_focused()
            expect(browser_page.locator('#desk')).to_be_hidden()
            browser_page.locator('#login-email').fill('new-reader@example.invalid')
            expect(browser_page.get_by_text('Account deleted.', exact=True)).to_have_count(0)
            expect(browser_page.locator('#login-email')).to_be_focused()
            browser_page.goto(ORIGIN + '/privacy#agent-access')
            browser_page.get_by_role('link', name='Connected applications', exact=True).click()
            expect(browser_page).to_have_title('Sign in · Connected applications · Palim')
            browser_page.locator('#login-email').fill('grants-review@example.invalid')
            browser_page.locator('#login-email').press('Enter')
            expect(browser_page.locator('#login-code')).to_be_focused()
            captured = json.loads(database.execute('SELECT payload FROM proof_mail ORDER BY rowid DESC LIMIT 1').fetchone()[0])
            code = re.search(r'(?m)^(\d{6})$', captured['text']).group(1)
            browser_page.locator('#login-code').fill(code)
            browser_page.locator('#login-code').press('Enter')
            expect(browser_page.locator('#grants-heading')).to_be_focused()
            expect(browser_page.locator('#grant-list')).to_have_text('No connected applications.')
            expect(browser_page).to_have_url(ORIGIN + '/app#oauth-grants')
            assert not errors, errors
            browser.close()
        print('Real Chromium navigation, mobile layout, illustrated preview, browser create and original-upload journeys passed.')
    if args.pages:
        print('Pages front door and real Worker service binding preserved public OAuth origin, cookies, bearer tokens, request bodies, private downloads and wrong-origin refusal.')
    # Real independent login may not access another user's document or saved readers.
    cookies[:] = alice_cookie
    status, _, payload = request('/api/files', 'POST', (ARTIFACTS / 'palim-sample.epub').read_bytes(), 'application/epub+zip', {'X-Filename':'private-proof.epub'})
    assert status == 201
    private = json.loads(payload)
    second_owner = login('second@example.invalid', '192.0.2.11')
    assert post('/api/send', {'artifactId':private['artifactId']})[0] == 404
    assert request('/api/files/' + private['artifactId'], 'DELETE')[0] == 404
    assert json.loads(request('/api/account')[2])['destinations'] == []
    if args.browser:
        assert post('/api/destinations/' + reader_ids[0] + '/default', {})[0] == 404
        assert request('/api/destinations/' + reader_ids[0], 'DELETE')[0] == 404
        assert post('/api/send', {'artifactId':private['artifactId'], 'destinationId':reader_ids[0]})[0] == 404
    assert request('/api/oauth-grants/nonexistent-grant', 'DELETE')[0] == 404
    assert request('/api/account', 'DELETE')[0] == 200
    assert request('/api/account')[0] == 401

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
