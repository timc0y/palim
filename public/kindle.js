/*! UI SDK by Vercel, Apache-2.0. See /ui-sdk-LICENSE.txt. */
import '@ui-sdk/web/button';

const copy = document.querySelector('ui-button');
const button = copy.querySelector('button');
const commands = document.querySelector('.line__commands');
const connect = document.querySelector('.connect');
const status = document.querySelector('#copy-status');
let reset;

copy.addEventListener('action', (event) => {
  event.detail.waitUntil(copyCommands());
});

async function copyCommands() {
  window.clearTimeout(reset);
  button.textContent = 'copying';
  delete button.dataset.result;
  status.textContent = '';
  try {
    await navigator.clipboard.writeText(commands.textContent.trim());
    button.textContent = 'copied';
    button.dataset.result = 'copied';
    status.textContent = 'Both commands copied.';
  } catch {
    if (!connect.open) {
      button.textContent = 'copy';
      status.textContent = 'Copy unavailable. Open connect to copy the commands manually.';
      return;
    }
    const range = document.createRange();
    range.selectNodeContents(commands);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    button.textContent = 'selected';
    button.dataset.result = 'selected';
    status.textContent = 'Both commands selected. Copy them using your device.';
  }
  reset = window.setTimeout(() => {
    button.textContent = 'copy';
    delete button.dataset.result;
  }, 2400);
}
