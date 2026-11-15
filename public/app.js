const $ = (id) => document.getElementById(id);
let currentAccount = null,
  receiptId = null,
  example = null,
  selectedReaderId = '',
  setupReturn = null,
  sendingArtifactId = '',
  shareContext = null;
/** The feedback slot for an area, created on demand. */
function feedbackFor(area) {
  if (!area) return null;
  let box = area.querySelector(':scope > .action-feedback');
  if (!box) {
    box = document.createElement('p');
    box.className = 'action-feedback';
    box.tabIndex = -1;
    if (area.classList.contains('result')) area.insertBefore(box, area.querySelector('.actions'));
    else area.append(box);
  }
  return box;
}

/** Show a message in the feedback slot beside the control that caused it. */
function feedback(area, message, error = false) {
  const box = feedbackFor(area);
  if (!box) return null;
  box.textContent = message;
  box.className = `action-feedback${error ? ' error' : ''}`;
  box.setAttribute('role', error ? 'alert' : 'status');
  return box;
}
async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(path, { credentials: 'same-origin', ...options });
  } catch {
    throw new Error('Connection failed. Check your network.');
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('Unreadable server response.');
  }
  if (!response.ok)
    throw Object.assign(
      new Error(
        path === '/auth/sign-in/email-otp' && [400, 401].includes(response.status)
          ? 'Code invalid or expired. Request a new one.'
          : data.message || 'Could not complete this.',
      ),
      {
        status: response.status,
        code: data.code,
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
function fileSize(bytes) {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
    : `${(bytes / 1024).toFixed(1)} KiB`;
}
function expiryTime(value) {
  const date = new Date(value);
  const time = document.createElement('time');
  time.dateTime = date.toISOString();
  time.title = date.toLocaleString();
  time.textContent = `Expires ${date.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`;
  return time;
}
function link(label, href) {
  const a = document.createElement('a');
  a.textContent = label;
  a.href = href;
  a.rel = 'noopener noreferrer';
  if (label === 'Preview') a.target = '_blank';
  return a;
}
const iconPaths = {
  edit: 'm15 5 4 4M4 20l4-1 12-12a2.8 2.8 0 0 0-4-4L4 16z',
  download: 'M12 3v12m-4-4 4 4 4-4M5 16v4h14v-4',
  preview: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12m13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  share: 'M5 12h.01M12 12h.01M19 12h.01',
  info: 'M12 11v6m0-10h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  close: 'm6 6 12 12M6 18 18 6',
  trash: 'M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7',
  file: 'M6 3h8l4 4v14H6zM14 3v5h4M9 12h6m-6 4h6',
  send: 'm3 3 18 9-18 9 4-9zm4 9h14',
};
function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', iconPaths[name]);
  svg.append(path);
  return svg;
}
function decorate(control, name, iconOnly = false, accessibleName = control.textContent) {
  const label = document.createElement('span');
  label.className = `btn-label${iconOnly ? ' sr-only' : ''}`;
  label.textContent = control.textContent;
  control.replaceChildren(icon(name), label);
  if (iconOnly) {
    control.classList.add('icon-button');
    control.setAttribute('aria-label', accessibleName);
    control.title = accessibleName;
  }
  return control;
}
function viewButton(label, name, action) {
  const control = document.createElement('button');
  control.type = 'button';
  control.className = 'secondary';
  control.textContent = label;
  decorate(control, name, true, label);
  control.addEventListener('click', action);
  return control;
}
$('edit-title').append(icon('edit'));
$('edit-title').addEventListener('click', () => {
  $('title').focus();
  $('title').select();
});
$('options-icon').append(icon('info'));
for (const close of document.querySelectorAll('.close-dialog')) close.append(icon('close'));
$('share-send').prepend(icon('send'));
const settingsMenu = $('settings-menu');
settingsMenu.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && settingsMenu.open) {
    event.preventDefault();
    settingsMenu.open = false;
    settingsMenu.querySelector('summary').focus();
  }
});
document.addEventListener('click', (event) => {
  if (settingsMenu.open && !settingsMenu.contains(event.target)) settingsMenu.open = false;
});
function button(label, callback, style = 'secondary') {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = style;
  b.textContent = label;
  b.addEventListener('click', () => busy(b, callback));
  return b;
}
async function busy(element, work) {
  const label = element.querySelector('.btn-label') || element;
  const original = label.textContent;
  const form = element.closest('form'),
    area = form || element.closest('.shelf-item,.reader-item') || element.parentElement;
  if (form?.getAttribute('aria-busy') === 'true') return;
  const controls = form
    ? [...form.elements].filter((control) => 'disabled' in control && !control.disabled)
    : [element];
  const feedback = feedbackFor(area);
  feedback.textContent = '';
  if (form) {
    feedback.id = `${form.id}-feedback`;
    form.setAttribute('aria-describedby', feedback.id);
    form.setAttribute('aria-busy', 'true');
    for (const input of form.querySelectorAll('[aria-invalid]'))
      input.removeAttribute('aria-invalid');
  }
  for (const control of controls) control.disabled = true;
  const states = {
    'create-form': 'Creating…',
    'upload-form': 'Uploading…',
    'image-form': 'Uploading…',
    'destination-form': 'Saving address…',
    'login-email-form': 'Requesting code…',
    'login-code-form': 'Signing in…',
  };
  const waiting =
    element.id === 'resend-login'
      ? 'Requesting code…'
      : element.id === 'example-button'
        ? 'Loading example…'
        : states[form?.id] || (/Send/.test(original) ? 'Sending…' : 'Working…');
  label.textContent = waiting;
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
    if (form?.id === 'destination-form' && ['KINDLE_ADDRESS', 'READER_LABEL'].includes(e.code)) {
      const field = $(e.code === 'KINDLE_ADDRESS' ? 'kindle-email' : 'reader-label');
      field.setAttribute('aria-invalid', 'true');
      field.setAttribute(
        'aria-describedby',
        `${field.id === 'kindle-email' ? 'kindle-email-help ' : ''}${feedback.id}`,
      );
    }
    feedback.focus();
  } finally {
    if (form) form.setAttribute('aria-busy', 'false');
    for (const control of controls) control.disabled = false;
    if (form?.id === 'destination-form') setSetupReturn(setupReturn);
    else if (label.textContent === waiting) label.textContent = original;
    if (element.classList.contains('send-action')) updateSendTargets();
  }
}
function setSetupReturn(context) {
  setupReturn = context;
  $('setup-return').hidden = !context;
  $('setup-return-filename').textContent = context?.filename || '';
  const save = $('destination-form').querySelector('button[type="submit"]');
  save.textContent =
    $('destination-form').getAttribute('aria-busy') === 'true'
      ? 'Saving address…'
      : context
        ? 'Save and return'
        : 'Save';
  save.classList.toggle('secondary', !context);
}
function returnToFile(saved = false) {
  const context = setupReturn;
  if (!context) return;
  navigateStudio(context.hash);
  const trigger = [...$(context.target).querySelectorAll('.share-trigger')].find(
    (button) => button.dataset.artifactId === context.artifactId,
  );
  if (saved && trigger) {
    trigger.click();
    feedback($('share-content'), 'Address saved.');
    $('share-send').focus();
  } else (trigger || $('studio-title')).focus();
}
$('return-to-file').addEventListener('click', () => returnToFile());
function chosenReader() {
  return currentAccount?.destinations.find((d) => d.id === selectedReaderId);
}
function sendActionText() {
  const reader = chosenReader();
  return reader
    ? 'Send'
    : currentAccount?.destinations.length
      ? 'Choose Kindle'
      : 'Add Kindle address';
}

function shareButton(artifact) {
  const trigger = viewButton('More share options', 'share', () => {
    openShare(artifact, trigger);
  });
  trigger.classList.add('share-trigger');
  trigger.dataset.artifactId = artifact.artifactId;
  return trigger;
}
function openShare(artifact, trigger) {
  shareContext = {
    artifactId: artifact.artifactId,
    filename: artifact.filename,
    target: trigger.closest('.result')?.id || 'shelf',
    hash: $('upload-panel').hidden ? '#create-panel' : '#upload-panel',
  };
  $('share-filename').textContent = artifact.filename;
  $('share-send').dataset.artifactId = artifact.artifactId;
  $('share-content').querySelector('.action-feedback')?.remove();
  syncReaderChoices();
  updateSendTargets();
  $('share-dialog').showModal();
  (currentAccount?.destinations.length > 1 ? $('send-reader') : $('share-send')).focus();
}
$('share-dialog').addEventListener('close', () => {
  if (!$('share-dialog').open) shareContext = null;
});
$('share-send').addEventListener('click', (event) =>
  busy(event.currentTarget, async () => {
    const context = shareContext;
    if (!context) return;
    if (!chosenReader()) {
      if (currentAccount?.destinations.length) $('send-reader').focus();
      else {
        $('share-dialog').close();
        setSetupReturn(context);
        navigateStudio('#studio-settings');
        $('kindle-email').focus();
      }
      return;
    }
    await send(context.artifactId);
    if (shareContext === context) {
      $('share-dialog').close();
      if (!$('workbench').hidden) $('receipt').querySelector('.receipt-state').focus();
    }
  }),
);
function syncReaderChoices() {
  const destinations = currentAccount?.destinations || [];
  for (const select of document.querySelectorAll('select[data-reader-choice]')) {
    select.replaceChildren(new Option('Choose a Kindle', ''));
    for (const d of destinations) select.append(new Option(`${d.label} · ${d.email}`, d.id));
    select.value = selectedReaderId;
    const picker = select.closest('.reader-picker');
    if (picker)
      picker.hidden = !destinations.length || (destinations.length === 1 && !!chosenReader());
  }
}
function updateSendTargets() {
  const d = chosenReader();
  for (const target of document.querySelectorAll('.send-target')) {
    target.textContent = d?.email || '';
    const picker = target.closest('.result-send')?.querySelector('.reader-picker');
    target.hidden = !d || (!!picker && !picker.hidden);
  }
  for (const b of document.querySelectorAll('.send-action')) {
    b.disabled = !!sendingArtifactId;
    (b.querySelector('.btn-label') || b).textContent =
      b.dataset.artifactId === sendingArtifactId ? 'Sending…' : sendActionText();
  }
  for (const control of document.querySelectorAll('select[data-reader-choice],.share-trigger'))
    control.disabled = !!sendingArtifactId;
}
function artifactFeedback(artifactId, message, state = 'draft') {
  for (const result of document.querySelectorAll('.result[data-artifact-id]'))
    if (result.dataset.artifactId === artifactId) {
      const status = result.querySelector('.artifact-status');
      status.textContent = message;
      status.dataset.state = state;
    }
}
function showReceipt(receipt) {
  receiptId = receipt.deliveryId;
  $('receipt-panel').hidden = false;
  const box = $('receipt');
  box.replaceChildren();
  const state = document.createElement('h2');
  state.className = 'receipt-state';
  state.dataset.state = receipt.state;
  state.textContent =
    {
      submitted: 'Email submitted',
      submitting: 'Submitting email…',
      rejected: 'Email not accepted',
      unknown: 'Email status unknown',
    }[receipt.state] || receipt.state;
  const message = document.createElement('p');
  message.textContent =
    {
      submitted: 'Amazon import and device receipt not confirmed.',
      submitting: 'Do not resend while pending.',
      rejected: 'Not retried automatically.',
      unknown: 'No second copy sent. Refresh before resending.',
    }[receipt.state] || receipt.message;
  const recipient = document.createElement('p');
  const target = currentAccount?.destinations.find((d) => d.id === receipt.destinationId);
  const file = currentAccount?.artifacts.find((a) => a.artifactId === receipt.artifactId);
  recipient.textContent = `${file?.filename || 'Document'} → ${target?.email || receipt.destination || 'Selected Kindle'}`;
  box.append(state, recipient, message);
  artifactFeedback(receipt.artifactId, state.textContent, receipt.state);
  state.tabIndex = -1;
  state.focus();
}
async function send(artifactId) {
  if (sendingArtifactId) return;
  const destinationId = chosenReader()?.id;
  if (!destinationId) throw new Error('Choose a Kindle address.');
  sendingArtifactId = artifactId;
  artifactFeedback(artifactId, 'Sending…', 'submitting');
  updateSendTargets();
  try {
    const receipt = await post('/api/send', { artifactId, destinationId });
    showReceipt(receipt);
    await refresh();
  } catch (error) {
    artifactFeedback(artifactId, 'Submission not confirmed.', 'unknown');
    throw error;
  } finally {
    sendingArtifactId = '';
    updateSendTargets();
  }
}
function showEditor(target, editing) {
  $(target === 'created' ? 'create-editor' : 'upload-editor').hidden = !editing;
  $(target).hidden = editing;
  $(`back-${target}`).hidden = !$(target).hasChildNodes();
  if (editing) $(target === 'created' ? 'title' : 'original').focus();
}
function removeResult(artifactId) {
  for (const target of ['created', 'uploaded']) {
    const box = $(target);
    if (box.dataset.artifactId !== artifactId) continue;
    box.replaceChildren();
    delete box.dataset.artifactId;
    box.hidden = true;
    $(target === 'created' ? 'create-editor' : 'upload-editor').hidden = false;
    $(`back-${target}`).hidden = true;
  }
}
function openFileInfo(artifact) {
  const content = $('file-info-content');
  const filename = document.createElement('p');
  filename.className = 'dialog-filename';
  filename.textContent = artifact.filename;
  const kind = document.createElement('p');
  kind.textContent = artifact.generated ? 'Generated EPUB' : 'Original unchanged';
  const hash = document.createElement('code');
  hash.className = 'hash';
  hash.textContent = `SHA-256 ${artifact.sha256}`;
  content.replaceChildren(filename, kind, hash);
  if (artifact.sourceUrl) content.append(link('Source manuscript', artifact.sourceUrl));
  $('file-info-dialog').showModal();
}
function showArtifact(target, artifact) {
  const box = $(target);
  box.dataset.artifactId = artifact.artifactId;
  box.replaceChildren();
  const header = document.createElement('header');
  header.className = 'result-header';
  const topline = document.createElement('div');
  topline.className = 'artifact-topline';
  const kind = document.createElement('span');
  kind.className = 'file-kind';
  const extension = artifact.filename.toLowerCase().endsWith('.pdf') ? 'PDF' : 'EPUB';
  kind.append(icon('file'), document.createTextNode(extension));
  const status = document.createElement('span');
  status.className = 'artifact-status';
  status.dataset.state = 'draft';
  status.setAttribute('role', 'status');
  status.textContent = 'Not sent';
  topline.append(kind, status);
  const titleField = document.createElement('div');
  titleField.className = 'title-field result-title-field';
  const title = document.createElement('input');
  title.className = 'result-name';
  title.readOnly = true;
  title.value = target === 'created' ? $('title').value.trim() : artifact.filename;
  title.title = artifact.filename;
  title.setAttribute('aria-label', target === 'created' ? 'Book title' : 'File name');
  const edit = viewButton(target === 'created' ? 'Edit manuscript' : 'Change file', 'edit', () => {
    showEditor(target, true);
    if (target === 'created') $('title').select();
  });
  titleField.append(title, edit);
  const actions = document.createElement('div');
  actions.className = 'actions result-actions';
  const download = link('Download', artifact.downloadUrl);
  download.className = 'button';
  decorate(download, 'download');
  const transfers = document.createElement('div');
  transfers.className = 'file-transfers';
  transfers.append(download);
  if (artifact.previewUrl) {
    const preview = link('Preview', artifact.previewUrl);
    preview.className = 'button secondary';
    decorate(preview, 'preview', true);
    transfers.append(preview);
  }
  actions.append(transfers);
  if (artifact.emailEligible) {
    const sharing = document.createElement('div');
    sharing.className = 'share-zone';
    sharing.append(shareButton(artifact));
    actions.append(sharing);
  }
  const footer = document.createElement('footer');
  footer.className = 'artifact-footer';
  const size = document.createElement('span');
  size.textContent = fileSize(artifact.bytes);
  const facts = document.createElement('div');
  facts.className = 'file-facts';
  facts.append(size, expiryTime(artifact.expiresAt));
  footer.append(
    facts,
    viewButton('File information', 'info', () => openFileInfo(artifact)),
  );
  header.append(topline, titleField);
  box.append(header, actions, footer);
  showEditor(target, false);
  title.focus();
  if (!artifact.emailEligible) feedback(box, 'Download only — too large for email.');
  for (const warning of artifact.warnings || []) {
    const note = document.createElement('p');
    note.className = 'field-help';
    note.textContent = warning;
    box.insertBefore(note, footer);
  }
}
function showShelf(artifacts) {
  const shelf = $('shelf');
  $('files-panel').hidden = artifacts.length === 0;
  $('files-heading').textContent = `Files (${artifacts.length})`;
  shelf.hidden = false;
  shelf.replaceChildren();
  for (const a of artifacts) {
    const item = document.createElement('article');
    item.className = 'shelf-item';
    item.setAttribute('aria-label', a.filename);
    const title = document.createElement('strong');
    title.textContent = a.filename;
    const info = document.createElement('small');
    info.textContent = `${fileSize(a.bytes)} · `;
    info.append(expiryTime(a.expiresAt));
    const links = document.createElement('div');
    links.className = 'shelf-links';
    const download = link('Download', a.downloadUrl);
    decorate(download, 'download');
    links.append(download);
    if (a.previewUrl) {
      const preview = link('Preview', a.previewUrl);
      decorate(preview, 'preview', true);
      links.append(preview);
    }
    if (a.emailEligible) links.append(shareButton(a));
    const remove = button(
      'Delete',
      async () => {
        await api(`/api/files/${a.artifactId}`, { method: 'DELETE' });
        removeResult(a.artifactId);
        await refresh();
        ($('shelf').querySelector('a,button') || $('studio-title')).focus();
      },
      'plain-button',
    );
    decorate(remove, 'trash', true, `Delete ${a.filename}`);
    remove.classList.add('delete-trigger');
    links.append(remove);
    item.append(title, info, links);
    shelf.append(item);
  }
}
function showImageAssets(images) {
  const imageAssets = $('image-assets');
  imageAssets.replaceChildren();
  if (!images.length) return;
  const list = document.createElement('ul');
  list.className = 'field-help image-ids';
  for (const [index, image] of images.entries()) {
    const item = document.createElement('li');
    const description = document.createElement('span');
    description.textContent = `Image ${index + 1}`;
    description.title = `Expires ${new Date(image.expiresAt).toLocaleString()}`;
    const status = document.createElement('span');
    status.setAttribute('role', 'status');
    const copy = button(
      'Copy ID',
      async () => {
        try {
          await navigator.clipboard.writeText(image.artifactId);
          status.textContent = 'Copied.';
        } catch {
          description.textContent = image.artifactId;
          throw new Error('Copy unavailable. Select the ID.');
        }
      },
      'plain-button',
    );
    copy.setAttribute('aria-label', `Copy ID for image ${index + 1}`);
    item.append(description, copy, status);
    list.append(item);
  }
  imageAssets.append(list);
}
function showReaders(destinations) {
  $('destination-status').textContent = destinations.length
    ? `${destinations.length} / 5 saved`
    : 'No addresses yet.';
  const full = destinations.length >= 5;
  $('destination-form').hidden = full;
  $('reader-limit').hidden = !full;
  const list = $('reader-list');
  list.replaceChildren();
  for (const d of destinations) {
    const row = document.createElement('div');
    row.className = 'reader-item';
    const name = document.createElement('strong');
    name.textContent = d.label;
    const address = document.createElement('p');
    address.textContent = d.email + (d.isDefault ? ' · Default' : '');
    row.append(name, address);
    if (!d.isDefault) {
      const makeDefault = button(
        'Make default',
        async () => {
          await post(`/api/destinations/${d.id}/default`, {});
          await refresh();
        },
        'plain-button',
      );
      makeDefault.setAttribute('aria-label', `Make ${d.label} the default address`);
      row.append(makeDefault);
    }
    const removeAddress = button(
      'Remove',
      async () => {
        await api(`/api/destinations/${d.id}`, { method: 'DELETE' });
        await refresh();
      },
      'plain-button',
    );
    removeAddress.setAttribute('aria-label', `Remove ${d.label}`);
    row.append(removeAddress);
    list.append(row);
  }
}
function showAccount(account) {
  currentAccount = account;
  document.body.classList.add('signed-in');
  document.body.classList.remove('signed-out');
  $('signin').hidden = true;
  $('desk').hidden = false;
  $('logout').hidden = false;
  $('account-name').textContent = account.name;
  $('sender-address').textContent = account.sender;
  if (!account.destinations.some((d) => d.id === selectedReaderId))
    selectedReaderId = account.defaultDestinationId || '';
  const limits = account.limits;
  $('allowance').textContent = limits
    ? `${limits.renders} books · ${limits.uploads} uploads · ${limits.sends} emails / day. Files expire after ${limits.retentionHours}h.`
    : '';
  showReaders(account.destinations);
  showShelf(account.artifacts.filter((artifact) => artifact.kind === 'document'));
  showImageAssets(account.artifacts.filter((artifact) => artifact.kind === 'image'));
  syncReaderChoices();
  updateSendTargets();
}
function showSignedOut() {
  document.body.classList.add('signed-out');
  document.body.classList.remove('signed-in');
  $('signin').hidden = false;
  $('desk').hidden = true;
  $('logout').hidden = true;
  $('image-result').hidden = true;
  $('image-result').textContent = '';
  $('image-assets').replaceChildren();
  $('image-form').reset();
  // Clear the previous account's private files and addresses from the page.
  for (const id of ['created', 'uploaded', 'shelf', 'reader-list']) {
    $(id).replaceChildren();
    $(id).hidden = true;
    delete $(id).dataset.artifactId;
  }
  $('receipt').replaceChildren();
  $('receipt-panel').hidden = true;
  $('share-dialog').close();
  $('file-info-dialog').close();
  $('share-filename').textContent = '';
  $('file-info-content').replaceChildren();
  shareContext = null;
  $('send-reader').replaceChildren();
  $('destination-status').textContent = '';
  $('sender-address').textContent = '';
  $('account-name').textContent = '';
  currentAccount = null;
  selectedReaderId = '';
  receiptId = null;
  setSetupReturn(null);
}
async function refresh() {
  try {
    showAccount(await api('/api/account'));
  } catch (error) {
    if (error.status === 401) showSignedOut();
    else feedback($('desk'), error.message, true);
  }
}
function chooseTask(hash) {
  const upload = hash === '#upload-panel';
  const settings = hash === '#studio-settings';
  if (!settings) setSetupReturn(null);
  $('studio-title').textContent = settings ? 'settings' : 'studio';
  $('workbench').hidden = settings;
  $('studio-settings').hidden = !settings;
  $('create-panel').hidden = upload;
  $('upload-panel').hidden = !upload;
  for (const a of document.querySelectorAll('a[data-studio-view]')) {
    if (a.hash === (settings ? '#studio-settings' : upload ? '#upload-panel' : '#create-panel'))
      a.setAttribute('aria-current', 'true');
    else a.removeAttribute('aria-current');
  }
}
function navigateStudio(hash) {
  history.replaceState(null, '', hash);
  chooseTask(hash);
}
for (const a of document.querySelectorAll('a[data-studio-view]'))
  a.addEventListener('click', (event) => {
    event.preventDefault();
    navigateStudio(a.hash);
    if (settingsMenu.contains(a)) {
      settingsMenu.open = false;
      $('studio-title').focus();
    }
  });
addEventListener('hashchange', () => {
  if (['#create-panel', '#upload-panel', '#studio-settings'].includes(location.hash))
    chooseTask(location.hash);
});
chooseTask(location.hash);
for (const target of ['created', 'uploaded'])
  $(`back-${target}`).addEventListener('click', () => {
    showEditor(target, false);
    $(target).querySelector('.result-name').focus();
  });
const originalInput = $('original');
const fileDrop = originalInput.closest('.file-drop');
function originalError(message) {
  originalInput.setCustomValidity(message);
  originalInput.setAttribute('aria-invalid', String(!!message));
  $('file-error').textContent = message;
  $('file-error').hidden = !message;
  fileDrop.classList.toggle('has-error', !!message);
}
originalInput.addEventListener('change', () => {
  const files = originalInput.files;
  const file = files[0];
  $('file-name').textContent =
    files.length > 1 ? `${files.length} files` : file?.name || 'Drop an EPUB or PDF';
  $('file-info').textContent = file
    ? `${fileSize(file.size)} · change file`
    : 'or choose · 20 MiB max';
  originalError(
    files.length > 1
      ? 'One EPUB or PDF at a time.'
      : file &&
          !/\.(epub|pdf)$/i.test(file.name) &&
          !['application/epub+zip', 'application/pdf'].includes(file.type)
        ? 'Choose EPUB or PDF.'
        : file?.size > 20 * 1024 * 1024
          ? 'Over 20 MiB. Choose a smaller file.'
          : file?.size === 0
            ? 'Empty file. Choose another.'
            : '',
  );
});
originalInput.addEventListener('invalid', () => {
  if (!originalInput.files.length) originalError('Choose an EPUB or PDF first.');
});
for (const type of ['dragenter', 'dragover'])
  fileDrop.addEventListener(type, (event) => {
    if (!event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    if (originalInput.disabled) {
      event.dataTransfer.dropEffect = 'none';
      return;
    }
    event.dataTransfer.dropEffect = 'copy';
    fileDrop.classList.add('is-dragging');
  });
fileDrop.addEventListener('dragleave', (event) => {
  if (!fileDrop.contains(event.relatedTarget)) fileDrop.classList.remove('is-dragging');
});
fileDrop.addEventListener('drop', (event) => {
  event.preventDefault();
  fileDrop.classList.remove('is-dragging');
  if (originalInput.disabled || !event.dataTransfer.files.length) return;
  originalInput.files = event.dataTransfer.files;
  originalInput.dispatchEvent(new Event('change'));
});
const MANUSCRIPT_LIMIT = 50000;
const manuscriptCount = $('manuscript-count');
const updateManuscriptCount = () => {
  const used = $('manuscript').value.length;
  manuscriptCount.hidden = used < MANUSCRIPT_LIMIT * 0.9;
  manuscriptCount.textContent = `${used.toLocaleString()} / ${MANUSCRIPT_LIMIT.toLocaleString()} characters`;
};
$('manuscript').addEventListener('input', updateManuscriptCount);
updateManuscriptCount();

$('figure-image').addEventListener('change', () => {
  $('image-result').hidden = true;
  $('image-result').textContent = '';
});
$('create-form').addEventListener(
  'invalid',
  (event) => {
    const details = event.target.closest('details');
    if (details) details.open = true;
  },
  true,
);
$('create-form').addEventListener('submit', (event) => {
  event.preventDefault();
  busy(event.submitter, async () => {
    const markdown = $('manuscript').value;
    const heading = /^\s{0,3}#{1,3}\s+(.+)$/m.exec(markdown)?.[1]?.trim();
    const body = {
      title: $('title').value.trim(),
      language: $('language').value,
      chapters: [{ title: heading || $('title').value.trim() || 'Reading edition', markdown }],
    };
    if ($('creator').value.trim()) body.creator = $('creator').value.trim();
    if (example) {
      const originalText = example.chapters
        .map((c) => `# ${c.title}\n\n${c.markdown}`)
        .join('\n\n');
      if ($('manuscript').value === originalText) body.chapters = example.chapters;
      body.figures = example.figures
        .filter((f) => $('manuscript').value.includes(`figure:${f.id}`))
        .map((f) => ({ ...f }));
      for (const figure of body.figures) {
        if (figure.kind === 'image' && figure.assetId === '00000000-0000-4000-8000-000000000001') {
          if (!example.assetId) {
            const illustration = await fetch('/images/sample-exposure.png');
            if (!illustration.ok) throw new Error('The example illustration could not be loaded.');
            const uploaded = await api('/api/files?kind=image', {
              method: 'POST',
              headers: { 'Content-Type': 'image/png', 'X-Filename': 'sample-exposure.png' },
              body: await illustration.blob(),
            });
            example.assetId = uploaded.artifactId;
          }
          figure.assetId = example.assetId;
        }
      }
      body.sources = example.sources;
      body.subtitle = example.subtitle;
    }
    const artifact = await post('/api/books', body);
    showArtifact('created', artifact);
    await refresh();
  });
});
$('example-button').addEventListener('click', (event) =>
  busy(event.currentTarget, async () => {
    if (
      ($('title').value.trim() || $('creator').value.trim() || $('manuscript').value.trim()) &&
      !window.confirm('Replace this draft with the example?')
    )
      return;
    const response = await fetch('/example.json');
    if (!response.ok) throw new Error('The example could not be loaded.');
    example = await response.json();
    $('title').value = example.title;
    $('creator').value = example.creator || '';
    $('manuscript').value = example.chapters
      .map((c) => `# ${c.title}\n\n${c.markdown}`)
      .join('\n\n');
    $('example-status').hidden = false;
  }),
);
$('remove-example').addEventListener('click', () => {
  example = null;
  $('example-status').hidden = true;
  feedback($('create-form'), 'Figures and sources removed. Delete any figure: references.');
});
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
    await refresh();
  });
});
$('image-form').addEventListener('submit', (event) => {
  event.preventDefault();
  busy(event.submitter, async () => {
    const file = $('figure-image').files[0];
    if (!file) throw new Error('Choose an image first.');
    const artifact = await api('/api/files?kind=image', {
      method: 'POST',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    });
    await refresh();
    if ($('desk').hidden) return;
    showImageAssets([
      artifact,
      ...currentAccount.artifacts.filter(
        (item) => item.kind === 'image' && item.artifactId !== artifact.artifactId,
      ),
    ]);
    $('image-result').textContent = 'Uploaded.';
    $('image-result').hidden = false;
  });
});
$('destination-form').addEventListener('submit', (event) => {
  event.preventDefault();
  busy(event.submitter, async () => {
    const returning = setupReturn;
    const saved = await post('/api/destinations', {
      email: $('kindle-email').value,
      label: $('reader-label').value.trim() || 'My Kindle',
    });
    if (returning) selectedReaderId = saved.id;
    $('kindle-email').value = '';
    $('reader-label').value = '';
    await refresh();
    const feedback = $('destination-form').querySelector('.action-feedback');
    feedback.textContent = 'Saved.';
    feedback.className = 'action-feedback';
    feedback.setAttribute('role', 'status');
    if (returning && setupReturn === returning && chosenReader()?.id === saved.id)
      returnToFile(true);
  });
});
$('refresh-receipt').addEventListener('click', (event) =>
  busy(event.currentTarget, async () => {
    if (receiptId) showReceipt(await api(`/api/deliveries/${receiptId}`));
  }),
);
$('mcp-url').textContent = `${location.origin}/mcp`;
$('copy-sender').addEventListener('click', (event) =>
  busy(event.currentTarget, async () => {
    try {
      await navigator.clipboard.writeText(currentAccount.sender);
      $('copy-sender-status').textContent = 'Copied.';
    } catch {
      throw new Error('Copy unavailable. Select the sender.');
    }
  }),
);
$('copy-mcp').addEventListener('click', (event) =>
  busy(event.currentTarget, async () => {
    try {
      await navigator.clipboard.writeText(`${location.origin}/mcp`);
    } catch {
      throw new Error('Copy unavailable. Select the address.');
    }
    feedback($('connect-agent'), 'Copied.');
  }),
);
document.addEventListener('change', (event) => {
  if (event.target.matches('select[data-reader-choice]')) {
    selectedReaderId = event.target.value;
    syncReaderChoices();
    updateSendTargets();
  }
});
async function requestLogin() {
  const email = $('login-email').value.trim();
  if (/@(?:free\.)?kindle\.com$/i.test(email)) throw new Error('Use your inbox email to sign in.');
  await post('/auth/email-otp/send-verification-otp', { email, type: 'sign-in' });
  $('login-code').value = '';
  $('login-sent').textContent = `Code requested for ${email}.`;
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
