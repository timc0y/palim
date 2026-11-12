/*
 * Palim landing — the connect command.
 * The page works without this file; it only adds the clipboard action.
 */
const button = document.querySelector('[data-copy]');
const code = document.querySelector('.line__code');

if (button && code) {
  button.addEventListener('click', async () => {
    const text = code.textContent.trim();
    const label = button.textContent;
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = 'copied';
      button.setAttribute('data-copied', '');
    } catch {
      // Clipboard access can be refused. Select the command so it can be
      // copied by hand, and say so.
      const range = document.createRange();
      range.selectNodeContents(code);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      button.textContent = 'selected';
    }
    window.setTimeout(() => {
      button.textContent = label;
      button.removeAttribute('data-copied');
    }, 1800);
  });
}
