// Invio dei moduli con messaggi tradotti, validazione accessibile e Turnstile caricato solo quando serve.
type Result = { ok: boolean; code?: string; message?: string; errors?: Record<string, string>; redirect?: string };

let turnstileLoading: Promise<void> | null = null;
function loadTurnstile() {
  if (!turnstileLoading) {
    turnstileLoading = new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => resolve();
      document.head.appendChild(s);
    });
  }
  return turnstileLoading;
}

function setError(form: HTMLFormElement, name: string, msg: string) {
  const el = form.querySelector<HTMLElement>(`[data-error-for="${name}"]`);
  const input = form.querySelector<HTMLElement>(`[name="${name}"]`);
  if (el) {
    el.textContent = msg;
    el.hidden = !msg;
  }
  if (input) input.setAttribute('aria-invalid', msg ? 'true' : 'false');
}

function validate(form: HTMLFormElement) {
  const d = form.dataset;
  let first: HTMLElement | null = null;
  form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select').forEach((el) => {
    if (!el.name || el.type === 'hidden' || el.closest('.hp')) return;
    let msg = '';
    if (el instanceof HTMLInputElement && el.type === 'checkbox') {
      if (el.required && !el.checked) msg = el.name === 'privacy' ? d.msgPrivacy! : d.msgRequired!;
    } else if (el.required && !el.value.trim()) msg = d.msgRequired!;
    else if (el instanceof HTMLInputElement && el.type === 'email' && el.value && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(el.value.trim()))
      msg = d.msgEmail!;
    setError(form, el.name, msg);
    if (msg && !first) first = el;
  });
  (first as HTMLElement | null)?.focus();
  return !first;
}

function setStatus(form: HTMLFormElement, kind: 'success' | 'error' | 'info', text: string) {
  const box = form.querySelector<HTMLElement>('[data-form-status]');
  if (!box) return;
  box.dataset.kind = kind;
  box.textContent = text;
  box.hidden = false;
}

function init(form: HTMLFormElement) {
  const ts = form.querySelector<HTMLInputElement>('[data-ts]');
  if (ts) ts.value = String(Date.now());
  const slot = form.querySelector<HTMLElement>('.cf-turnstile-slot');
  if (slot) {
    const render = async () => {
      await loadTurnstile();
      const w = window as unknown as { turnstile?: { render: (el: HTMLElement, o: Record<string, unknown>) => void } };
      if (w.turnstile && !slot.dataset.rendered) {
        slot.dataset.rendered = '1';
        w.turnstile.render(slot, { sitekey: slot.dataset.sitekey, language: slot.dataset.language, theme: 'light', appearance: 'interaction-only' });
      }
    };
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        render();
      }
    });
    io.observe(form);
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validate(form)) return;
    const btn = form.querySelector<HTMLButtonElement>('[data-submit]');
    const label = btn?.textContent ?? '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = form.dataset.msgSending ?? '…';
    }
    try {
      const res = await fetch(form.action, { method: 'POST', body: new FormData(form), headers: { accept: 'application/json' } });
      const data: Result = await res.json().catch(() => ({ ok: false }));
      if (data.ok) {
        if (data.redirect) {
          location.href = data.redirect;
          return;
        }
        setStatus(form, 'success', data.message || form.dataset.msgSuccess!);
        form.querySelectorAll<HTMLElement>('.field, .cf-turnstile-slot, [data-submit]').forEach((el) => (el.hidden = true));
        form.dispatchEvent(new CustomEvent('wc:success', { detail: data, bubbles: true }));
      } else {
        if (data.errors) for (const [k, v] of Object.entries(data.errors)) setError(form, k, form.dataset[`msg${v[0].toUpperCase()}${v.slice(1)}`] ?? v);
        const map: Record<string, string | undefined> = {
          rate_limited: form.dataset.msgRatelimit,
          spam: form.dataset.msgSpam,
          not_configured: form.dataset.msgNotconfigured,
        };
        setStatus(form, 'error', data.message || map[data.code ?? ''] || form.dataset.msgError!);
      }
    } catch {
      setStatus(form, 'error', form.dataset.msgError!);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = label;
      }
    }
  });
}

document.querySelectorAll<HTMLFormElement>('form[data-wc-form]').forEach(init);
