// Zoom con rotellina, pizzico (touch), trascinamento e tastiera. Si apre con qualsiasi elemento [data-zoom-src].
export function initZoom() {
  const dialog = document.querySelector<HTMLDialogElement>('[data-zoom-dialog]');
  if (!dialog || dialog.dataset.ready) return;
  dialog.dataset.ready = '1';
  const stage = dialog.querySelector<HTMLElement>('[data-zoom-stage]')!;
  const img = dialog.querySelector<HTMLImageElement>('[data-zoom-img]')!;
  const caption = dialog.querySelector<HTMLElement>('[data-zoom-caption]')!;
  let scale = 1;
  let fit = 1;
  let x = 0;
  let y = 0;
  const pointers = new Map<number, { x: number; y: number }>();
  let pinchDist = 0;

  const apply = () => {
    img.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
  };
  const center = () => {
    const r = stage.getBoundingClientRect();
    fit = Math.min(r.width / img.naturalWidth, r.height / img.naturalHeight);
    scale = fit;
    x = -(img.naturalWidth * scale) / 2;
    y = -(img.naturalHeight * scale) / 2;
    apply();
  };
  const zoomAt = (factor: number, cx?: number, cy?: number) => {
    const r = stage.getBoundingClientRect();
    const px = (cx ?? r.left + r.width / 2) - r.left - r.width / 2;
    const py = (cy ?? r.top + r.height / 2) - r.top - r.height / 2;
    const next = Math.min(Math.max(scale * factor, fit), fit * 8);
    const k = next / scale;
    x = px - (px - x) * k;
    y = py - (py - y) * k;
    scale = next;
    apply();
  };

  document.addEventListener('click', (e) => {
    const trigger = (e.target as HTMLElement).closest<HTMLElement>('[data-zoom-src]');
    if (!trigger) return;
    e.preventDefault();
    img.src = trigger.dataset.zoomSrc!;
    img.alt = trigger.dataset.zoomAlt ?? '';
    caption.textContent = trigger.dataset.zoomAlt ?? '';
    dialog.showModal();
    if (img.complete) center();
    else img.onload = center;
  });
  dialog.querySelector('[data-zoom-in]')!.addEventListener('click', () => zoomAt(1.5));
  dialog.querySelector('[data-zoom-out]')!.addEventListener('click', () => zoomAt(1 / 1.5));
  dialog.querySelector('[data-zoom-reset]')!.addEventListener('click', center);
  dialog.querySelector('[data-zoom-close]')!.addEventListener('click', () => dialog.close());
  stage.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY);
    },
    { passive: false },
  );
  stage.addEventListener('pointerdown', (e) => {
    stage.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  });
  stage.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = Array.from(pointers.values());
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist) zoomAt(d / pinchDist, (a.x + b.x) / 2, (a.y + b.y) / 2);
      pinchDist = d;
      return;
    }
    x += e.clientX - prev.x;
    y += e.clientY - prev.y;
    apply();
  });
  const up = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchDist = 0;
  };
  stage.addEventListener('pointerup', up);
  stage.addEventListener('pointercancel', up);
  dialog.addEventListener('keydown', (e) => {
    if (e.key === '+' || e.key === '=') zoomAt(1.4);
    else if (e.key === '-') zoomAt(1 / 1.4);
    else if (e.key === '0') center();
    else if (e.key.startsWith('Arrow')) {
      const step = 60;
      if (e.key === 'ArrowLeft') x += step;
      if (e.key === 'ArrowRight') x -= step;
      if (e.key === 'ArrowUp') y += step;
      if (e.key === 'ArrowDown') y -= step;
      apply();
    }
  });
  window.addEventListener('resize', () => dialog.open && center());
}
