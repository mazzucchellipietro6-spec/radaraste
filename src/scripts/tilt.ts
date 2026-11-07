// Schede che si inclinano in 3D seguendo il puntatore, con un riflesso di luce come sul marmo lucidato.
// Solo con mouse (non sui touch) e mai con "riduci animazioni".
export function initTilt(root: ParentNode = document) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  root.querySelectorAll<HTMLElement>('[data-tilt]').forEach((el) => {
    if (el.dataset.tiltReady) return;
    el.dataset.tiltReady = '1';
    let raf = 0;
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.setProperty('--rx', `${(-y * 6).toFixed(2)}deg`);
        el.style.setProperty('--ry', `${(x * 8).toFixed(2)}deg`);
        el.style.setProperty('--mx', `${((x + 0.5) * 100).toFixed(1)}%`);
        el.style.setProperty('--my', `${((y + 0.5) * 100).toFixed(1)}%`);
        el.classList.add('is-tilting');
      });
    });
    el.addEventListener('pointerleave', () => {
      cancelAnimationFrame(raf);
      el.classList.remove('is-tilting');
      el.style.removeProperty('--rx');
      el.style.removeProperty('--ry');
    });
  });
}
