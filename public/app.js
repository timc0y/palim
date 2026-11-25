import { enableMenu } from './menu.js';
const $ = (id) => document.getElementById(id);
let pendingDraft = null;
let currentAccount = null,
  receiptId = null,
  selectedReaderId = '',
  setupReturn = null,
  sendingArtifactId = '',
  shareContext = null;
/** The feedback slot for an area, created on demand. */
function feedbackFor(area) {
  if (!area) return null;
  if (area.classList.contains('token-actions')) return $('token-status');
  let box = area.querySelector(
    area.id === 'destination-form' ? '.action-feedback' : ':scope > .action-feedback',
  );
  if (!box) {
    box = document.createElement('p');
    box.className = 'action-feedback';
    box.tabIndex = -1;
    if (area.id === 'login-code-form' || area.id === 'login-email-form')
      area.querySelector('button[type=submit]').before(box);
    else if (area.id === 'share-content') $('share-send').before(box);
    else if (area.id === 'files-panel') $('shelf').before(box);
    else if (area.classList.contains('result'))
      area.insertBefore(box, area.querySelector('.actions'));
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
    throw Object.assign(new Error('Connection failed. Check your network.'), {
      code: 'NETWORK_ERROR',
    });
  }
  if (response.status === 401 && currentAccount && path.startsWith('/api/')) {
    const draftFields = ['title', 'manuscript', 'creator', 'language'].map($);
    if (draftFields.some((field) => field.value !== field.defaultValue)) {
      pendingDraft = {
        owner: currentAccount.id,
        fields: draftFields.map((field) => [field.id, field.value]),
      };
    }
    showSignedOut();
    feedback(
      $('signin'),
      pendingDraft
        ? 'Your session ended. Sign back into the same account in this tab to recover your draft.'
        : 'Your session ended. Sign in again.',
    );
    $('login-email').focus();
  }
  if (path === '/auth/sign-in/email-otp' && [400, 401].includes(response.status))
    throw Object.assign(new Error('Check the code. If it has expired, use Resend code.'), {
      status: response.status,
    });
  let data;
  try {
    data = await response.json();
  } catch {
    throw Object.assign(new Error('Unreadable server response.'), {
      code: 'UNREADABLE_RESPONSE',
      status: response.status,
    });
  }
  if (!response.ok)
    throw Object.assign(new Error(data.message || 'Palim could not complete that action.'), {
      status: response.status,
      code: data.code,
    });
  return data;
}
const post = (path, value) =>
  api(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  });
function fileSize(bytes) {
  if (bytes < 1024) return `${bytes} ${bytes === 1 ? 'byte' : 'bytes'}`;
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
    : `${(bytes / 1024).toFixed(1)} KiB`;
}
function updateDailyReset() {
  const reset = new Date();
  reset.setUTCHours(24, 0, 0, 0);
  $('daily-reset').dateTime = reset.toISOString();
  $('daily-reset').textContent = reset.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
  $('daily-reset').title = reset.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
  return $('daily-reset');
}
document.querySelector('.limits').addEventListener('toggle', (event) => {
  if (event.currentTarget.open) updateDailyReset();
});
let expiryTimer;
let nextExpiry = Infinity;
function scheduleExpiry(timestamp) {
  if (timestamp >= nextExpiry) return;
  clearTimeout(expiryTimer);
  nextExpiry = timestamp;
  expiryTimer = setTimeout(
    () => {
      nextExpiry = Infinity;
      for (const time of document.querySelectorAll('time[data-expiry]')) {
        const expires = Date.parse(time.dateTime);
        if (expires <= Date.now()) time.textContent = 'Expired ' + time.dataset.expiry;
        else scheduleExpiry(expires);
      }
    },
    Math.max(0, timestamp - Date.now()),
  );
}
function expiryTime(value, detailed = false) {
  const date = new Date(value);
  const time = document.createElement('time');
  time.dateTime = date.toISOString();
  time.title = date.toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'long' });
  const year = detailed || date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined;
  time.dataset.expiry = date.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year,
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: detailed ? 'short' : undefined,
  });
  const expired = date.getTime() <= Date.now();
  time.textContent = (expired ? 'Expired ' : 'Expires ') + time.dataset.expiry;
  if (!expired) scheduleExpiry(date.getTime());
  return time;
}
function link(label, href, filename) {
  const a = document.createElement('a');
  a.textContent = label;
  a.href = href;
  a.rel = 'noopener noreferrer';
  if (label === 'Preview') a.target = '_blank';
  if (filename)
    a.setAttribute(
      'aria-label',
      `${label} ${filename}${a.target === '_blank' ? ' (opens in a new tab)' : ''}`,
    );
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
function clearFieldFeedback(field, feedbackId) {
  field.removeAttribute('aria-invalid');
  const descriptions = field.getAttribute('aria-describedby')?.split(/\s+/);
  if (descriptions?.includes(feedbackId)) {
    const help = descriptions.filter((id) => id !== feedbackId).join(' ');
    if (help) field.setAttribute('aria-describedby', help);
    else field.removeAttribute('aria-describedby');
  }
}
async function busy(element, work) {
  const label = element.querySelector('.btn-label') || element;
  const original = label.textContent;
  const form = element.closest('form'),
    area = form || element.closest('.shelf-item,.reader-item,.grant-item') || element.parentElement;
  if (form?.getAttribute('aria-busy') === 'true') return;
  let controls = [element];
  if (form)
    controls = [...form.elements].filter((control) => 'disabled' in control && !control.disabled);
  else if (area.classList.contains('reader-item'))
    controls = [...area.querySelectorAll('button:enabled')];
  const feedback = feedbackFor(area);
  const checkingAddresses = area.classList.contains('reader-item') && feedback.contains(element);
  if (!checkingAddresses) feedback.textContent = '';
  if (form) {
    feedback.id = `${form.id}-feedback`;
    form.setAttribute('aria-describedby', feedback.id);
    form.setAttribute('aria-busy', 'true');
    for (const input of form.querySelectorAll('[aria-invalid]'))
      clearFieldFeedback(input, feedback.id);
  }
  for (const control of controls) control.disabled = true;
  const states = {
    'refresh-receipt': 'Checking email status…',
    'create-token': 'Checking token status…',
    'retry-startup': 'Retrying…',
    'delete-account': 'Deleting account…',
    'create-form': 'Creating…',
    'upload-form': 'Uploading…',
    'destination-form': 'Saving address…',
    'login-email-form': 'Requesting code…',
    'login-code-form': 'Signing in…',
  };
  const waiting =
    element.id === 'resend-login'
      ? 'Requesting code…'
      : element.dataset.pendingLabel ||
        states[element.id] ||
        states[form?.id] ||
        (/Send/.test(original) ? 'Sending…' : 'Working…');
  label.textContent = waiting;
  const actionName = element.getAttribute('aria-label');
  if (element.dataset.pendingLabel && actionName?.startsWith(original))
    element.setAttribute('aria-label', waiting + actionName.slice(original.length));
  let invalidField;
  try {
    await work();
    return true;
  } catch (e) {
    feedback.dataset.code = e.code || '';
    const unconfirmed = ['NETWORK_ERROR', 'UNREADABLE_RESPONSE'].includes(e.code);
    feedback.textContent =
      element.id === 'resend-login' && unconfirmed
        ? 'Check your inbox before requesting another code. The new code may already be on its way.'
        : e.message;
    if (['upload-form', 'create-form'].includes(form?.id) && unconfirmed) {
      const shelfLink = link('Check your Shelf', '/app#files-panel');
      shelfLink.target = '_blank';
      shelfLink.setAttribute('aria-label', 'Check your Shelf (opens in a new tab)');
      const message =
        form.id === 'create-form'
          ? 'Couldn’t confirm EPUB creation.'
          : 'Couldn’t confirm the upload.';
      feedback.replaceChildren(message + ' ', shelfLink, ' before trying again.');
    }
    if (element.id === 'share-send' && e.code === 'ARTIFACT_NOT_FOUND' && shareContext) {
      const expiredId = shareContext.artifactId;
      if (shareContext.target === 'shelf')
        shareContext.removedIndex = [...$('shelf').children].indexOf(
          $('shelf-title-' + expiredId)?.closest('article'),
        );
      currentAccount.artifacts = currentAccount.artifacts.filter(
        (file) => file.artifactId !== expiredId,
      );
      showShelf(currentAccount.artifacts.filter((file) => file.kind === 'document'));
      const book = shareContext.generated;
      feedback.textContent = `This ${book ? 'book' : 'file'} is no longer on your Shelf. No new email was sent.`;
      if (!book || $('created').dataset.artifactId === expiredId) {
        const panel = book ? '#create-panel' : '#upload-panel';
        const recover = link(
          book ? 'Return to manuscript' : 'Upload the original file again',
          panel,
        );
        recover.addEventListener('click', (event) => {
          event.preventDefault();
          $('share-dialog').close();
          removeResult(expiredId);
          navigateStudio(panel);
          showEditor(book ? 'created' : 'uploaded', true);
        });
        feedback.append(' ', recover, '.');
      }
    }
    if (element.classList.contains('delete-trigger') && unconfirmed)
      feedback.textContent =
        'Couldn’t confirm deletion. Reload your Shelf to see whether the file is still there.';
    if (element.id === 'delete-account' && unconfirmed)
      feedback.textContent =
        'Couldn’t confirm account deletion. Reload Settings to check whether you still have access.';
    if (area?.classList.contains('reader-item') && unconfirmed) {
      const check = button(
        'Check saved addresses',
        async () => {
          showAccount(await api('/api/account'));
          if (!$('studio-settings').hidden && document.activeElement === document.body)
            ($(area.id) || $('destination-status')).focus();
        },
        'plain-button',
      );
      check.dataset.pendingLabel = 'Checking…';
      feedback.replaceChildren(
        checkingAddresses
          ? 'Couldn’t load your saved addresses. '
          : 'Couldn’t confirm the change. ',
        check,
      );
    }
    if (area?.classList.contains('grant-item') && unconfirmed) {
      const check = link('Check connected applications', '/app#oauth-grants');
      check.target = '_blank';
      check.setAttribute('aria-label', 'Check connected applications (opens in a new tab)');
      feedback.replaceChildren('Couldn’t confirm disconnection. ', check, '.');
    }
    if (element.id === 'refresh-receipt' && unconfirmed)
      feedback.textContent = 'Couldn’t update email status. Check again in a moment.';
    if (e.code === 'DAILY_LIMIT' && ['create-form', 'upload-form'].includes(form?.id)) {
      const activity = form.id === 'create-form' ? 'book creation' : 'upload';
      feedback.textContent = `Daily ${activity} limit reached. Try again after ${updateDailyReset().title}.`;
      if ($('shelf').querySelector('.shelf-item')) {
        const shelfLink = document.createElement('a');
        shelfLink.href = '#files-panel';
        shelfLink.textContent = 'Shelf';
        feedback.append(' Files on ', shelfLink, ' remain available until they expire.');
      }
    }
    feedback.className = 'action-feedback error';
    feedback.setAttribute('role', 'alert');
    if (form?.id === 'login-email-form' && e.code === 'LOGIN_EMAIL') {
      invalidField = $('login-email');
      invalidField.setAttribute('aria-invalid', 'true');
      invalidField.setAttribute('aria-describedby', feedback.id);
    }
    if (
      form?.id === 'login-code-form' &&
      element.type === 'submit' &&
      [400, 401].includes(e.status)
    ) {
      invalidField = $('login-code');
      invalidField.setAttribute('aria-invalid', 'true');
      $('login-code').setAttribute('aria-describedby', `${feedback.id} login-sent`);
    }
    if (form?.id === 'destination-form' && ['KINDLE_ADDRESS', 'READER_LABEL'].includes(e.code)) {
      const field = $(e.code === 'KINDLE_ADDRESS' ? 'kindle-email' : 'reader-label');
      field.after(feedback);
      invalidField = field;
      field.setAttribute('aria-invalid', 'true');
      field.setAttribute(
        'aria-describedby',
        `${feedback.id}${field.id === 'kindle-email' ? ' kindle-email-help' : ''}`,
      );
    }
    if (
      element.id === 'share-send' &&
      e.code === 'READER_NOT_FOUND' &&
      !$('reader-choice').hidden
    ) {
      invalidField = $('send-reader');
      feedback.id = 'reader-choice-error';
      $('reader-choice').after(feedback);
      invalidField.setAttribute('aria-invalid', 'true');
      invalidField.setAttribute('aria-describedby', feedback.id);
    }
    const focusArea = form || element;
    const focusMoved =
      document.activeElement !== document.body && !focusArea.contains(document.activeElement);
    if (focusMoved) invalidField = null;
    else if (!invalidField) feedback.focus();
  } finally {
    if (element.dataset.pendingLabel && actionName) element.setAttribute('aria-label', actionName);
    if (form) form.setAttribute('aria-busy', 'false');
    for (const control of controls) control.disabled = false;
    invalidField?.focus();
    if (invalidField?.id === 'login-code') invalidField.select();
    if (form?.id === 'destination-form') setSetupReturn(setupReturn);
    else if (label.textContent === waiting) label.textContent = original;
    if (form?.id === 'login-code-form') updateResend();
    if (element.classList.contains('send-action')) updateSendTargets();
  }
}
function setSetupReturn(context) {
  setupReturn = context;
  $('setup-return').hidden = !context;
  $('return-to-file').textContent = context?.target === 'shelf' ? 'Back to Shelf' : 'Back to file';
  renderFilename($('setup-return-filename'), context?.filename || '');
  const save = $('destination-form').querySelector('button[type="submit"]');
  save.textContent =
    $('destination-form').getAttribute('aria-busy') === 'true'
      ? 'Saving address…'
      : context
        ? 'Save and return'
        : 'Save address';
  if (context) save.setAttribute('aria-describedby', 'setup-return-filename');
  else save.removeAttribute('aria-describedby');
  save.classList.toggle('secondary', !context);
}
function returnToFile(saved = false) {
  const context = setupReturn;
  if (!context) return;
  if (saved && !currentAccount.artifacts.some((file) => file.artifactId === context.artifactId)) {
    removeResult(context.artifactId);
    navigateStudio('#files-panel');
    feedback(
      $('files-panel'),
      'Kindle address saved. The file is no longer on your Shelf.',
    ).focus();
    return;
  }
  navigateStudio(context.hash);
  const trigger = [...$(context.target).querySelectorAll('.share-trigger')].find(
    (button) => button.dataset.artifactId === context.artifactId,
  );
  if (saved && trigger) {
    trigger.click();
    const notice = feedback($('share-content'), 'Address saved.');
    if (context.firstAddress) {
      const sender = link('your personal sender', '/app#sender-address');
      sender.target = '_blank';
      sender.setAttribute('aria-label', 'your personal sender (opens in a new tab)');
      notice.append(' Approve ', sender, ' in Amazon before the first send.');
    }
  } else (trigger || $('studio-title')).focus();
}
function focusPersonalSender() {
  $('amazon-steps').open = true;
  $('copy-sender').focus();
}
$('show-personal-sender').addEventListener('click', (event) => {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  if (location.hash !== '#sender-address') return;
  event.preventDefault();
  focusPersonalSender();
});
$('return-to-file').addEventListener('click', () => returnToFile());
function chosenReader() {
  return currentAccount?.destinations.find((d) => d.id === selectedReaderId);
}
function sendActionText() {
  const reader = chosenReader();
  return reader
    ? 'Send'
    : currentAccount?.destinations.length
      ? 'Choose a Kindle'
      : 'Add Kindle address';
}

function shareButton(artifact, displayName = artifact.filename) {
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'secondary share-trigger';
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.textContent = 'Send to Kindle';
  trigger.dataset.displayName = displayName;
  trigger.setAttribute('aria-label', `Send to Kindle, ${displayName}`);
  trigger.dataset.artifactId = artifact.artifactId;
  trigger.addEventListener('click', () => openShare(artifact, trigger, displayName));
  return trigger;
}
function openShare(artifact, trigger, displayName) {
  shareContext = {
    artifactId: artifact.artifactId,
    filename: displayName,
    generated: artifact.generated,
    firstAddress: !currentAccount?.destinations.length,
    target: trigger.closest('.result')?.id || 'shelf',
    hash: location.hash || '#create-panel',
  };
  trigger.closest('.shelf-item,.result')?.querySelector(':scope > [data-send-error]')?.remove();
  renderFilename($('share-filename'), displayName);
  $('share-send').dataset.artifactId = artifact.artifactId;
  $('share-content').querySelector('.action-feedback')?.remove();
  syncReaderChoices();
  updateSendTargets();
  $('share-dialog').showModal();
  if (!$('reader-choice').hidden) $('send-reader').focus();
  else if (chosenReader()) $('share-filename').focus();
  else $('share-send').focus();
}
$('share-dialog').addEventListener('close', () => {
  if ($('share-dialog').open) return;
  if (shareContext?.removedIndex >= 0) focusShelfAfterRemoval(shareContext.removedIndex);
  shareContext = null;
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
        if (context.firstAddress) $('amazon-steps').open = true;
        navigateStudio('#studio-settings');
        $('kindle-email').focus();
      }
      return;
    }
    try {
      await send(context);
    } catch (error) {
      if ($('share-dialog').open) throw error;
      const trigger = [...$(context.target).querySelectorAll('.share-trigger')].find(
        (button) => button.dataset.artifactId === context.artifactId,
      );
      if (trigger && currentAccount) {
        const notice = feedback(trigger.closest('.shelf-item,.result'), error.message, true);
        notice.dataset.sendError = '';
      }
      return;
    }
    if (shareContext === context && $('share-dialog').open) {
      $('share-dialog').close();
      if (!$('workbench').hidden) $('receipt').querySelector('.receipt-state').focus();
    }
  }),
);
function destinationShowsAddress(destination, destinations) {
  return (
    destination.label === destination.email ||
    destinations.some(
      (other) =>
        other.id !== destination.id &&
        other.label.localeCompare(destination.label, undefined, { sensitivity: 'accent' }) === 0,
    )
  );
}
function destinationName(destination, destinations) {
  return destination.label !== destination.email &&
    destinationShowsAddress(destination, destinations)
    ? `${destination.label} · ${destination.email}`
    : destination.label;
}
function syncReaderChoices() {
  const destinations = currentAccount?.destinations || [];
  for (const select of document.querySelectorAll('select[data-reader-choice]')) {
    select.replaceChildren(new Option('Choose a Kindle', ''));
    for (const d of destinations) {
      const name = destinationName(d, destinations);
      select.append(new Option(d.isDefault ? `${name} (default)` : name, d.id));
    }
    select.value = selectedReaderId;
    const picker = select.closest('.reader-picker');
    if (picker)
      picker.hidden = !destinations.length || (destinations.length === 1 && !!chosenReader());
  }
}
function renderAddress(element, address) {
  const domainStart = address.lastIndexOf('@');
  if (domainStart < 0) element.textContent = address;
  else
    element.replaceChildren(
      address.slice(0, domainStart),
      document.createElement('wbr'),
      address.slice(domainStart),
    );
}
function renderRecipient(container, label, email) {
  container.replaceChildren('To ');
  if (label && label !== email) {
    const nickname = document.createElement('bdi');
    nickname.textContent = label;
    container.append(nickname, ' · ');
  }
  const address = document.createElement('bdi');
  renderAddress(address, email);
  container.append(address);
}
function updateSendTargets() {
  const d = chosenReader();
  for (const target of document.querySelectorAll('.send-target')) {
    const showLabel = d && $('reader-choice').hidden && d.label !== d.email;
    if (d) renderRecipient(target, showLabel ? d.label : '', d.email);
    else target.replaceChildren();
    target.hidden = !d;
  }
  const shareEmpty = $('share-empty');
  if (shareEmpty) shareEmpty.hidden = !!(currentAccount?.destinations.length || d);
  $('share-send').setAttribute(
    'aria-describedby',
    d
      ? 'share-filename send-target'
      : shareEmpty.hidden
        ? 'share-filename'
        : 'share-filename share-empty',
  );
  if (d) $('share-filename').setAttribute('aria-describedby', 'send-target');
  else $('share-filename').removeAttribute('aria-describedby');
  const reader = $('send-reader');
  if (!$('reader-choice-error')) reader.removeAttribute('aria-invalid');
  if (d && !destinationShowsAddress(d, currentAccount.destinations))
    reader.setAttribute('aria-describedby', 'send-target');
  else if (!$('reader-choice-error')) reader.removeAttribute('aria-describedby');
  for (const b of document.querySelectorAll('.send-action')) {
    b.disabled = !!sendingArtifactId;
    (b.querySelector('.btn-label') || b).textContent =
      b.dataset.artifactId === sendingArtifactId ? 'Sending…' : sendActionText();
  }
  $('send-reader').disabled = !!sendingArtifactId;
  for (const trigger of document.querySelectorAll('.share-trigger')) {
    trigger.disabled = !!sendingArtifactId;
    const pending = trigger.dataset.artifactId === sendingArtifactId;
    trigger.textContent = pending ? 'Sending…' : 'Send to Kindle';
    trigger.setAttribute(
      'aria-label',
      `${pending ? 'Sending' : 'Send to Kindle'}, ${trigger.dataset.displayName}`,
    );
  }
}
function artifactFeedback(artifactId, message, state = 'draft') {
  for (const result of document.querySelectorAll('.result[data-artifact-id]'))
    if (result.dataset.artifactId === artifactId) {
      const status = result.querySelector('.artifact-status');
      status.textContent = message;
      status.dataset.state = state;
    }
}
function syncReceipt(view = location.hash || '#create-panel') {
  const panel = $('receipt-panel');
  const result = view === '#create-panel' ? $('created') : $('uploaded');
  panel.hidden =
    !receiptId ||
    panel.dataset.view !== view ||
    (view !== '#files-panel' &&
      (result.hidden || result.dataset.artifactId !== panel.dataset.artifactId));
}
function showReceipt(receipt, view, displayName) {
  $('receipt-panel').querySelector('.action-feedback')?.remove();
  $('receipt-panel').dataset.view = view;
  receiptId = receipt.deliveryId;
  $('refresh-receipt').hidden = ['submitted', 'rejected'].includes(receipt.state);
  $('receipt-panel').dataset.artifactId = receipt.artifactId;
  syncReceipt();
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
      unknown: 'Status unknown',
    }[receipt.state] || receipt.state;
  const message = document.createElement('p');
  message.textContent =
    {
      submitted: 'Check your Kindle library to confirm the file arrived.',
      submitting: 'You can check the status without sending another copy.',
      unknown: 'The file may still arrive. Check your Kindle library before sending another copy.',
    }[receipt.state] || receipt.message;
  if (receipt.state === 'rejected') {
    const book = currentAccount?.artifacts.find(
      (a) => a.artifactId === receipt.artifactId && a.generated,
    );
    const amazon = $('file-note').querySelector('a').cloneNode(true);
    message.className = 'receipt-recovery';
    amazon.textContent = book ? 'Upload to Send to Kindle' : 'Upload your file to Amazon';
    amazon.setAttribute('aria-label', amazon.textContent + ' (opens in a new tab)');
    message.replaceChildren(amazon);
    if (book) amazon.before(link('Download the EPUB', book.downloadUrl, book.filename));
  }
  const recipient = document.createElement('p');
  const target = currentAccount?.destinations.find((d) => d.id === receipt.destinationId);
  const filename = document.createElement('strong');
  filename.dir = 'auto';
  renderFilename(filename, displayName);
  const address = document.createElement('span');
  renderRecipient(
    address,
    target?.label,
    target?.email || receipt.destination || 'the selected Kindle',
  );
  recipient.className = 'receipt-destination';
  recipient.append(filename, address);
  box.append(state, message, recipient);
  const compactStatus =
    {
      submitted: 'Submitted',
      submitting: 'Sending…',
      rejected: 'Not accepted',
      unknown: 'Status unknown',
    }[receipt.state] || receipt.state;
  artifactFeedback(receipt.artifactId, compactStatus, receipt.state);
  state.tabIndex = -1;
}
async function send({ artifactId, hash: view, filename, generated }) {
  if (sendingArtifactId) return;
  const destinationId = chosenReader()?.id;
  if (!destinationId) throw new Error('Choose a Kindle address.');
  sendingArtifactId = artifactId;
  updateSendTargets();
  try {
    const receipt = await post('/api/send', { artifactId, destinationId });
    showReceipt(receipt, view, filename);
    await refresh();
  } catch (error) {
    if (error.code === 'READER_NOT_FOUND') {
      await refresh();
      selectedReaderId = '';
      syncReaderChoices();
      error.message = currentAccount?.destinations.length
        ? 'That Kindle address is no longer saved. Choose another address.'
        : 'That Kindle address is no longer saved. Add an address to send this file.';
      throw error;
    }
    if (error.code === 'ARTIFACT_NOT_FOUND') {
      error.message = generated
        ? 'This book is no longer on your Shelf. Create the EPUB again from your manuscript. No new email was sent.'
        : 'This file is no longer on your Shelf. Upload the original file again. No new email was sent.';
      throw error;
    }
    if (error.code !== 'SEND_LIMIT')
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
  syncReceipt();
  $(`back-${target}`).hidden = !$(target).hasChildNodes();
  if (editing && target === 'created')
    $('create-form').querySelector('button[type=submit]').textContent = $('created').hasChildNodes()
      ? 'Create another EPUB'
      : 'Create EPUB';
  if (editing) $(target === 'created' ? 'manuscript' : 'original').focus();
}
function removeResult(artifactId) {
  if ($('receipt-panel').dataset.artifactId === artifactId) {
    receiptId = null;
    syncReceipt();
  }
  for (const target of ['created', 'uploaded']) {
    const box = $(target);
    if (box.dataset.artifactId !== artifactId) continue;
    box.replaceChildren();
    delete box.dataset.artifactId;
    box.hidden = true;
    $(target === 'created' ? 'create-editor' : 'upload-editor').hidden = false;
    $(`back-${target}`).hidden = true;
    if (target === 'created')
      $('create-form').querySelector('button[type=submit]').textContent = 'Create EPUB';
  }
}
function emailSizeHelp(artifact, actions) {
  const note = document.createElement('p');
  note.className = 'field-help';
  const amazon = $('file-note').querySelector('a').cloneNode(true);
  if (actions) {
    amazon.className = 'button';
    const sharing = document.createElement('div');
    sharing.className = 'share-zone';
    sharing.append(amazon);
    actions.prepend(sharing);
    note.textContent = 'Too large to email. Upload your original file on Amazon.';
    return note;
  }
  const instruction = artifact.generated
    ? 'Download the book and upload it with '
    : 'Upload your original file with ';
  note.append('Too large to email. ', instruction, amazon, '.');
  return note;
}
function renderFilename(element, name) {
  const extension = name.match(/\.(?:pdf|epub)(?: \(Copy \d+ of \d+\))?$/i)?.[0];
  if (!extension) {
    element.textContent = name;
    return;
  }
  const suffix = document.createElement('bdi');
  suffix.dir = 'ltr';
  suffix.textContent = extension;
  const filename = document.createElement('span');
  filename.append(name.slice(0, -extension.length), suffix);
  element.replaceChildren(filename);
}
function documentFormat(artifact) {
  return artifact.mimeType === 'application/pdf' ? 'PDF' : 'EPUB';
}

function openFileInfo(artifact, displayName = artifact.filename) {
  const content = $('file-info-content');
  const filename = document.createElement('p');
  filename.className = 'dialog-filename';
  filename.id = 'file-info-name';
  filename.dir = 'auto';
  renderFilename(filename, displayName);
  const kind = document.createElement('p');
  kind.className = 'field-help';
  kind.textContent = `${artifact.generated ? 'Generated EPUB' : `Original ${documentFormat(artifact)}`} · ${fileSize(artifact.bytes)}`;
  const identity = document.createElement('div');
  const expiry = expiryTime(artifact.expiresAt, true);
  expiry.className = 'field-help';
  identity.append(filename, kind, expiry);
  const checksum = document.createElement('div');
  const label = document.createElement('strong');
  label.textContent = 'SHA-256 checksum';
  const hash = document.createElement('code');
  hash.className = 'hash';
  for (let offset = 0; offset < artifact.sha256.length; offset += 16) {
    if (offset) hash.append(document.createElement('wbr'));
    hash.append(artifact.sha256.slice(offset, offset + 16));
  }
  const heading = document.createElement('div');
  heading.className = 'checksum-heading';
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'secondary';
  copy.textContent = 'Copy';
  copy.setAttribute('aria-label', 'Copy SHA-256 checksum');
  const notice = document.createElement('p');
  notice.className = 'action-feedback';
  notice.setAttribute('role', 'status');
  notice.id = 'checksum-copy-status';
  copy.setAttribute('aria-describedby', notice.id);
  enableCopy(copy, hash, notice);
  heading.append(label, copy);
  checksum.append(heading, hash, notice);
  content.replaceChildren(identity);
  if (artifact.emailEligible === false) content.append(emailSizeHelp(artifact));
  if (artifact.sourceUrl) identity.append(link('Download manuscript (JSON)', artifact.sourceUrl));
  content.append(checksum);
  $('file-info-dialog').showModal();
  content.scrollTop = 0;
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
  kind.id = target + '-format';
  kind.textContent = target === 'created' ? 'EPUB created' : documentFormat(artifact);
  kind.hidden =
    target === 'uploaded' &&
    artifact.filename.toLowerCase().endsWith('.' + kind.textContent.toLowerCase());
  const status = document.createElement('span');
  status.className = 'artifact-status';
  status.id = target + '-send-status';
  status.dataset.state = 'draft';
  status.setAttribute('role', 'status');
  status.textContent = target === 'uploaded' ? 'Uploaded · Not sent' : 'Not sent';
  topline.append(kind, status);
  const titleField = document.createElement('div');
  titleField.className = 'result-identity';
  const title = document.createElement('h2');
  title.className = 'result-name';
  title.id = target + '-name';
  title.setAttribute('aria-describedby', kind.id + ' ' + status.id);
  title.dir = 'auto';
  title.tabIndex = -1;
  if (target === 'created') title.textContent = $('title').value.trim();
  else renderFilename(title, artifact.filename);
  title.title = artifact.filename;
  const edit = document.createElement('button');
  edit.type = 'button';
  edit.className = 'plain-button result-edit';
  edit.textContent = target === 'created' ? 'Edit manuscript' : 'Upload another';
  if (target === 'uploaded') edit.setAttribute('aria-label', 'Upload another file');
  edit.addEventListener('click', () => showEditor(target, true));
  titleField.append(title, topline);
  const actions = document.createElement('div');
  actions.className = 'actions result-actions';
  const download = link('Download', artifact.downloadUrl, artifact.filename);
  download.className = 'button';
  const transfers = document.createElement('div');
  transfers.className = 'file-transfers';
  transfers.append(download);
  if (artifact.previewUrl) {
    const preview = link('Preview', artifact.previewUrl, artifact.filename);
    preview.className = 'button secondary';
    transfers.append(preview);
  }
  actions.append(transfers);
  if (artifact.emailEligible) {
    const sharing = document.createElement('div');
    sharing.className = 'share-zone';
    const sendButton = shareButton(artifact);
    sharing.append(sendButton);
    if (target === 'uploaded') {
      sendButton.classList.remove('secondary');
      download.classList.add('secondary');
      actions.prepend(sharing);
    } else {
      actions.append(sharing);
    }
  }
  const footer = document.createElement('footer');
  footer.className = 'artifact-footer';
  const size = document.createElement('span');
  size.textContent = fileSize(artifact.bytes);
  const facts = document.createElement('div');
  facts.className = 'file-facts';
  facts.append(size, expiryTime(artifact.expiresAt));
  const info = document.createElement('button');
  info.type = 'button';
  info.className = 'plain-button';
  info.textContent = 'Details';
  info.setAttribute('aria-label', `Details for ${title.textContent}`);
  info.setAttribute('aria-haspopup', 'dialog');
  info.addEventListener('click', () => openFileInfo(artifact));
  footer.append(facts, info);
  header.append(titleField);
  if (target === 'created') header.append(edit);
  else transfers.append(edit);
  box.append(header, actions, footer);
  const editor = $(target === 'created' ? 'create-editor' : 'upload-editor');
  const focusResult =
    document.activeElement === document.body || editor.contains(document.activeElement);
  showEditor(target, false);
  if (artifact.emailEligible === false) {
    const uploaded = target === 'uploaded';
    if (uploaded) download.classList.add('secondary');
    const note = emailSizeHelp(artifact, uploaded ? actions : undefined);
    note.id = target + '-email-limit';
    box.insertBefore(note, uploaded ? actions : footer);
    title.setAttribute('aria-describedby', [kind.id, status.id, note.id].join(' '));
  }
  if (focusResult) title.focus();
  for (const warning of artifact.warnings || []) {
    const note = document.createElement('p');
    note.className = 'field-help';
    note.textContent = warning;
    box.insertBefore(note, footer);
  }
}
function focusShelfAfterRemoval(index) {
  if ($('files-panel').hidden) return;
  const shelf = $('shelf');
  const next = shelf.children[index] || shelf.lastElementChild;
  (next?.querySelector('h3 button') || $('empty-shelf-actions').querySelector('a')).focus();
}
function showShelf(artifacts) {
  const shelf = $('shelf');
  const focusedId = shelf.contains(document.activeElement) && document.activeElement.id;
  $('files-heading').hidden = !artifacts.length;
  $('files-heading').textContent =
    `${artifacts.length} ${artifacts.length === 1 ? 'file' : 'files'}`;
  $('empty-shelf-help').hidden = !!artifacts.length;
  $('empty-shelf-actions').hidden = !!artifacts.length;
  shelf.hidden = !artifacts.length;
  shelf.replaceChildren();
  for (const [index, a] of artifacts.entries()) {
    const namesakes = artifacts.filter((file) => file.filename === a.filename);
    const copyLabel =
      namesakes.length > 1 ? `Copy ${namesakes.indexOf(a) + 1} of ${namesakes.length}` : '';
    const displayName = copyLabel ? `${a.filename} (${copyLabel})` : a.filename;
    const item = document.createElement('article');
    item.className = 'shelf-item';
    const title = document.createElement('h3');
    title.id = `shelf-title-${a.artifactId}`;
    item.setAttribute('aria-label', displayName);
    const details = document.createElement('button');
    details.type = 'button';
    details.id = `shelf-details-${a.artifactId}`;
    details.dir = 'auto';
    renderFilename(details, a.filename);
    details.setAttribute('aria-label', displayName + ' file details');
    details.setAttribute('aria-haspopup', 'dialog');
    details.addEventListener('click', () => openFileInfo(a, displayName));
    title.append(details);
    const info = document.createElement('small');
    const size = document.createElement('span');
    size.textContent = fileSize(a.bytes);
    if (copyLabel) {
      const copy = document.createElement('small');
      copy.className = 'file-tag';
      copy.setAttribute('aria-hidden', 'true');
      copy.textContent = copyLabel;
      title.append(copy);
    }
    info.append(size, expiryTime(a.expiresAt));
    if (a.emailEligible === false) {
      const limit = document.createElement('span');
      limit.className = 'file-tag file-tag--warn';
      limit.textContent = 'Too large to email';
      info.append(limit);
    }
    const links = document.createElement('div');
    links.className = 'shelf-links';
    const download = link('Download', a.downloadUrl, displayName);
    links.append(download);
    if (a.previewUrl) {
      const preview = link('Preview', a.previewUrl, displayName);
      links.append(preview);
    }
    if (a.emailEligible) links.prepend(shareButton(a, displayName));
    else if (a.emailEligible === false) {
      const amazon = $('file-note').querySelector('a').cloneNode(true);
      amazon.setAttribute('aria-description', displayName);
      links.prepend(amazon);
    }
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'plain-button delete-trigger';
    remove.textContent = 'Delete';
    remove.dataset.pendingLabel = 'Deleting…';
    remove.setAttribute('aria-label', `Delete ${displayName} from Shelf`);
    remove.addEventListener('click', () => {
      if (
        !window.confirm(
          `Delete ${displayName} from Shelf? Any copy already in your Kindle library stays there.`,
        )
      )
        return;
      busy(remove, async () => {
        await api(`/api/files/${a.artifactId}`, { method: 'DELETE' });
        removeResult(a.artifactId);
        await refresh();
        feedback($('files-panel').hidden ? $('desk') : $('files-panel'), `Deleted ${displayName}.`);
        if (document.activeElement === document.body) focusShelfAfterRemoval(index);
      });
    });
    links.append(remove);
    for (const action of links.children)
      action.id = `shelf-${a.artifactId}-${action.textContent.replaceAll(' ', '-')}`;
    item.append(title, info, links);
    shelf.append(item);
  }
  if (focusedId) $(focusedId)?.focus({ preventScroll: true });
}
function showReaders(destinations) {
  const savedNotice = $('destination-form').querySelector('[role="status"][data-saved-address]');
  if (savedNotice && !destinations.some((d) => d.id === savedNotice.dataset.savedAddress)) {
    savedNotice.textContent = '';
    delete savedNotice.dataset.savedAddress;
  }
  const count = destinations.length ? `${destinations.length} of 5 saved` : 'None saved';
  if ($('destination-status').textContent !== count) $('destination-status').textContent = count;
  const full = destinations.length >= 5;
  $('destination-form').hidden = full;
  $('reader-limit').hidden = !full;
  const list = $('reader-list');
  list.replaceChildren();
  for (const [index, d] of destinations.entries()) {
    const actionName = destinationName(d, destinations);
    const row = document.createElement('div');
    row.className = 'reader-item';
    row.id = `reader-${d.id}`;
    row.tabIndex = -1;
    row.setAttribute('role', 'group');
    row.setAttribute(
      'aria-label',
      [d.label !== d.email && d.label, d.email, d.isDefault && 'Default']
        .filter(Boolean)
        .join(', '),
    );
    const name = document.createElement('strong');
    name.dir = 'auto';
    if (d.label === d.email) renderAddress(name, d.email);
    else name.textContent = d.label;
    const address = document.createElement('p');
    address.id = `reader-email-${d.id}`;
    address.hidden = d.label === d.email;
    renderAddress(address, d.email);
    const actions = document.createElement('div');
    actions.className = 'row-actions';
    row.append(name, address, actions);
    const actionDescription = destinationShowsAddress(d, destinations) ? [] : [address.id];
    if (d.isDefault) {
      const current = document.createElement('span');
      current.id = `reader-default-${d.id}`;
      actionDescription.push(current.id);
      current.className = 'default-address';
      current.textContent = 'Default';
      const identity = document.createElement('div');
      identity.className = 'reader-identity';
      name.replaceWith(identity);
      identity.append(name, current);
    } else {
      const makeDefault = button(
        'Make default',
        async () => {
          await post(`/api/destinations/${d.id}/default`, {});
          await refresh();
          if (document.activeElement === document.body) $(row.id)?.focus();
        },
        'plain-button',
      );
      makeDefault.dataset.pendingLabel = 'Setting default…';
      makeDefault.setAttribute('aria-label', `Make default: ${actionName}`);
      if (actionDescription.length) makeDefault.setAttribute('aria-describedby', address.id);
      actions.append(makeDefault);
    }
    const removeAddress = button(
      'Remove',
      async () => {
        await api(`/api/destinations/${d.id}`, { method: 'DELETE' });
        await refresh();
        if (
          !$('studio-settings').hidden &&
          (document.activeElement === document.body || row.contains(document.activeElement))
        )
          (list.children[index] || list.lastElementChild || $('kindle-email')).focus();
      },
      'plain-button',
    );
    removeAddress.dataset.pendingLabel = 'Removing…';
    removeAddress.setAttribute('aria-label', `Remove ${actionName}`);
    if (actionDescription.length)
      removeAddress.setAttribute('aria-describedby', actionDescription.join(' '));
    actions.append(removeAddress);
    list.append(row);
  }
}
function showGrants(grants) {
  const list = $('grant-list');
  const heading = $('grants-heading');
  list.replaceChildren();
  const section = $('oauth-grants');
  section.querySelector('.action-feedback')?.remove();
  section.hidden = !grants.length && location.hash !== '#oauth-grants';
  heading.hidden = section.hidden;
  if (!grants.length && !section.hidden) list.textContent = 'No connected applications.';
  for (const [index, grant] of grants.entries()) {
    const row = document.createElement('div');
    row.className = 'grant-item';
    const name = document.createElement('strong');
    name.id = `grant-name-${index}`;
    name.dir = 'auto';
    name.textContent = grant.clientName;
    row.setAttribute('role', 'group');
    row.setAttribute('aria-labelledby', name.id);
    const details = document.createElement('p');
    const created = new Date(grant.createdAt).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    details.id = `grant-date-${index}`;
    details.textContent = `Connected ${created}`;
    const permissions = document.createElement('ul');
    permissions.className = 'grant-permissions';
    for (const permission of grant.permissions || grant.scope) {
      const item = document.createElement('li');
      item.textContent = permission;
      permissions.append(item);
    }
    const disconnect = document.createElement('button');
    disconnect.type = 'button';
    disconnect.className = 'plain-button token-revoke';
    disconnect.textContent = 'Disconnect';
    disconnect.dataset.pendingLabel = 'Disconnecting…';
    disconnect.addEventListener('click', () => {
      if (
        !window.confirm(
          `Disconnect ${grant.clientName}? The app will need your approval to reconnect.`,
        )
      )
        return;
      busy(disconnect, async () => {
        let message = `Disconnected ${grant.clientName}.`;
        try {
          await api(`/api/oauth-grants/${encodeURIComponent(grant.id)}`, { method: 'DELETE' });
        } catch (error) {
          if (error.code !== 'NOT_FOUND') throw error;
          message = `${grant.clientName} is no longer listed as connected.`;
        }
        const account = await api('/api/account');
        if (account.grants.some((item) => item.id === grant.id))
          throw new Error('The app is still listed as connected. Check Settings again.');
        showAccount(account);
        if (!account.grants.length) list.replaceChildren();
        section.hidden = false;
        const notice = feedback(section, message);
        if (document.activeElement === document.body) {
          const next = list.children[index] || list.lastElementChild;
          (next?.querySelector('button') || notice).focus();
        }
      });
    });
    disconnect.setAttribute('aria-label', `Disconnect ${grant.clientName}`);
    disconnect.setAttribute('aria-describedby', details.id);
    const actions = document.createElement('div');
    actions.className = 'row-actions';
    actions.append(disconnect);
    row.append(name, details, permissions, actions);
    list.append(row);
  }
}
function hideStartupError() {
  $('startup').hidden = true;
  $('startup-error').textContent = '';
}
function showStartupError(message) {
  document.body.classList.add('signed-out');
  document.body.classList.remove('signed-in');
  $('signin').hidden = true;
  $('desk').hidden = true;
  $('startup').hidden = false;
  $('startup-error').textContent = message;
  chooseTask(location.hash);
}
function showAccount(account) {
  const openingDesk = $('desk').hidden;
  hideStartupError();
  currentAccount = account;
  if (pendingDraft) {
    if (account.id && account.id === pendingDraft.owner) {
      for (const [id, value] of pendingDraft.fields) $(id).value = value;
      updateManuscriptCount();
      $('draft-recovery').hidden = false;
      $('draft-recovery').textContent = 'Draft restored.';
    }
    pendingDraft = null;
  }
  document.body.classList.add('signed-in');
  document.body.classList.remove('signed-out');
  $('signin').hidden = true;
  $('desk').hidden = false;
  chooseTask(location.hash);
  $('personal-token').hidden = false;
  syncTokenState(!!account.hasMcpToken);
  updateMetadataValues();
  showGrants(account.grants || []);
  $('logout').hidden = false;
  $('delete-account').hidden = false;
  $('account-name').textContent = account.email;
  $('sender-address').textContent = account.sender;
  if (openingDesk && location.hash === '#oauth-grants') $('grants-heading').focus();
  if (openingDesk && location.hash === '#sender-address') focusPersonalSender();
  if (!account.destinations.some((d) => d.id === selectedReaderId))
    selectedReaderId = account.defaultDestinationId || '';
  const limits = account.limits;
  $('allowance').hidden = !limits;
  if (limits) {
    updateDailyReset();
    $('limit-renders').textContent = limits.renders;
    $('limit-uploads').textContent = limits.uploads;
    $('limit-sends').textContent = limits.sends;
    const retention = `${limits.retentionHours} hours`;
    $('limit-retention').textContent = retention;
    $('empty-shelf-help').textContent = `Files expire ${retention} after creation or upload.`;
  }
  $('email-limit-note').textContent = limits?.emailUploadBytes
    ? `Too large to email (limit about ${fileSize(limits.emailUploadBytes)}).`
    : 'This file is too large to email.';
  $('email-size-limit').textContent = limits?.emailUploadBytes
    ? `The email file limit is about ${fileSize(limits.emailUploadBytes)}.`
    : 'Email size depends on encoding.';
  showReaders(account.destinations);
  showShelf(account.artifacts.filter((artifact) => artifact.kind === 'document'));
  const url = new URL(location.href);
  if (url.searchParams.has('file')) {
    const file = url.searchParams.get('file');
    const part = url.searchParams.get('part');
    url.searchParams.delete('part');
    url.searchParams.delete('file');
    history.replaceState(history.state, '', url);
    if (url.hash === '#files-panel') {
      const details = $(`shelf-title-${file}`)?.querySelector('button');
      const action = part === 'preview' ? 'Preview' : part === 'file' ? 'Download' : null;
      if (details) {
        ((action && $(`shelf-${file}-${action}`)) || details).focus();
        if (
          part === 'source' &&
          account.artifacts.some((a) => a.artifactId === file && a.sourceUrl)
        ) {
          details.click();
          $('file-info-content').querySelector('a').focus();
        }
      } else {
        const accountEmail = document.createElement('bdi');
        accountEmail.textContent = account.email;
        const notice = feedback($('files-panel'), 'This file isn’t on the Shelf for ');
        notice.append(accountEmail, '. If someone shared the file, ask them for a fresh copy.');
        notice.focus();
      }
    }
  }
  syncReaderChoices();
  updateSendTargets();
}
function dismissDraftRecovery() {
  const notice = $('draft-recovery');
  if (notice.hidden) return;
  notice.hidden = true;
  notice.textContent = '';
  const field = $('create-form').querySelector('[aria-describedby~="draft-recovery"]');
  if (field) {
    const help = field.getAttribute('aria-describedby').replace('draft-recovery', '').trim();
    if (help) field.setAttribute('aria-describedby', help);
    else field.removeAttribute('aria-describedby');
  }
}
function showSignedOut() {
  dismissDraftRecovery();
  hideStartupError();
  document.body.classList.add('signed-out');
  document.body.classList.remove('signed-in');
  $('signin').hidden = false;
  $('desk').hidden = true;
  for (const form of document.querySelectorAll('#desk form, #signin form')) {
    form.reset();
    for (const field of form.querySelectorAll('input, textarea, select')) {
      field.setCustomValidity('');
      clearFieldFeedback(field, form.id + '-feedback');
    }
  }
  for (const message of document.querySelectorAll('.action-feedback')) message.textContent = '';
  $('login-email-form').hidden = false;
  $('login-code-form').hidden = true;
  $('login-sent').textContent = '';
  updateEmailAction();
  clearCreateFieldError($('title'));
  clearCreateFieldError($('language'));
  updateMetadataValues();
  $('original').dispatchEvent(new Event('change'));
  updateManuscriptCount();
  $('create-editor').hidden = $('upload-editor').hidden = false;
  $('back-created').hidden = $('back-uploaded').hidden = true;
  $('create-form').querySelector('button[type=submit]').textContent = 'Create EPUB';
  chooseTask(location.hash);
  $('personal-token').hidden = true;
  for (const section of document.querySelectorAll('#desk details[open]')) section.open = false;
  clearToken();
  syncTokenState(false);
  showGrants([]);
  $('logout').hidden = true;
  $('delete-account').hidden = true;
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
  updateSendTargets();
  receiptId = null;
  setSetupReturn(null);
}
async function refresh() {
  try {
    showAccount(await api('/api/account'));
  } catch (error) {
    if (error.status === 401) {
      if (!$('desk').hidden || $('signin').hidden) showSignedOut();
    } else if (currentAccount) feedback($('desk'), error.message, true);
    else showStartupError(error.message);
  } finally {
    $('main-content').removeAttribute('aria-busy');
  }
}
document.querySelector('.plugin-host').hidden = location.origin === 'https://palim.pages.dev';
enableMenu($('studio-menu'));
document.querySelector('.skip-link').addEventListener('click', (event) => {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  $('main-content').focus();
});
const studioViews = new Map([
  [
    '#create-panel',
    {
      title: 'Create a book',
      signIn: 'Sign in to turn your manuscript into an EPUB.',
      subtitle: '',
    },
  ],
  [
    '#upload-panel',
    {
      title: 'Forward a file',
      signIn: 'Sign in to upload your EPUB or PDF.',
      subtitle: 'Your Shelf keeps the original file for 24 hours.',
    },
  ],
  ['#files-panel', { title: 'Shelf', subtitle: '', signIn: 'Sign in to see your files.' }],
  [
    '#studio-settings',
    {
      title: 'Settings',
      signIn: 'Sign in to manage your account.',
      subtitle: '',
    },
  ],
]);
function chooseTask(hash) {
  const settingsSection = {
    '#sender-address': {
      title: 'Personal sender address',
      signIn: 'Sign in to see the address to approve in Amazon.',
    },
    '#oauth-grants': {
      title: 'Connected applications',
      signIn: 'Sign in to review the apps with access to your account.',
    },
  }[hash];
  if (settingsSection) hash = '#studio-settings';
  const active = studioViews.has(hash) ? hash : '#create-panel';
  const view =
    settingsSection && document.body.classList.contains('signed-out')
      ? settingsSection
      : studioViews.get(active);
  const shelf = active === '#files-panel';
  const upload = active === '#upload-panel';
  const settings = active === '#studio-settings';
  const signedOut = document.body.classList.contains('signed-out');
  const startup = !$('startup').hidden;
  if (!settings) setSetupReturn(null);
  $('studio-title').textContent = startup ? 'Studio unavailable' : view.title;
  const pageTitle = `${$('studio-title').textContent} · Palim`;
  document.title = signedOut && !startup ? `Sign in · ${pageTitle}` : pageTitle;
  $('workspace-subtitle').textContent = startup ? '' : signedOut ? view.signIn : view.subtitle;
  $('workspace-subtitle').hidden =
    !$('workspace-subtitle').textContent || (signedOut && !$('login-code-form').hidden && !startup);
  $('workbench').hidden = settings;
  $('studio-settings').hidden = !settings;
  if (!settings && $('personal-token').open) $('personal-token').open = false;
  if (!shelf) $('files-panel').querySelector(':scope > .action-feedback[role=status]')?.remove();
  $('files-panel').hidden = !shelf;
  syncReceipt(active);
  $('create-panel').hidden = upload || shelf;
  $('upload-panel').hidden = !upload;
  for (const a of document.querySelectorAll('a[data-studio-view]')) {
    if (a.hash === active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
}
function navigateStudio(hash) {
  if (location.hash !== hash) history.pushState(null, '', hash);
  chooseTask(hash);
  $('main-content').scrollTop = 0;
}
for (const a of document.querySelectorAll('a[data-studio-view]'))
  a.addEventListener('click', (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    $('studio-menu').open = false;
    navigateStudio(a.hash);
    $('studio-title').focus({ preventScroll: true });
  });
addEventListener('hashchange', () => {
  if (
    location.hash &&
    !['#sender-address', '#oauth-grants'].includes(location.hash) &&
    !studioViews.has(location.hash)
  )
    return;
  for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
  $('studio-menu').open = false;
  chooseTask(location.hash);
  if (location.hash === '#sender-address' && currentAccount) focusPersonalSender();
  else if (location.hash === '#oauth-grants' && currentAccount) {
    showGrants(currentAccount.grants || []);
    $('grants-heading').focus();
  } else $('studio-title').focus({ preventScroll: true });
});
for (const target of ['created', 'uploaded'])
  $(`back-${target}`).addEventListener('click', () => {
    showEditor(target, false);
    $(target).querySelector('.result-name').focus();
  });
const originalInput = $('original');
const fileDrop = originalInput.closest('.file-drop');
const fileInfo = $('file-info');
const emptyFileHint = [...fileInfo.childNodes];
function originalError(message) {
  originalInput.setCustomValidity(message);
  originalInput.setAttribute('aria-invalid', String(!!message));
  const info = originalInput.files.length ? 'file-size' : 'file-info';
  if (message) originalInput.setAttribute('aria-describedby', `file-error ${info}`);
  else if (!$('file-note').hidden)
    originalInput.setAttribute('aria-describedby', `${info} file-note`);
  else originalInput.setAttribute('aria-describedby', info);
  $('file-error').textContent = message;
  $('file-error').hidden = !message;
  fileDrop.classList.toggle('has-error', !!message);
}
originalInput.addEventListener('change', () => {
  $('drop-feedback')?.remove();
  const uploadFeedback = $('upload-form').querySelector(
    '.action-feedback:not([data-code="DAILY_LIMIT"])',
  );
  if (uploadFeedback) uploadFeedback.textContent = '';
  const files = originalInput.files;
  const file = files[0];
  fileDrop.classList.toggle('has-file', !!file);
  if (files.length === 1) renderFilename($('file-name'), file.name);
  else
    $('file-name').textContent = files.length ? `${files.length} files` : 'Choose an EPUB or PDF';
  if (file) {
    const change = document.createElement('span');
    change.id = 'change-file-label';
    change.className = 'change-file';
    change.textContent = 'Change file';
    const action = document.createElement('span');
    action.append(' · ', change);
    const size = document.createElement('span');
    size.id = 'file-size';
    size.textContent = fileSize(file.size);
    fileInfo.replaceChildren(size, action);
  } else fileInfo.replaceChildren(...emptyFileHint);
  originalInput.setAttribute('aria-labelledby', file ? 'change-file-label file-name' : 'file-name');
  const invalidType =
    file &&
    !/\.(epub|pdf)$/i.test(file.name) &&
    !['application/epub+zip', 'application/pdf'].includes(file.type);
  const excessBytes = file ? file.size - 20 * 1024 * 1024 : 0;
  const validFile = files.length === 1 && file && !invalidType && file.size > 0 && excessBytes <= 0;
  const emailLimit = currentAccount?.limits?.emailUploadBytes;
  $('file-note').hidden = !(validFile && emailLimit && file.size > emailLimit);
  originalError(
    files.length > 1
      ? 'Choose one EPUB or PDF.'
      : invalidType
        ? 'Choose an EPUB or PDF file.'
        : excessBytes > 0
          ? `${fileSize(excessBytes)} over the 20 MiB limit. Choose a smaller file.`
          : file?.size === 0
            ? 'This file is empty. Choose another file.'
            : '',
  );
  if (files.length === 1 && !invalidType && excessBytes > 0) {
    const limits = document.createElement('a');
    limits.href = '/privacy#file-upload-limit';
    limits.textContent = 'View file limits';
    limits.target = '_blank';
    limits.rel = 'noopener';
    limits.setAttribute('aria-label', 'View file limits (opens in a new tab)');
    $('file-error').append(' ', limits);
  }
});
originalInput.addEventListener('invalid', () => {
  if (!originalInput.files.length) originalError('Choose an EPUB or PDF file first.');
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
  if (event.dataTransfer.files.length > 1) {
    const message = `You dropped ${event.dataTransfer.files.length} files. Choose one EPUB or PDF.`;
    if (originalInput.files.length) {
      const notice = feedback(
        fileDrop.parentElement,
        message + ' Your previous selection is still here.',
        true,
      );
      notice.id = 'drop-feedback';
      const details = originalInput
        .getAttribute('aria-describedby')
        .split(' ')
        .filter((id) => id !== notice.id);
      originalInput.setAttribute('aria-describedby', [notice.id, ...details].join(' '));
    } else {
      originalError(message);
    }
    originalInput.focus();
    return;
  }
  originalInput.files = event.dataTransfer.files;
  originalInput.dispatchEvent(new Event('change'));
  originalInput.focus();
});
for (const [current, next] of [
  ['title', 'manuscript'],
  ['creator', 'language'],
  ['kindle-email', 'reader-label'],
]) {
  $(current).addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    if (current === 'title' && !event.currentTarget.value.trim()) {
      event.currentTarget.setCustomValidity('Enter a book title.');
      event.currentTarget.checkValidity();
      return;
    }
    if (current === 'kindle-email' && kindleAddressError(event.currentTarget)) {
      showKindleAddressError(event.currentTarget);
      return;
    }
    $(next).focus();
  });
}
const MANUSCRIPT_LIMIT = 240000;
const CHAPTER_LIMIT = 50000;
const MAX_CHAPTERS = 24;
const manuscriptCount = $('manuscript-count');
function headingExcerpt(heading) {
  const letters = Array.from(heading);
  return letters.length > 32 ? letters.slice(0, 32).join('') + '…' : heading;
}
function chapterLabel(chapters, index) {
  return chapters.length === 1
    ? 'Chapter 1'
    : `Chapter ${index + 1} “${headingExcerpt(chapters[index].title)}”`;
}
function manuscriptWarning(length, chapters) {
  if (length > MANUSCRIPT_LIMIT)
    return `This manuscript exceeds ${MANUSCRIPT_LIMIT.toLocaleString()} characters by ${(length - MANUSCRIPT_LIMIT).toLocaleString()}. Shorten it before creating the EPUB.`;
  if (chapters.length > MAX_CHAPTERS)
    return `This manuscript has ${chapters.length} chapters. Combine chapters to stay within ${MAX_CHAPTERS}.`;
  const longHeading = chapters.findIndex((chapter) => chapter.title.length > 160);
  if (longHeading >= 0) {
    const heading = chapters[longHeading].title;
    const excess = heading.length - 160;
    return `Shorten chapter ${longHeading + 1}’s heading “${headingExcerpt(heading)}” by ${excess.toLocaleString()} ${excess === 1 ? 'character' : 'characters'}.`;
  }
  const index = chapters.findIndex((chapter) => chapter.markdown.length > CHAPTER_LIMIT);
  if (index < 0) return '';
  const chapter = chapters[index];
  const name = chapterLabel(chapters, index);
  const excess = chapter.markdown.length - CHAPTER_LIMIT;
  const fix =
    chapters.length === MAX_CHAPTERS
      ? 'Shorten it or move text to another chapter.'
      : 'Shorten it or split it with a new # heading.';
  return `${name} exceeds ${CHAPTER_LIMIT.toLocaleString()} characters by ${excess.toLocaleString()}. ${fix}`;
}
function remainingCharacters(label, used, limit) {
  const remaining = limit - used;
  if (!remaining) return `${label} is at the ${limit.toLocaleString()}-character limit.`;
  return `${label} · ${remaining.toLocaleString()} ${remaining === 1 ? 'character' : 'characters'} left`;
}
const updateManuscriptCount = () => {
  const value = $('manuscript').value;
  const used = value.length;
  const chapters = parseChapters(value, $('title').value.trim());
  let message = manuscriptWarning(used, chapters);
  const field = $('manuscript');
  if (field.hasAttribute('aria-invalid')) {
    if (!value.trim()) message = 'Write or paste your manuscript.';
    if (!message) field.removeAttribute('aria-invalid');
  }
  if (!message) {
    const lengths = chapters.map((chapter) => chapter.markdown.length);
    const longest = Math.max(...lengths);
    const chapterNearLimit = longest >= CHAPTER_LIMIT * 0.9;
    if (
      used >= MANUSCRIPT_LIMIT * 0.9 &&
      (!chapterNearLimit || MANUSCRIPT_LIMIT - used <= CHAPTER_LIMIT - longest)
    )
      message = remainingCharacters('Manuscript', used, MANUSCRIPT_LIMIT);
    else if (chapterNearLimit)
      message = remainingCharacters(
        chapterLabel(chapters, lengths.indexOf(longest)),
        longest,
        CHAPTER_LIMIT,
      );
  }
  const chaptersBadge = $('manuscript-chapters');
  if (chaptersBadge) {
    chaptersBadge.hidden = chapters.length < 2;
    chaptersBadge.textContent = chapters.length >= 2 ? `${chapters.length} chapters` : '';
  }
  manuscriptCount.hidden = !message;
  $('manuscript').setAttribute(
    'aria-describedby',
    manuscriptCount.hidden ? 'manuscript-help' : 'manuscript-count manuscript-help',
  );
  manuscriptCount.textContent = message;
};
$('manuscript').addEventListener('input', updateManuscriptCount);
updateManuscriptCount();

function parseChapters(markdown, fallbackTitle) {
  if (markdown.length > MANUSCRIPT_LIMIT) return [];
  const lines = markdown.split(/\r?\n/);
  const chapters = [];
  let fence = null;
  let firstSubheading;
  let currentTitle = null;
  let buffer = [];
  const flush = (title) => {
    const text = buffer.join('\n').trim();
    if (title !== null) {
      chapters.push({ title, markdown: text || title });
    } else if (text) {
      chapters.push({ title: (fallbackTitle || 'Reading edition').slice(0, 160), markdown: text });
    }
    buffer = [];
  };
  for (const line of lines) {
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      buffer.push(line);
      if (marker && marker[1].startsWith(fence) && /^[ \t]*$/.test(marker[2])) fence = null;
      continue;
    }
    if (marker && (marker[1][0] === '~' || !marker[2].includes('`'))) {
      fence = marker[1];
      buffer.push(line);
      continue;
    }
    const heading = /^ {0,3}(#{1,3})([ \t]+.*)$/.exec(line);
    const headingTitle = heading?.[2].replace(/[ \t]+#+[ \t]*$/, '').trim();
    if (headingTitle && heading[1] === '#') {
      flush(currentTitle);
      currentTitle = headingTitle;
    } else {
      if (headingTitle && !firstSubheading) firstSubheading = headingTitle;
      buffer.push(line);
    }
  }
  flush(currentTitle);
  if (chapters.length > 0 && currentTitle !== null) return chapters;
  return [
    {
      title:
        (firstSubheading && firstSubheading.length <= 160 ? firstSubheading : fallbackTitle) ||
        'Reading edition',
      markdown,
    },
  ];
}

function updateMetadataValues() {
  const author = $('creator').value.trim();
  const entered = $('language').value.trim();
  const code = entered.replaceAll('_', '-').toLowerCase();
  const suggestion = Array.from($('book-languages').options).find(
    (option) => option.dataset.code.toLowerCase() === code || option.value.toLowerCase() === code,
  );
  let language = suggestion?.value || entered;
  if (entered && !suggestion) {
    try {
      language =
        new Intl.DisplayNames(['en-GB'], { type: 'language', fallback: 'none' }).of(code) ||
        entered;
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
    }
  }
  const values = $('metadata-values');
  $('metadata-author').textContent = author;
  $('metadata-language').textContent = language;
  $('metadata-separator').hidden = !(author && language);
  values.hidden = !author && !language;
}
for (const field of [$('creator'), $('language')])
  field.addEventListener('input', updateMetadataValues);

$('create-form').addEventListener('input', (event) => {
  dismissDraftRecovery();
  const error = event.currentTarget.querySelector(
    '.action-feedback[data-code="INVALID_MANUSCRIPT"]',
  );
  if (error) error.textContent = '';
});
for (const field of [$('title'), $('manuscript'), $('language')])
  field.addEventListener('input', () => field.setCustomValidity(''));
function validateLanguage() {
  const enteredLanguage = $('language').value.trim();
  const suggestion = Array.from($('book-languages').options).find(
    (option) => option.value.toLowerCase() === enteredLanguage.toLowerCase(),
  );
  try {
    const [language] = Intl.getCanonicalLocales(
      suggestion?.dataset.code || enteredLanguage.replaceAll('_', '-'),
    );
    $('language').setCustomValidity('');
    return language;
  } catch {
    $('language').setCustomValidity(
      enteredLanguage
        ? 'Choose a suggested language or enter a code such as en-GB.'
        : 'Choose the language your book is written in.',
    );
  }
}
function clearCreateFieldError(field) {
  const hint = $(field.id + '-error');
  hint.hidden = true;
  clearFieldFeedback(field, hint.id);
}
for (const field of [$('title'), $('language')])
  field.addEventListener('input', () => {
    if (field.id === 'language' && !$('language-error').hidden && !validateLanguage()) {
      $('language-error').textContent = field.validationMessage;
      return;
    }
    if (field.value.trim()) clearCreateFieldError(field);
  });
$('create-form').addEventListener(
  'invalid',
  (event) => {
    const details = event.target.closest('details');
    if (details) details.open = true;
    if (event.target.id === 'manuscript') {
      event.target.setAttribute('aria-invalid', 'true');
      updateManuscriptCount();
      event.target.setCustomValidity(manuscriptCount.textContent);
    }
    if (event.target.id === 'title' || event.target.id === 'language') {
      if (event.target.id === 'title') event.target.setCustomValidity('Enter a book title.');
      else validateLanguage();
      const hint = $(event.target.id + '-error');
      hint.textContent = event.target.validationMessage;
      hint.hidden = false;
      event.target.setAttribute('aria-invalid', 'true');
      event.target.setAttribute('aria-describedby', hint.id);
    }
  },
  true,
);
$('create-form').addEventListener('submit', (event) => {
  dismissDraftRecovery();
  event.preventDefault();
  const title = $('title').value.trim();
  const markdown = $('manuscript').value;
  const chapters = parseChapters(markdown, title);
  let message = manuscriptWarning(markdown.length, chapters);
  if (!markdown.trim()) message = 'Write or paste your manuscript.';
  $('title').setCustomValidity(title ? '' : 'Enter a book title.');
  $('manuscript').setCustomValidity(message);
  const language = validateLanguage();
  if (!event.currentTarget.checkValidity()) {
    event.currentTarget.querySelector(':invalid').focus();
    return;
  }
  busy(event.submitter, async () => {
    const body = { title, language, chapters };
    if ($('creator').value.trim()) body.creator = $('creator').value.trim();
    const artifact = await post('/api/books', body);
    showArtifact('created', artifact);
    await refresh();
  });
});
$('upload-form').addEventListener('submit', (event) => {
  event.preventDefault();
  busy(event.submitter, async () => {
    const file = $('original').files[0];
    if (!file) throw new Error('Choose an EPUB or PDF file first.');
    const artifact = await api('/api/files', {
      method: 'POST',
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
        'X-Filename-Encoded': encodeURIComponent(file.name),
      },
      body: file,
    });
    originalInput.value = '';
    originalInput.dispatchEvent(new Event('change'));
    showArtifact('uploaded', artifact);
    await refresh();
  });
});
$('destination-form').addEventListener('input', (event) => {
  const field = event.target;
  if (field.id === 'kindle-email' && field.getAttribute('aria-invalid') === 'true') {
    const message = kindleAddressError(field);
    if (message) $('destination-form-feedback').textContent = message;
    if (message || !field.validity.valid) return;
  }
  clearFieldFeedback(field, 'destination-form-feedback');
  const form = event.currentTarget;
  if (form.querySelector('[aria-invalid="true"]')) return;
  const message = form.querySelector('.action-feedback');
  if (message) message.textContent = '';
});
function isKindleAddress(value) {
  return /@(?:free\.)?kindle\.com$/i.test(value.trim());
}
function kindleAddressError(field) {
  const value = field.value;
  if (!value.trim()) return 'Enter your Kindle email address.';
  if (value.length > 180) return 'Use a Kindle address with 180 characters or fewer.';
  if (!isKindleAddress(value)) return 'Use an address ending in @kindle.com or @free.kindle.com.';
  if (field.validity.typeMismatch) return 'Enter the complete Kindle email address.';
  return '';
}
function showKindleAddressError(field) {
  const notice = feedback(field.form, kindleAddressError(field), true);
  notice.id = 'destination-form-feedback';
  clearFieldFeedback($('reader-label'), notice.id);
  field.after(notice);
  field.setAttribute('aria-invalid', 'true');
  field.setAttribute('aria-describedby', notice.id + ' kindle-email-help');
  field.focus();
}
$('kindle-email').addEventListener('invalid', (event) => {
  event.preventDefault();
  showKindleAddressError(event.currentTarget);
});
$('destination-form').addEventListener('submit', (event) => {
  event.preventDefault();
  event.currentTarget.append(feedbackFor(event.currentTarget));
  busy(event.submitter, async () => {
    const returning = setupReturn;
    const addressError = kindleAddressError($('kindle-email'));
    if (addressError) throw Object.assign(new Error(addressError), { code: 'KINDLE_ADDRESS' });
    const saved = await post('/api/destinations', {
      email: $('kindle-email').value,
      label: $('reader-label').value,
    });
    if (returning) selectedReaderId = saved.id;
    $('kindle-email').value = '';
    $('reader-label').value = '';
    await refresh();
    if (returning && setupReturn === returning && chosenReader()?.id === saved.id) {
      returnToFile(true);
    } else if (!$('studio-settings').hidden) {
      if ($('destination-form').hidden) {
        if (document.activeElement === document.body) $(`reader-${saved.id}`)?.focus();
      } else {
        feedback($('destination-form'), `Saved ${saved.email}.`).dataset.savedAddress = saved.id;
      }
    }
  });
});
$('refresh-receipt').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  const id = receiptId;
  if (!id) return;
  const refreshed = await busy(button, async () => {
    const receipt = await api(`/api/deliveries/${id}`);
    if (receiptId !== id) return;
    if ($('receipt').querySelector('.receipt-state')?.dataset.state === receipt.state) {
      const checkedAt = new Date().toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      feedback($('receipt-panel'), `Checked at ${checkedAt}. No change.`);
    } else {
      showReceipt(
        receipt,
        $('receipt-panel').dataset.view,
        $('receipt').querySelector('.receipt-destination strong').textContent,
      );
    }
  });
  if (
    refreshed &&
    receiptId === id &&
    !$('receipt-panel').hidden &&
    document.activeElement === document.body
  )
    (button.hidden ? $('receipt').querySelector('.receipt-state') : button).focus();
});
$('mcp-url').replaceChildren(location.origin, document.createElement('wbr'), '/mcp');
const copyTimers = new WeakMap();
let manualCopy;
let latestCopy = 0;
document.addEventListener(
  'selectionchange',
  () => {
    if (!manualCopy) return;
    const { button, source, range } = manualCopy;
    const selection = window.getSelection();
    const selected = range
      ? selection.rangeCount &&
        selection.getRangeAt(0) === range &&
        selection.toString() === source.textContent
      : document.activeElement === source &&
        source.selectionStart === 0 &&
        source.selectionEnd === source.value.length;
    if (selected && button.getClientRects().length) return;
    resetCopy(button);
  },
  true,
);
function resetCopy(button) {
  if (manualCopy?.button === button) {
    if (manualCopy.notice.textContent === 'Copy unavailable. Copy the selected text manually.')
      manualCopy.notice.textContent = '';
    manualCopy = null;
  }
  clearTimeout(copyTimers.get(button));
  button.textContent = 'Copy';
  delete button.dataset.result;
  button.setAttribute('aria-label', button.dataset.copyLabel);
}
function enableCopy(button, source, notice) {
  button.dataset.copyLabel = button.getAttribute('aria-label');
  const item = button.dataset.copyLabel.replace(/^Copy /, '');
  button.addEventListener('click', async () => {
    if (button.getAttribute('aria-busy') === 'true') return;
    const attempt = ++latestCopy;
    const focusAtStart = document.activeElement;
    if (manualCopy) {
      const { source: selectedSource, range } = manualCopy;
      const selection = window.getSelection();
      if (
        range &&
        selection.rangeCount &&
        selection.getRangeAt(0) === range &&
        selection.toString() === selectedSource.textContent
      )
        selection.removeAllRanges();
      resetCopy(manualCopy.button);
    }
    resetCopy(button);
    notice.textContent = '';
    button.setAttribute('aria-busy', 'true');
    button.textContent = 'Copying…';
    button.setAttribute('aria-label', `Copying ${item}`);
    const text = source.value ?? source.textContent;
    try {
      await navigator.clipboard.writeText(text);
      if (
        attempt !== latestCopy ||
        !button.getClientRects().length ||
        text !== (source.value ?? source.textContent)
      )
        return;
      button.textContent = 'Copied';
      button.dataset.result = 'copied';
      button.setAttribute('aria-label', `Copied ${item}`);
    } catch {
      if (
        attempt !== latestCopy ||
        !button.getClientRects().length ||
        text !== (source.value ?? source.textContent)
      )
        return;
      if (document.activeElement !== focusAtStart) {
        resetCopy(button);
        notice.textContent = 'Couldn’t copy. Try again.';
        return;
      }
      if (manualCopy) resetCopy(manualCopy.button);
      let range;
      if (source instanceof HTMLInputElement) {
        source.focus();
        source.select();
      } else {
        range = document.createRange();
        range.selectNodeContents(source);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      }
      manualCopy = { button, source, notice, range };
      button.textContent = 'Selected';
      button.dataset.result = 'selected';
      button.setAttribute('aria-label', `Selected ${item}`);
      notice.textContent = 'Copy unavailable. Copy the selected text manually.';
    } finally {
      button.removeAttribute('aria-busy');
      if (attempt !== latestCopy) resetCopy(button);
      else if (manualCopy?.button !== button)
        copyTimers.set(
          button,
          setTimeout(() => resetCopy(button), 2400),
        );
    }
  });
}
enableCopy($('copy-sender'), $('sender-address'), $('copy-sender-status'));
enableCopy($('copy-mcp'), $('mcp-url'), $('copy-mcp-status'));
enableCopy($('copy-token'), $('token-secret'), $('token-status'));
$('token-secret').addEventListener('blur', () => {
  if (manualCopy?.source === $('token-secret')) resetCopy(manualCopy.button);
});
document.addEventListener('change', (event) => {
  if (event.target.matches('select[data-reader-choice]')) {
    selectedReaderId = event.target.value;
    const notice = $('share-content').querySelector('.action-feedback');
    if (chosenReader() && ['READER_NOT_FOUND', 'SEND_LIMIT'].includes(notice?.dataset.code))
      notice.remove();
    syncReaderChoices();
    updateSendTargets();
  }
});
let resendAt = 0;
let resendTimer;
function updateResend() {
  clearTimeout(resendTimer);
  const button = $('resend-login');
  const seconds = Math.max(0, Math.ceil((resendAt - Date.now()) / 1000));
  if ($('login-code-form').getAttribute('aria-busy') !== 'true') {
    button.disabled = seconds > 0;
    button.textContent = seconds ? `Resend in ${seconds}s` : 'Resend code';
  }
  if (seconds) resendTimer = setTimeout(updateResend, 1000);
}
async function requestLogin() {
  const email = $('login-email').value.trim();
  const response = await post('/auth/email-otp/send-verification-otp', { email, type: 'sign-in' });
  resendAt = Date.now() + response.resendAfterSeconds * 1000;
  $('login-code').value = '';
  const codeLabel = $('login-code-form').hidden ? 'your code' : 'your latest code';
  const recipient = document.createElement('strong');
  recipient.dir = 'auto';
  renderAddress(recipient, email);
  $('login-sent').replaceChildren('Check ', recipient, ` for ${codeLabel}.`);
  $('login-email-form').hidden = true;
  $('login-code-form').hidden = false;
  $('workspace-subtitle').hidden = true;
  clearCodeError();
}
function clearCodeError() {
  $('login-code').setCustomValidity('');
  $('login-code').removeAttribute('aria-invalid');
  $('login-code').setAttribute('aria-describedby', 'login-sent login-expiry');
  const error = $('login-code-form').querySelector('.action-feedback');
  if (error) error.textContent = '';
}
function showCodeHint(field, text) {
  const message = feedback($('login-code-form'), text, true);
  message.id = 'login-code-form-feedback';
  field.setAttribute('aria-describedby', `${message.id} login-sent`);
}
$('login-code').addEventListener('invalid', (event) => {
  event.preventDefault();
  const field = event.currentTarget;
  field.setCustomValidity('Enter the six digits from your email.');
  field.setAttribute('aria-invalid', 'true');
  showCodeHint(field, field.validationMessage);
  field.focus();
});
$('login-code').addEventListener('paste', (event) => {
  const pasted = event.clipboardData?.getData('text');
  if (!pasted) return;
  const normalized = pasted.replace(/[０-９]/g, (digit) => digit.normalize('NFKC'));
  const digits = normalized.replace(/[\s-]/g, '');
  if (!/^[0-9]{6}$/.test(digits)) {
    const field = event.currentTarget;
    const available =
      field.maxLength - field.value.length + field.selectionEnd - field.selectionStart;
    if (/^[0-9]+$/.test(normalized) && normalized.length <= available) {
      if (normalized === pasted) return;
      event.preventDefault();
      field.setRangeText(normalized, field.selectionStart, field.selectionEnd, 'end');
      clearCodeError();
      return;
    }
    event.preventDefault();
    showCodeHint(field, 'Paste the six-digit code from your email.');
    return;
  }
  event.preventDefault();
  event.currentTarget.value = digits;
  clearCodeError();
});
$('login-code').addEventListener('input', () => {
  clearCodeError();
});
async function sendLoginCode(button) {
  if (await busy(button, requestLogin)) {
    updateResend();
    $('login-code').focus();
  }
}
function returningToCode() {
  const recipient = $('login-sent').querySelector('strong');
  return (
    recipient && recipient.textContent.toLowerCase() === $('login-email').value.trim().toLowerCase()
  );
}
function updateEmailAction() {
  $('login-email-form').querySelector('button[type=submit]').textContent = returningToCode()
    ? 'Back to code'
    : 'Email me a code';
}
function loginEmailError(email) {
  if (email.validity.valueMissing) return 'Enter your email address.';
  if (email.value.trim().length > 254) return 'Use an email address with 254 characters or fewer.';
  if (email.validity.typeMismatch || !email.value.split('@')[1]?.includes('.'))
    return 'Enter a complete email address, such as name@example.com.';
  if (isKindleAddress(email.value))
    return 'That’s a Kindle delivery address. Enter your regular email address.';
  return '';
}
$('login-email').addEventListener('input', (event) => {
  const field = event.currentTarget;
  updateEmailAction();
  $('signin').querySelector(':scope > .action-feedback[role=status]')?.remove();
  const message = field.form.querySelector('.action-feedback');
  if (field.getAttribute('aria-invalid') === 'true' && message) {
    const guidance = loginEmailError(field);
    if (guidance) {
      if (guidance !== message.textContent) message.textContent = guidance;
      return;
    }
  }
  clearFieldFeedback(field, 'login-email-form-feedback');
  if (message) message.textContent = '';
});
function showEmailError(email, text) {
  const error = feedback(email.form, text, true);
  error.id = 'login-email-form-feedback';
  email.setAttribute('aria-invalid', 'true');
  email.setAttribute('aria-describedby', error.id);
  email.focus();
}
$('login-email').addEventListener('invalid', (event) => {
  event.preventDefault();
  const email = event.currentTarget;
  showEmailError(email, loginEmailError(email));
});
$('login-email-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const email = $('login-email');
  if (returningToCode()) {
    $('login-email-form').hidden = true;
    $('login-code-form').hidden = false;
    $('workspace-subtitle').hidden = true;
    updateResend();
    $('login-code').focus();
    return;
  }
  const guidance = loginEmailError(email);
  if (guidance) {
    showEmailError(email, guidance);
    return;
  }
  sendLoginCode(event.submitter);
});
$('resend-login').addEventListener('click', (event) => sendLoginCode(event.currentTarget));
$('change-login-email').addEventListener('click', () => {
  $('login-code-form').hidden = true;
  $('login-email-form').hidden = false;
  $('workspace-subtitle').hidden = false;
  if ($('login-code').getAttribute('aria-invalid') === 'true') $('login-code').value = '';
  $('login-email').focus();
  $('login-email').select();
  updateEmailAction();
  clearCodeError();
});
$('login-code-form').addEventListener('submit', (event) => {
  event.preventDefault();
  busy(event.submitter, async () => {
    const session = await post('/auth/sign-in/email-otp', {
      email: $('login-email').value.trim().toLowerCase(),
      otp: $('login-code').value.trim(),
    });
    if (pendingDraft && !new URLSearchParams(location.search).has('returnTo')) {
      if (session.user?.id !== pendingDraft.owner) {
        pendingDraft = null;
        location.reload();
        return;
      }
      await refresh();
      if (currentAccount) {
        const draftField = $('title').value.trim() ? $('manuscript') : $('title');
        if (draftField.getClientRects().length) {
          const help = draftField.getAttribute('aria-describedby') || '';
          draftField.setAttribute('aria-describedby', ('draft-recovery ' + help).trim());
          draftField.focus();
        } else $('studio-title').focus();
      }
      return;
    }
    const target = new URL(
      new URLSearchParams(location.search).get('returnTo') ||
        '/app' + location.search + location.hash,
      location.origin,
    );
    if (target.href === location.href) {
      location.reload();
      return;
    }
    location.assign(
      target.origin === location.origin ? target.pathname + target.search + target.hash : '/app',
    );
  });
});
let tokenViewVersion = 0;
function clearToken() {
  tokenViewVersion++;
  resetCopy($('copy-token'));
  $('token-value').hidden = true;
  $('token-secret').value = '';
  const status = $('token-status');
  status.textContent = '';
  status.className = 'action-feedback';
  status.setAttribute('role', 'status');
}
function syncTokenState(hasToken) {
  const badge = $('token-badge');
  if (hasToken === null) {
    badge.textContent = 'Unknown';
    badge.dataset.state = 'unknown';
    $('create-token').textContent = 'Check token status';
    $('revoke-token').hidden = true;
    return;
  }
  badge.textContent = hasToken ? 'Active' : 'None';
  badge.dataset.state = hasToken ? 'active' : 'none';
  $('create-token').textContent = hasToken ? 'Replace token' : 'Create token';
  $('revoke-token').hidden = !hasToken;
}
$('personal-token').addEventListener('toggle', () => {
  if (!$('personal-token').open) clearToken();
});
for (const action of ['create', 'revoke']) {
  $(action + '-token').addEventListener('click', async () => {
    if (currentAccount?.hasMcpToken === null) {
      clearToken();
      await busy($('create-token'), async () => {
        const owner = currentAccount.id;
        const account = await api('/api/account');
        if (currentAccount?.id !== owner || account.id !== owner) return;
        currentAccount.hasMcpToken = account.hasMcpToken;
        $('token-status').textContent = account.hasMcpToken
          ? 'A token is active.'
          : 'No personal token is active.';
      });
      syncTokenState(currentAccount?.hasMcpToken);
      return;
    }
    let prompt =
      'Allow clients with this token to read your files, create books and send to your saved Kindle addresses?';
    if (action === 'revoke')
      prompt = 'Revoke your personal token? Every client using it will lose access.';
    else if (currentAccount?.hasMcpToken)
      prompt = 'Replace your personal token? Clients using the old token will need the new one.';
    if (!window.confirm(prompt)) return;
    clearToken();
    const version = tokenViewVersion;
    const owner = currentAccount?.id;
    const status = $('token-status');
    const button = $(action + '-token');
    button.textContent =
      action === 'revoke' ? 'Revoking…' : currentAccount?.hasMcpToken ? 'Replacing…' : 'Creating…';
    button.setAttribute('aria-busy', 'true');
    $('create-token').disabled = $('revoke-token').disabled = true;
    try {
      const result = await api('/api/mcp-token', {
        method: action === 'create' ? 'POST' : 'DELETE',
      });
      const active = 'hasMcpToken' in result ? !!result.hasMcpToken : !!result.token;
      if (!currentAccount || currentAccount.id !== owner) return;
      currentAccount.hasMcpToken = active;
      if (version !== tokenViewVersion || !$('personal-token').open || $('studio-settings').hidden)
        return;
      if (result.token) {
        $('token-value').hidden = false;
        $('token-secret').value = result.token;
        $('token-secret').focus();
        $('token-secret').select();
      } else {
        status.textContent = 'Token revoked.';
      }
    } catch (e) {
      if (version !== tokenViewVersion || !$('personal-token').open) return;
      let message = e.message;
      if (['NETWORK_ERROR', 'UNREADABLE_RESPONSE'].includes(e.code) || e.status >= 500) {
        message =
          'Couldn’t confirm the token change. Check its status before making another change.';
        try {
          const account = await api('/api/account');
          if (account.id !== owner || currentAccount?.id !== owner) return;
          currentAccount.hasMcpToken = account.hasMcpToken;
          message = account.hasMcpToken
            ? 'A token is active. Replace it if you need a new token to copy.'
            : 'No personal token is active.';
        } catch {
          if (currentAccount?.id === owner) currentAccount.hasMcpToken = null;
        }
        if (version !== tokenViewVersion || !$('personal-token').open) return;
      }
      status.textContent = message;
      status.className = 'action-feedback error';
      status.setAttribute('role', 'alert');
    } finally {
      button.removeAttribute('aria-busy');
      $('revoke-token').textContent = 'Revoke token';
      syncTokenState(currentAccount?.hasMcpToken);
      $('create-token').disabled = $('revoke-token').disabled = false;
      if (
        document.activeElement === document.body &&
        $('personal-token').open &&
        !$('studio-settings').hidden
      )
        (button.hidden ? $('create-token') : button).focus();
    }
  });
}
const logoutForm = $('logout');
const logoutButton = logoutForm.querySelector('button');
logoutForm.addEventListener('submit', (event) => {
  if (logoutButton.disabled) {
    event.preventDefault();
    return;
  }
  logoutButton.disabled = true;
  $('delete-account').disabled = true;
  logoutButton.textContent = 'Signing out…';
});
window.addEventListener('pageshow', (event) => {
  if (event.persisted && logoutButton.textContent === 'Signing out…') {
    $('delete-account').disabled = false;
    logoutButton.disabled = false;
    logoutButton.textContent = 'Sign out';
  }
});
$('delete-account').addEventListener('click', async (event) => {
  if (
    !window.confirm(
      `Delete the Palim account for ${currentAccount.email}?\n\nThis permanently deletes your Shelf files, receipts and saved addresses, and revokes agent access.\n\nFiles already in your Kindle library stay there.`,
    )
  )
    return;
  logoutButton.disabled = true;
  await busy(event.currentTarget, async () => {
    await api('/api/account', { method: 'DELETE' });
    showSignedOut();
    feedback($('signin'), 'Account deleted.');
    $('login-email').focus();
  });
  logoutButton.disabled = false;
});
$('retry-startup').addEventListener('click', async (event) => {
  const retry = event.currentTarget;
  await busy(retry, refresh);
  if (document.activeElement !== document.body) return;
  if (!$('startup').hidden) retry.focus();
  else ($('signin').hidden ? $('studio-title') : $('login-email')).focus();
});
$('workspace-subtitle').textContent = 'Opening your workspace…';
$('main-content').setAttribute('aria-busy', 'true');
await refresh();
