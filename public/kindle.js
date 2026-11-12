/*
 * Palim landing — the reading machine.
 * Page changes are button-driven. Nothing moves on its own: WCAG 2.2.2
 * (Pause, Stop, Hide) means an auto-advancing page needs a control, and the
 * page has no room for one without adding the copy the owner asked to avoid.
 */
const pages = Array.from(document.querySelectorAll('[data-page]'));
const screen = document.querySelector('.machine__screen');
const progress = document.querySelector('.ink-progress');
const ticks = Array.from(document.querySelectorAll('.machine__ticks i'));
const body = document.querySelector('.machine__body');
const machine = document.querySelector('.machine');
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

let current = 0;

function show(index) {
  if (!pages.length) return;
  current = (index + pages.length) % pages.length;
  pages.forEach((page, i) => page.classList.toggle('is-current', i === current));
  if (progress) {
    const value = Math.round(((current + 1) / pages.length) * 100);
    progress.style.setProperty('--p', value + '%');
  }
  ticks.forEach((tick, i) => tick.classList.toggle('is-current', i === current));
  if (screen && !reduced.matches) {
    screen.classList.remove('is-refreshing');
    void screen.offsetWidth;
    screen.classList.add('is-refreshing');
    // The class drives a one-shot CSS animation; drop it when it ends.
    window.setTimeout(() => screen.classList.remove('is-refreshing'), 620);
  }
}

document.querySelectorAll('[data-next]').forEach((button) => {
  button.addEventListener('click', () => show(current + 1));
});

document.querySelectorAll('[data-prev]').forEach((button) => {
  button.addEventListener('click', () => show(current - 1));
});

/* A small tilt, so the machine feels held rather than pasted. */
if (machine && !reduced.matches && window.matchMedia('(pointer: fine)').matches) {
  let frame = 0;
  machine.addEventListener('pointermove', (event) => {
    if (frame) return;
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      const box = machine.getBoundingClientRect();
      const x = (event.clientX - box.left) / box.width - 0.5;
      const y = (event.clientY - box.top) / box.height - 0.5;
      body.style.setProperty('--tilt-y', (x * 6).toFixed(2) + 'deg');
      body.style.setProperty('--tilt-x', (-y * 6).toFixed(2) + 'deg');
    });
  });

  machine.addEventListener('pointerleave', () => {
    body.style.setProperty('--tilt-y', '0deg');
    body.style.setProperty('--tilt-x', '0deg');
  });
}

show(0);
