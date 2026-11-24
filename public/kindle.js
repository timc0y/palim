/*! UI SDK by Vercel, Apache-2.0. See /ui-sdk-LICENSE.txt. */
import '@ui-sdk/web/button';

const connect = document.querySelector('.connect');
const status = document.querySelector('#copy-status');
const timers = new WeakMap();

for (const copy of document.querySelectorAll('ui-button[data-copy]')) {
  const button = copy.querySelector('button');
  const commands = copy.closest('.line')?.querySelector('.line__commands');
  if (!button || !commands) continue;
  const label = copy.dataset.copyLabel || 'Command';
  copy.addEventListener('action', (event) => {
    event.detail.waitUntil(copyTarget(button, commands, label));
  });
}

async function copyTarget(button, commands, label) {
  window.clearTimeout(timers.get(button));
  button.textContent = 'copying';
  delete button.dataset.result;
  status.textContent = '';
  try {
    await navigator.clipboard.writeText(commands.textContent.trim());
    button.textContent = 'copied';
    button.dataset.result = 'copied';
    status.textContent = `${label} copied.`;
  } catch {
    if (connect && !connect.open) {
      button.textContent = 'copy';
      status.textContent = 'Copy unavailable. Open connect to copy manually.';
      return;
    }
    const range = document.createRange();
    range.selectNodeContents(commands);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    button.textContent = 'selected';
    button.dataset.result = 'selected';
    status.textContent = `${label} selected. Copy using your device.`;
  }
  timers.set(
    button,
    window.setTimeout(() => {
      button.textContent = 'copy';
      delete button.dataset.result;
    }, 2400),
  );
}
