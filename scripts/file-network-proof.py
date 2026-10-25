"""Isolated workerd public-network proof. No identity, OAuth, storage or email bindings."""
import hashlib
import json
from pathlib import Path
import socket
import subprocess
import tempfile
import time
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
WORK = Path(tempfile.mkdtemp(prefix='file-network-', dir=ROOT / '.local'))

def free_port():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]

port = free_port()
witness = socket.socket()
witness.bind(('127.0.0.1', 0))
witness.listen()
witness.settimeout(0.2)
witness_port = witness.getsockname()[1]
(WORK / 'main.mjs').write_text('''export default {async fetch(request) {
  const url = new URL(request.url).searchParams.get('url');
  if (!url) return new Response('ready');
  try {
    const r = await fetch(url, {redirect:'manual', signal:AbortSignal.timeout(10000)});
    const bytes = new Uint8Array(await r.arrayBuffer());
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
    return Response.json({status:r.status, bytes:bytes.length, hash});
  } catch(error) { return Response.json({blocked:true, error:error.message}); }
}};''')
schema = '../../node_modules/workerd/workerd.capnp'
(WORK / 'config.capnp').write_text(f'''using Workerd = import "{schema}";
const config :Workerd.Config = (
 services = [
  (name="main", worker=(modules=[(name="main.mjs",esModule=embed "main.mjs")],
   compatibilityDate="2026-07-01", compatibilityFlags=["global_fetch_strictly_public"], globalOutbound="internet")),
  (name="internet", network=(allow=["public"],tlsOptions=(trustBrowserCas=true)))
 ],
 sockets=[(name="http",address="127.0.0.1:{port}",http=(),service="main")]
);''')
log = (WORK / 'runtime.log').open('w')
process = subprocess.Popen([str(ROOT / 'node_modules/.bin/workerd'),
                           'serve', str(WORK / 'config.capnp')], stdout=log, stderr=log)
base = f'http://127.0.0.1:{port}/'
try:
    for _ in range(100):
        if process.poll() is not None:
            raise RuntimeError((WORK / 'runtime.log').read_text())
        try:
            urllib.request.urlopen(base, timeout=1).close()
            break
        except OSError:
            time.sleep(0.1)
    else:
        raise RuntimeError('Native runtime did not start')
    def probe(url):
        with urllib.request.urlopen(base + '?url=' + urllib.parse.quote(url, safe=''), timeout=15) as r:
            return json.load(r)
    positive = probe('https://palim-timc0y.pages.dev/sample.epub')
    assert positive.get('status') == 200, positive
    assert positive['hash'] == hashlib.sha256((ROOT / 'public/sample.epub').read_bytes()).hexdigest()
    negatives = []
    for host in ['127.0.0.1', '127.0.0.1.nip.io', '[::1]', '[::ffff:127.0.0.1]',
                 '10.0.0.1', '169.254.169.254', '[fc00::1]', '[fe80::1]']:
        result = probe(f'http://{host}:{witness_port}/proof')
        assert result.get('blocked'), (host, result)
        negatives.append({'host':host, **result})
    try:
        connection, _ = witness.accept()
        connection.close()
        raise AssertionError('Public network connected to private witness')
    except socket.timeout:
        pass
    assert (WORK / 'runtime.log').read_text().count('connect() blocked by restrictPeers()') >= len(negatives)
    result = {'runtime':'workerd', 'policy':'public', 'positive':positive,
              'negative':negatives, 'privateWitnessConnections':0,
              'mailSent':False, 'oauthGrants':False}
    (ROOT / 'artifacts').mkdir(exist_ok=True)
    (ROOT / 'artifacts/file-network-proof.json').write_text(json.dumps(result, indent=2)+'\n')
    print(json.dumps(result, indent=2))
finally:
    witness.close()
    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait()
    log.close()
