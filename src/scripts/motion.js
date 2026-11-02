/**
 * Scroll motion. Everything here is decoration: the pages are complete without it, and it stays
 * off for visitors who have asked their system for reduced motion.
 *
 *   data-reveal="rise | wipe | roll"   animates the element in once, when it scrolls into view
 *                                      (the looks are defined under "Motion" in global.css)
 *   data-progress="exit"               sets --p from 0 to 1 while the element scrolls off the top
 *   data-progress="through"            sets --p from 0 to 1 over the whole pass through the window
 *   .progress-bar                      gets --p for how far down the page you are
 */
const root = document.documentElement;
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (reduced || window.__motionOff) {
  root.classList.remove('motion');
} else {
  window.__motion = true;
  root.classList.add('motion');

  // ---- Reveals ----
  // Checked on scroll rather than with IntersectionObserver: Chrome counts an element hidden by
  // clip-path as not visible at all, so the "wipe" reveals would never start.
  const STAGGER = 90; // ms between items that come into view together
  const DURATION = 1400; // longest reveal transition in global.css
  let pending = Array.from(document.querySelectorAll('[data-reveal]'));

  const reveal = (vh) => {
    let n = 0;
    pending = pending.filter((el) => {
      if (el.getBoundingClientRect().top > vh * 0.92) return true; // not reached yet
      const delay = Math.min(n++, 6) * STAGGER;
      el.style.setProperty('--delay', `${delay}ms`);
      el.classList.add('is-in');
      // Once the reveal has played, hover effects get their normal, undelayed timing back.
      setTimeout(() => el.classList.add('is-done'), delay + DURATION);
      return false;
    });
  };

  // ---- Scroll-linked values ----
  const tracked = Array.from(document.querySelectorAll('[data-progress]'));
  const bar = document.querySelector('.progress-bar');
  const clamp = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  let queued = false;

  const update = () => {
    queued = false;
    const vh = window.innerHeight;
    if (pending.length) reveal(vh);
    for (const el of tracked) {
      const r = el.getBoundingClientRect();
      if (r.bottom < -vh || r.top > vh * 2) continue; // far off screen
      const p = el.dataset.progress === 'exit' ? -r.top / Math.max(r.height, 1) : (vh - r.top) / (vh + r.height);
      el.style.setProperty('--p', clamp(p).toFixed(4));
    }
    if (bar) {
      const max = root.scrollHeight - vh;
      bar.style.setProperty('--p', max > 0 ? clamp(window.scrollY / max).toFixed(4) : '0');
    }
  };
  const queue = () => {
    if (!queued) {
      queued = true;
      requestAnimationFrame(update);
    }
  };

  window.addEventListener('scroll', queue, { passive: true });
  window.addEventListener('resize', queue);
  // Layout changes without scrolling (images and fonts loading, the project filter) can also
  // bring new elements into view.
  if ('ResizeObserver' in window) new ResizeObserver(queue).observe(document.body);
  update();
}
