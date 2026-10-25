const $ = (id) => document.getElementById(id);
let currentAccount = null,
  receiptId = null,
  example = null;
function notice(message, error = false) {
  $('notice').textContent = message;
  $('notice').className = `notice${error ? ' error' : ''}`;
  $('notice').hidden = false;
}
async function api(path, options = {}) {
  const response = await fetch(path, { credentials: 'same-origin', ...options });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('The server did not return a readable response.');
  }
  if (!response.ok)
    throw Object.assign(
      new Error(
        path === '/auth/sign-in/email-otp' && [400, 401].includes(response.status)
          ? 'That code is invalid or expired. Try again or request a new code.'
          : data.message || 'The operation could not finish.',
      ),
      {
        status: response.status,
      },
    );
  return data;
}
const post = (path, value) =>
  api(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  });
function link(label, href) {
  const a = document.createElement('a');
  a.textContent = label;
  a.href = href;
  a.rel = 'noopener noreferrer';
  if (label === 'Preview') a.target = '_blank';
  return a;
}
function button(label, callback, style = 'secondary') {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = style;
  b.textContent = label;
  b.addEventListener('click', () => busy(b, callback));
  return b;
}
async function busy(element, work) {
  const original = element.textContent;
  const form = element.closest('form'),
    area = form || element.closest('.shelf-item,.reader-item') || element.parentElement;
  let feedback = area.querySelector(':scope > .action-feedback');
  if (!feedback) {
    feedback = document.createElement('p');
    feedback.className = 'action-feedback';
    feedback.tabIndex = -1;
    area.append(feedback);
  }
  feedback.textContent = '';
  if (form) {
    feedback.id = `${form.id}-feedback`;
    form.setAttribute('aria-describedby', feedback.id);
    form.setAttribute('aria-busy', 'true');
    for (const input of form.querySelectorAll('[aria-invalid]'))
      input.removeAttribute('aria-invalid');
  }
  element.disabled = true;
  const states = {
    'create-form': 'Creating…',
    'upload-form': 'Uploading…',
    'destination-form': 'Sending verification book…',
    'confirm-form': 'Confirming…',
    'login-email-form': 'Requesting code…',
    'login-code-form': 'Signing in…',
  };
  element.textContent =
    element.id === 'resend-login'
      ? 'Requesting code…'
      : states[form?.id] || (/Send/.test(original) ? 'Sending…' : 'Working…');
  try {
    await work();
  } catch (e) {
    feedback.textContent = e.message;
    feedback.className = 'action-feedback error';
    feedback.setAttribute('role', 'alert');
    if (form?.id === 'login-code-form' && e.status === 400) {
      $('login-code').setAttribute('aria-invalid', 'true');
      $('login-code').setAttribute('aria-describedby', `login-sent ${feedback.id}`);
    }
    feedback.focus();
  } finally {
    if (form) form.setAttribute('aria-busy', 'false');
    element.disabled = false;
    element.textContent = original;
  }
}
function chosenReader() {
  return currentAccount?.destinations.find((d) => d.id === $('send-reader').value);
}
function sendButton(artifactId) {
  const b = button(chosenReader() ? 'Send to this Kindle' : 'Add a Kindle address', async () => {
    if (!chosenReader()) {
      $('setup-details').open = true;
      $('kindle-email').focus();
      return;
    }
    await send(artifactId);
  });
  b.classList.add('send-action');
  return b;
}
function updateSendTargets() {
  const d = chosenReader();
  for (const target of document.querySelectorAll('.send-target'))
    target.textContent = d
      ? `${d.label} · ${d.email}`
      : 'Choose a confirmed Kindle address above before sending.';
  for (const b of document.querySelectorAll('.send-action'))
    b.textContent = d ? 'Send to this Kindle' : 'Add a Kindle address';
}
function showReceipt(receipt) {
  receiptId = receipt.deliveryId;
  $('receipt-panel').hidden = false;
  const box = $('receipt');
  box.replaceChildren();
  const state = document.createElement('p');
  state.className = 'receipt-state';
  state.textContent = receipt.state;
  const message = document.createElement('p');
  message.textContent = receipt.message;
  const id = document.createElement('code');
  id.textContent = receipt.deliveryId;
  const recipient = document.createElement('p');
  const target = currentAccount?.destinations.find((d) => d.id === receipt.destinationId);
  const file = currentAccount?.artifacts.find((a) => a.artifactId === receipt.artifactId);
  recipient.textContent = `${file?.filename || (receipt.artifactId ? 'Document' : 'Verification book')} · To: ${target?.email || receipt.destination || 'Your requested verification address'}`;
  box.append(state, recipient, message, id);
  box.tabIndex = -1;
  box.focus();
  notice(receipt.message);
}
async function send(artifactId) {
  const destinationId = chosenReader()?.id;
  if (!destinationId) throw new Error('Choose a confirmed Kindle address first.');
  const receipt = await post('/api/send', { artifactId, destinationId });
  showReceipt(receipt);
  await refresh();
}
function showArtifact(target, artifact) {
  const box = $(target);
  box.hidden = false;
  box.replaceChildren();
  const title = document.createElement('h3');
  title.textContent = artifact.filename;
  const meta = document.createElement('p');
  meta.textContent = `${(artifact.bytes / 1024).toFixed(1)} KiB · ${artifact.generated ? 'Generated reading edition' : 'Original file preserved'} · expires ${new Date(artifact.expiresAt).toLocaleString()}`;
  const actions = document.createElement('div');
  actions.className = 'actions';
  actions.append(link('Download', artifact.downloadUrl));
  if (artifact.previewUrl) actions.append(link('Preview', artifact.previewUrl));
  if (artifact.sourceUrl) actions.append(link('Source manuscript', artifact.sourceUrl));
  if (artifact.emailEligible) actions.append(sendButton(artifact.artifactId));
  const hash = document.createElement('p');
  hash.className = 'hash';
  hash.textContent = `SHA-256 ${artifact.sha256}`;
  const recipient = document.createElement('p');
  recipient.className = 'send-target';
  box.append(title, meta, recipient, actions, hash);
  updateSendTargets();
  box.tabIndex = -1;
  box.focus();
  if (!artifact.emailEligible) {
    const warning = document.createElement('p');
    warning.textContent =
      'This file remains unchanged and downloadable, but it is too large for the email route.';
    box.append(warning);
  }
  for (const warning of artifact.warnings || []) {
    const p = document.createElement('p');
    p.textContent = warning;
    box.append(p);
  }
}
function showShelf(artifacts) {
  const shelf = $('shelf');
  shelf.replaceChildren();
  if (!artifacts.length) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = 'Your recent files will appear here for 24 hours.';
    shelf.append(p);
    return;
  }
  for (const a of artifacts) {
    const item = document.createElement('article');
    item.className = 'shelf-item';
    const title = document.createElement('strong');
    title.textContent = a.filename;
    const info = document.createElement('small');
    info.textContent = `${(a.bytes / 1024).toFixed(1)} KiB · ${a.generated ? 'Reading edition' : 'Original'} · expires ${new Date(a.expiresAt).toLocaleString()}`;
    const links = document.createElement('div');
    links.className = 'shelf-links';
    links.append(link('Download', a.downloadUrl));
    if (a.previewUrl) links.append(link('Preview', a.previewUrl));
    if (a.emailEligible) links.append(sendButton(a.artifactId));
    links.append(
      button(
        'Delete',
        async () => {
          await api(`/api/files/${a.artifactId}`, { method: 'DELETE' });
          await refresh();
        },
        'plain-button',
      ),
    );
    const recipient = document.createElement('p');
    recipient.className = 'send-target';
    item.append(title, info, recipient, links);
    shelf.append(item);
  }
}
async function refresh() {
  try {
    currentAccount = await api('/api/account');
    document.body.classList.add('signed-in');
    document.body.classList.remove('signed-out');
    $('signin').hidden = true;
    $('desk').hidden = false;
    $('logout').hidden = false;
    $('account-name').textContent = currentAccount.name;
    $('sender-address').textContent = currentAccount.sender;
    $('reader-choice').hidden = false;
    const previous = $('send-reader').value;
    $('send-reader').replaceChildren(new Option('Choose a confirmed Kindle address', ''));
    for (const d of currentAccount.destinations)
      $('send-reader').append(
        new Option(`${d.label} · ${d.email}${d.isDefault ? ' (default)' : ''}`, d.id),
      );
    $('send-reader').value = currentAccount.destinations.some((d) => d.id === previous)
      ? previous
      : currentAccount.defaultDestinationId || '';
    $('destination-status').textContent = currentAccount.destinations.length
      ? `${currentAccount.destinations.length} confirmed ${currentAccount.destinations.length === 1 ? 'address' : 'addresses'}`
      : 'No confirmed Kindle addresses yet.';
    $('setup-details').open =
      !!currentAccount.pendingDestination || !currentAccount.destinations.length;
    $('confirm-form').hidden = !currentAccount.pendingDestination;
    $('confirm-form').querySelector('label').textContent = currentAccount.pendingDestination
      ? `Code inside the Kindle verification book for ${currentAccount.pendingDestination}`
      : 'Code inside the Kindle verification book';
    const list = $('reader-list');
    list.replaceChildren();
    for (const d of currentAccount.destinations) {
      const row = document.createElement('div');
      row.className = 'reader-item';
      const name = document.createElement('strong');
      name.textContent = d.label;
      const address = document.createElement('p');
      address.textContent = d.email + (d.isDefault ? ' · Default' : '');
      row.append(name, address);
      if (!d.isDefault)
        row.append(
          button(
            'Make default',
            async () => {
              await post(`/api/destinations/${d.id}/default`, {});
              await refresh();
            },
            'plain-button',
          ),
        );
      row.append(
        button(
          'Remove',
          async () => {
            await api(`/api/destinations/${d.id}`, { method: 'DELETE' });
            await refresh();
          },
          'plain-button',
        ),
      );
      list.append(row);
    }
    showShelf(currentAccount.artifacts);
    updateSendTargets();
  } catch (e) {
    if (e.status === 401) {
      document.body.classList.add('signed-out');
      document.body.classList.remove('signed-in');
      $('signin').hidden = false;
      $('desk').hidden = true;
      $('logout').hidden = true;
      $('reader-choice').hidden = true;
    } else notice(e.message, true);
  }
}
function chooseTask(hash) {
  const upload = hash === '#upload-form';
  $('create-panel').hidden = upload;
  $('upload-panel').hidden = !upload;
  for (const a of document.querySelectorAll('.job-choices a')) {
    if (a.hash === (upload ? '#upload-form' : '#create-form'))
      a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
}
for (const a of document.querySelectorAll('.job-choices a'))
  a.addEventListener('click', (event) => {
    event.preventDefault();
    history.replaceState(null, '', a.hash);
    chooseTask(a.hash);
  });
addEventListener('hashchange', () => chooseTask(location.hash));
chooseTask(location.hash);
$('original').addEventListener('change', () => {
  const file = $('original').files[0];
  $('file-name').textContent = file?.name || 'Choose an EPUB or PDF';
  $('file-info').textContent = file
    ? `${(file.size / 1024).toFixed(1)} KiB · Original file`
    : 'Your original stays unchanged · up to 20 MiB';
});
$('create-form').addEventListener('submit', (event) => {
  event.preventDefault();
  busy(event.submitter, async () => {
    const body = {
      title: $('title').value,
      language: $('language').value,
      chapters: [{ title: 'The guide', markdown: $('manuscript').value }],
    };
    if ($('creator').value.trim()) body.creator = $('creator').value.trim();
    if (example) {
      body.figures = example.figures.filter((f) =>
        $('manuscript').value.includes(`figure:${f.id}`),
      );
      body.sources = example.sources;
      body.subtitle = example.subtitle;
    }
    const artifact = await post('/api/books', body);
    showArtifact('created', artifact);
    notice('Your book is ready. It has not been sent.');
    await refresh();
  });
});
$('example-button').addEventListener('click', (event) =>
  busy(event.currentTarget, async () => {
    const response = await fetch('/example.json');
    if (!response.ok) throw new Error('The example could not be loaded.');
    example = await response.json();
    $('title').value = example.title;
    $('creator').value = example.creator || '';
    $('manuscript').value = example.chapters
      .map((c) => `# ${c.title}\n\n${c.markdown}`)
      .join('\n\n');
    notice(
      'Loaded the illustrated example. You can edit its text; referenced figures and source notes stay attached.',
    );
  }),
);
$('upload-form').addEventListener('submit', (event) => {
  event.preventDefault();
  busy(event.submitter, async () => {
    const file = $('original').files[0];
    if (!file) throw new Error('Choose a file first.');
    const artifact = await api('/api/files', {
      method: 'POST',
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
        'X-Filename': file.name.replace(/[^\x20-\x7E]/g, '_'),
      },
      body: file,
    });
    showArtifact('uploaded', artifact);
    notice('The original is uploaded unchanged. Nothing has been sent.');
    await refresh();
  });
});
$('destination-form').addEventListener('submit', (event) => {
  event.preventDefault();
  busy(event.submitter, async () => {
    showReceipt(
      await post('/api/destination', {
        email: $('kindle-email').value,
        label: $('reader-label').value,
      }),
    );
    $('confirm-form').querySelector('label').textContent =
      `Code inside the Kindle verification book for ${$('kindle-email').value}`;
    await refresh();
  });
});
$('confirm-form').addEventListener('submit', (event) => {
  event.preventDefault();
  busy(event.submitter, async () => {
    const result = await post('/api/confirm', { code: $('verification-code').value.trim() });
    $('verification-code').value = '';
    notice(`Reader confirmed: ${result.destination}`);
    await refresh();
  });
});
$('refresh-receipt').addEventListener('click', (event) =>
  busy(event.currentTarget, async () => {
    if (receiptId) showReceipt(await api(`/api/deliveries/${receiptId}`));
  }),
);
$('mcp-url').textContent = `${location.origin}/mcp`;
$('copy-mcp').addEventListener('click', (event) =>
  busy(event.currentTarget, async () => {
    await navigator.clipboard.writeText(`${location.origin}/mcp`);
    notice('MCP address copied.');
  }),
);
$('send-reader').addEventListener('change', updateSendTargets);
async function requestLogin() {
  const email = $('login-email').value.trim();
  const result = await post('/auth/email-otp/send-verification-otp', { email, type: 'sign-in' });
  $('login-sent').textContent = `Sign-in code requested for ${email}. ${result.message}`;
  $('login-email-form').hidden = true;
  $('login-code-form').hidden = false;
  $('login-code').focus();
}
$('login-email-form').addEventListener('submit', (event) => {
  event.preventDefault();
  busy(event.submitter, requestLogin);
});
$('resend-login').addEventListener('click', (event) => busy(event.currentTarget, requestLogin));
$('change-login-email').addEventListener('click', () => {
  $('login-code-form').hidden = true;
  $('login-email-form').hidden = false;
  $('login-code').value = '';
  $('login-email').focus();
});
$('login-code-form').addEventListener('submit', (event) => {
  event.preventDefault();
  busy(event.submitter, async () => {
    await post('/auth/sign-in/email-otp', {
      email: $('login-email').value.trim().toLowerCase(),
      otp: $('login-code').value.trim(),
    });
    const target = new URL(
      new URLSearchParams(location.search).get('returnTo') || '/app' + location.hash,
      location.origin,
    );
    location.assign(
      target.origin === location.origin ? target.pathname + target.search + target.hash : '/app',
    );
  });
});
await refresh();
