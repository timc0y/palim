const mcpAddress = document.getElementById('mcp-address');
const mcpLabel = document.getElementById('mcp-label');
const pluginHost = document.querySelector('.plugin-host');
if (mcpAddress) mcpAddress.textContent = new URL('/mcp', location.href).href;
if (mcpLabel) mcpLabel.textContent = 'MCP address';
if (pluginHost) pluginHost.hidden = location.origin === 'https://palim.pages.dev';

const dock = document.getElementById('mcp-dock');
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

function isVisible(element) {
  const details = element.closest('details');
  return !details || details.open;
}

async function copyTarget(button, commands, label) {
  if (button.getAttribute('aria-busy') === 'true') return;
  const session = ++copySequence;
  const focusAtStart = document.activeElement;
  clearManualSelection();
  for (const previous of document.querySelectorAll('[data-result], [aria-busy="true"]')) {
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
    if (session !== copySequence || !isVisible(button)) return;
    button.textContent = 'Copied';
    button.dataset.result = 'copied';
    status.textContent = `${label} copied.`;
  } catch {
    if (session !== copySequence || !isVisible(button)) return;
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
  const button = document.querySelector('[data-result="selected"]');
  if (!button) return;
  button.textContent = 'Copy';
  delete button.dataset.result;
  const status = button.closest('.line').querySelector('.line__feedback');
  status.classList.add('sr-only');
  status.textContent = '';
});

function resetScope(scope) {
  copySequence++;
  clearManualSelection();
  for (const button of scope.querySelectorAll('button[data-copy]')) {
    window.clearTimeout(timers.get(button));
    button.textContent = 'Copy';
    button.removeAttribute('aria-busy');
    delete button.dataset.result;
  }
  for (const status of scope.querySelectorAll('.line__feedback')) {
    status.classList.add('sr-only');
    status.textContent = '';
  }
}

if (connect) {
  new MutationObserver((changes) => {
    if (changes.some((change) => change.oldValue !== null)) resetScope(connect);
  }).observe(connect, { attributes: true, attributeFilter: ['open'], attributeOldValue: true });

  connect.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || event.repeat || !connect.open) return;
    event.preventDefault();
    connect.open = false;
    connect.querySelector('summary')?.focus();
  });
}

if (dock) {
  for (const trigger of document.querySelectorAll('a[href="#mcp-dock"]')) {
    trigger.addEventListener('click', () => {
      window.setTimeout(
        () => document.getElementById('copy-mcp')?.focus({ preventScroll: true }),
        80,
      );
    });
  }
}
