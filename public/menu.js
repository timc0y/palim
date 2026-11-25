export function enableMenu(menu) {
  menu.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !event.repeat && menu.open) {
      const disclosure = event.target.closest('details[open]') || menu;
      disclosure.open = false;
      disclosure.querySelector(':scope > summary').focus();
    }
  });
  document.addEventListener('click', (event) => {
    if (menu.open && !menu.contains(event.target)) menu.open = false;
  });
  menu.addEventListener('focusout', (event) => {
    if (event.relatedTarget && !menu.contains(event.relatedTarget)) menu.open = false;
  });
}
