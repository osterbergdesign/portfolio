/**
 * The light/dark toggle in the header. Without JavaScript the button stays hidden and the site
 * simply follows the system setting. A choice made here is remembered in this browser.
 */
const root = document.documentElement;
const button = document.querySelector('.theme-toggle');
const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
const COLORS = { light: '#FAF8F3', dark: '#15171C' };

const current = () => root.dataset.theme || (systemDark.matches ? 'dark' : 'light');

function sync() {
  const theme = current();
  button?.setAttribute('aria-pressed', String(theme === 'dark'));
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', COLORS[theme]));
}

function choose(theme, from) {
  const apply = () => {
    root.dataset.theme = theme;
    try {
      localStorage.setItem('theme', theme);
    } catch {}
    sync();
  };
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!document.startViewTransition || reduced || !from) return apply();

  // The new colours spread out from the button as a growing circle.
  const r = from.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  const transition = document.startViewTransition(apply);
  transition.ready
    .then(() =>
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 700, easing: 'cubic-bezier(0.7, 0, 0.2, 1)', pseudoElement: '::view-transition-new(root)' },
      ),
    )
    .catch(() => {});
}

if (button) {
  button.hidden = false;
  button.addEventListener('click', () => choose(current() === 'dark' ? 'light' : 'dark', button));
  // Follow the system setting while no choice has been made here.
  systemDark.addEventListener?.('change', () => {
    if (!root.dataset.theme) sync();
  });
  sync();
}
