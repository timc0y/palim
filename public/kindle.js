import { enableMenu } from './menu.js';
document.getElementById('mcp-address').textContent = new URL('/mcp', location.href).href;
document.getElementById('mcp-label').textContent = 'MCP address';
document.querySelector('.plugin-host').hidden = location.origin === 'https://palim.pages.dev';
const connect = document.querySelector('.connect');
const timers = new WeakMap();
let copySequence = 0;
let manualSelection;

for (const button of document.querySelectorAll('button[data-copy]')) {
  const commands = button.closest('.line')?.querySelector('.line__commands');
  if (!commands) continue;
  button.hidden = false;
  button.addEventListener('click', () =>
    copyTarget(button, commands, button.dataset.copyLabel || 'Command'),
  );
}

function fullManualSelection(selection) {
  return (
    manualSelection &&
    selection.rangeCount &&
    selection.getRangeAt(0) === manualSelection.range &&
    manualSelection.range.toString() === manualSelection.text
  );
}

function clearManualSelection() {
  const selection = window.getSelection();
  if (fullManualSelection(selection)) selection.removeAllRanges();
  manualSelection = null;
}

async function copyTarget(button, commands, label) {
  if (button.getAttribute('aria-busy') === 'true') return;
  const session = ++copySequence;
  const focusAtStart = document.activeElement;
  clearManualSelection();
  for (const previous of connect.querySelectorAll('[data-result], [aria-busy="true"]')) {
    window.clearTimeout(timers.get(previous));
    previous.textContent = 'Copy';
    delete previous.dataset.result;
    previous.removeAttribute('aria-busy');
  }
  button.setAttribute('aria-busy', 'true');
  window.clearTimeout(timers.get(button));
  button.textContent = 'Copying…';
  delete button.dataset.result;
  const status = button.closest('.line').querySelector('.line__feedback');
  for (const message of document.querySelectorAll('.line__feedback')) {
    message.classList.add('sr-only');
    message.textContent = '';
  }
  try {
    await navigator.clipboard.writeText(commands.textContent.trim());
    if (session !== copySequence || !connect.open) return;
    button.textContent = 'Copied';
    button.dataset.result = 'copied';
    status.textContent = `${label} copied.`;
  } catch {
    if (session !== copySequence || !connect.open) return;
    if (document.activeElement !== focusAtStart) {
      button.textContent = 'Copy';
      button.removeAttribute('aria-busy');
      status.classList.remove('sr-only');
      status.textContent = 'Couldn’t copy. Try again.';
      return;
    }
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(commands);
    selection.removeAllRanges();
    selection.addRange(range);
    manualSelection = { range, text: range.toString() };
    button.textContent = 'Selected';
    button.dataset.result = 'selected';
    status.classList.remove('sr-only');
    status.textContent = 'Copy unavailable. Copy the selected text manually.';
  }
  button.removeAttribute('aria-busy');
  if (button.dataset.result === 'selected') return;
  timers.set(
    button,
    window.setTimeout(() => {
      button.textContent = 'Copy';
      delete button.dataset.result;
      status.textContent = '';
    }, 2400),
  );
}

document.addEventListener('selectionchange', () => {
  if (!manualSelection) return;
  const selection = window.getSelection();
  if (fullManualSelection(selection)) return;
  manualSelection = null;
  const button = connect.querySelector('[data-result="selected"]');
  if (!button) return;
  button.textContent = 'Copy';
  delete button.dataset.result;
  const status = button.closest('.line').querySelector('.line__feedback');
  status.classList.add('sr-only');
  status.textContent = '';
});

// A quick close and reopen can coalesce into one native toggle event.
function onDisclosureClose(disclosure, onClose) {
  new MutationObserver((changes) => {
    if (changes.some((change) => change.oldValue !== null)) onClose();
  }).observe(disclosure, { attributes: true, attributeFilter: ['open'], attributeOldValue: true });
}

onDisclosureClose(connect, () => {
  copySequence++;
  clearManualSelection();
  for (const button of connect.querySelectorAll('button[data-copy]')) {
    window.clearTimeout(timers.get(button));
    button.textContent = 'Copy';
    button.removeAttribute('aria-busy');
    delete button.dataset.result;
  }
  for (const status of connect.querySelectorAll('.line__feedback')) {
    status.classList.add('sr-only');
    status.textContent = '';
  }
});

const menu = document.querySelector('.home-menu');
onDisclosureClose(menu, () => {
  connect.open = false;
});
enableMenu(menu);
