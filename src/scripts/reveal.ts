// Scroll-reveal + count-up. One IntersectionObserver for the whole page.
const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

function countUp(el: HTMLElement) {
  const to = Number(el.dataset.count);
  const suffix = el.dataset.suffix ?? '';
  if (reduce()) { el.textContent = to + suffix; return; }
  const ms = 900;
  const from = 0.8;   // never show a number that is far from the real one
  const t0 = performance.now();
  const frame = (t: number) => {
    const p = Math.min(1, (t - t0) / ms);
    el.textContent = Math.round((from + (1 - from) * easeOut(p)) * to) + suffix;
    if (p < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

export function initReveal() {
  const targets = document.querySelectorAll<HTMLElement>('.reveal:not(.is-in), [data-count]:not(.is-in), [data-stagger]:not(.is-in)');
  if (!targets.length) return;
  if (!('IntersectionObserver' in window)) { targets.forEach((t) => t.classList.add('is-in')); return; }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const el = e.target as HTMLElement;
      el.classList.add('is-in');
      // ריק או לא־מספרי: זו לא ספירה, וזה גם לא באג בקומפוננטה — פשוט לא נוגעים בטקסט
      if (el.dataset.count && Number.isFinite(Number(el.dataset.count))) countUp(el);
      if (el.dataset.stagger !== undefined) {
        const step = Number(el.dataset.stagger) || 80;
        Array.from(el.children).forEach((c, i) => {
          (c as HTMLElement).style.transitionDelay = reduce() ? '0ms' : `${i * step}ms`;
          c.classList.add('is-in');
        });
      }
      io.unobserve(el);
    }
  }, { threshold: 0, rootMargin: '0px 0px -12% 0px' });
  targets.forEach((t) => io.observe(t));
}
