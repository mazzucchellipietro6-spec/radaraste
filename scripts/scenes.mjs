// Illustrazioni per i segnaposto delle fotografie: scene stilizzate e sobrie (cave, colline, coste,
// città, laghi, vulcani, interni) nei toni del marchio. Servono solo finché non arrivano le foto vere.

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
function noise1(seed) {
  const r = rng(seed);
  const pts = Array.from({ length: 64 }, () => r() * 2 - 1);
  const sm = (t) => t * t * (3 - 2 * t);
  const n = (x) => {
    const i = Math.floor(x);
    const f = x - i;
    const a = pts[((i % 64) + 64) % 64];
    const b = pts[(((i + 1) % 64) + 64) % 64];
    return a + (b - a) * sm(f);
  };
  return (x, oct = 4) => {
    let s = 0;
    let amp = 0.5;
    let f = 1;
    for (let k = 0; k < oct; k++) {
      s += amp * n(x * f + k * 13.7);
      f *= 2.1;
      amp *= 0.5;
    }
    return s;
  };
}
const f1 = (n) => n.toFixed(1);

/** Profilo di una cresta montuosa come path chiuso verso il basso. */
function ridge(w, h, base, amp, freq, seed, oct = 5) {
  const n = noise1(seed);
  const step = Math.max(4, Math.round(w / 220));
  let d = `M0 ${h} L0 ${f1(base + n(0, oct) * amp)}`;
  for (let x = step; x <= w + step; x += step) d += ` L${x} ${f1(base + n((x / w) * freq, oct) * amp)}`;
  return `${d} L${w} ${h} Z`;
}
/** Colline morbide (somma di sinusoidi). */
function hills(w, h, base, amp, seed) {
  const r = rng(seed);
  const p = [r() * 6, r() * 6, r() * 6];
  const y = (x) => base + amp * (Math.sin(x / w * 3.1 + p[0]) * 0.55 + Math.sin(x / w * 7.3 + p[1]) * 0.3 + Math.sin(x / w * 13 + p[2]) * 0.15);
  let d = `M0 ${h} L0 ${f1(y(0))}`;
  for (let x = 8; x <= w + 8; x += 8) d += ` L${x} ${f1(y(x))}`;
  return { d: `${d} L${w} ${h} Z`, y };
}

const SKIES = {
  dawn: ['#e6ddd0', '#f4ece0', '#f7efe2'],
  day: ['#dfe2df', '#eef0ec', '#f6f4ee'],
  warm: ['#e9dccb', '#f2e6d4', '#f7eee2'],
  dusk: ['#bfb6ae', '#e2cfb8', '#f0dcc0'],
  night: ['#1d1e22', '#2b2c31', '#3a3a3f'],
};
function sky(w, h, kind = 'dawn', sun = null) {
  const [a, b, c] = SKIES[kind];
  return `<defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="0.6" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient>
    <radialGradient id="sun" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#fbf3e4" stop-opacity="0.95"/><stop offset="0.35" stop-color="#f6e6cc" stop-opacity="0.45"/><stop offset="1" stop-color="#f6e6cc" stop-opacity="0"/></radialGradient>
    <linearGradient id="haze" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6f1e8" stop-opacity="0"/><stop offset="1" stop-color="#f6f1e8" stop-opacity="0.55"/></linearGradient>
    <filter id="soft"><feGaussianBlur stdDeviation="${f1(Math.max(w, h) / 220)}"/></filter>
    <filter id="blur2"><feGaussianBlur stdDeviation="${f1(Math.max(w, h) / 90)}"/></filter>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#sky)"/>
  ${sun ? `<circle cx="${f1(sun[0] * w)}" cy="${f1(sun[1] * h)}" r="${f1(sun[2] * w)}" fill="url(#sun)"/>` : ''}`;
}

function cypress(x, yBase, hgt, color) {
  const wd = hgt * 0.16;
  return `<path d="M${f1(x)} ${f1(yBase - hgt)} C${f1(x + wd)} ${f1(yBase - hgt * 0.7)} ${f1(x + wd * 0.9)} ${f1(yBase - hgt * 0.15)} ${f1(x + wd * 0.4)} ${f1(yBase)} L${f1(x - wd * 0.4)} ${f1(yBase)} C${f1(x - wd * 0.9)} ${f1(yBase - hgt * 0.15)} ${f1(x - wd)} ${f1(yBase - hgt * 0.7)} ${f1(x)} ${f1(yBase - hgt)} Z" fill="${color}"/>`;
}

// ------------------------------------------------------------------ scene
const scenes = {
  quarry(w, h, seed, o = {}) {
    // Alpi Apuane: creste aguzze a strati nella nebbia, con le parti alte chiare come il marmo
    // e qualche ravaneto (colata di detriti bianchi). Volutamente essenziale, quasi una stampa.
    const r = rng(seed);
    const dusk = !!o.dusk;
    let s = sky(w, h, dusk ? 'dusk' : 'dawn', dusk ? [0.3, 0.42, 0.34] : [0.78, 0.22, 0.3]);
    const layers = dusk
      ? [['#d3c6b8', '#c7b9a9'], ['#b9ada0', '#9d9186'], ['#f3efe9', '#776f66'], ['#5f5953', '#4f4a45']]
      : [['#dcd6cb', '#cfc8bc'], ['#c7c0b4', '#aaa398'], ['#f3f0ea', '#8f897e'], ['#7a756b', '#6a665e']];
    s += `<defs>${layers.map(([a, b], i) => `<linearGradient id="m${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="${i === 2 ? 0.45 : 1}" stop-color="${b}"/></linearGradient>`).join('')}
      <linearGradient id="fog" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4eee4" stop-opacity="0"/><stop offset="0.5" stop-color="#f4eee4" stop-opacity="0.8"/><stop offset="1" stop-color="#f4eee4" stop-opacity="0"/></linearGradient>
      <linearGradient id="scree" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6f4ef" stop-opacity="0.95"/><stop offset="1" stop-color="#f6f4ef" stop-opacity="0"/></linearGradient>
    </defs>`;
    const jag = (base, amp, freq, sd, peak) => {
      const n = noise1(sd);
      return (x) => base - (peak ? Math.exp(-Math.pow((x / w - peak[0]) / peak[1], 2)) * peak[2] * h : 0) + n((x / w) * freq, 7) * amp + Math.abs(n((x / w) * freq * 3.1 + 9, 3)) * amp * 0.5;
    };
    const path = (fy) => {
      const st = Math.max(3, Math.round(w / 500));
      let d = `M0 ${h}`;
      for (let x = 0; x <= w + st; x += st) d += ` L${x} ${f1(fy(x))}`;
      return `${d} L${w} ${h} Z`;
    };
    const peak = 0.58 + (r() - 0.5) * 0.1;
    const L = [
      jag(h * 0.42, h * 0.06, 5, seed + 1),
      jag(h * 0.5, h * 0.08, 4, seed + 2, [0.2, 0.12, 0.12]),
      jag(h * 0.62, h * 0.07, 3.5, seed + 3, [peak, 0.16, 0.36]),
      jag(h * 0.88, h * 0.04, 3, seed + 4),
    ];
    L.forEach((fy, i) => {
      s += `<path d="${path(fy)}" fill="url(#m${i})"/>`;
      if (i === 2) {
        // ravaneti e fronti di cava: strisce chiare che scendono dai versanti
        // gradoni appena accennati vicino alla cima
        for (let k = 0; k < 6; k++) {
          const y = fy(w * peak) + h * (0.05 + k * 0.022);
          const hw = w * (0.05 + k * 0.012);
          s += `<line x1="${f1(w * peak - hw)}" y1="${f1(y)}" x2="${f1(w * peak + hw * 0.8)}" y2="${f1(y)}" stroke="#c9c3b8" stroke-width="${f1(h / 700)}" opacity="0.7"/>`;
        }
      }
      if (i < 3) s += `<rect y="${f1(fy(w * 0.5) - h * 0.02)}" width="${w}" height="${f1(h * 0.14)}" fill="url(#fog)" opacity="${i === 2 ? 0.9 : 0.7}"/>`;
    });
    s += `<rect width="${w}" height="${h}" fill="url(#haze)" opacity="0.25"/>`;
    return s;
  },

  hills(w, h, seed) {
    const r = rng(seed);
    let s = sky(w, h, 'warm', [0.3, 0.28, 0.25]);
    const layers = [
      [0.5, 0.06, '#d7d3c1'],
      [0.58, 0.07, '#bfbea6'],
      [0.68, 0.08, '#a3a68b'],
      [0.8, 0.07, '#888d71'],
    ];
    layers.forEach(([b, a, c], i) => {
      const hl = hills(w, h, h * b, h * a, seed + i * 7);
      s += `<path d="${hl.d}" fill="${c}"/>`;
      if (i === 1 || i === 2) {
        const n = i === 1 ? 7 : 5;
        const x0 = w * (0.1 + r() * 0.5);
        for (let k = 0; k < n; k++) {
          const x = x0 + k * w * (i === 1 ? 0.018 : 0.03);
          s += cypress(x, hl.y(x) + 2, h * (i === 1 ? 0.07 : 0.12), i === 1 ? '#7f846a' : '#5e644f');
        }
        if (i === 2) {
          const fx = w * (0.62 + r() * 0.2);
          const fy = hl.y(fx);
          s += `<rect x="${f1(fx)}" y="${f1(fy - h * 0.05)}" width="${f1(w * 0.05)}" height="${f1(h * 0.05)}" fill="#e3d7c2"/><polygon points="${f1(fx - w * 0.004)},${f1(fy - h * 0.05)} ${f1(fx + w * 0.025)},${f1(fy - h * 0.075)} ${f1(fx + w * 0.054)},${f1(fy - h * 0.05)}" fill="#b98f73"/>`;
        }
      }
    });
    // filari di vigna in primo piano
    for (let k = 0; k < 14; k++) s += `<line x1="${f1(-w * 0.1 + k * w * 0.09)}" y1="${f1(h)}" x2="${f1(w * 0.3 + k * w * 0.05)}" y2="${f1(h * 0.86)}" stroke="#737a5f" stroke-width="${f1(w / 500)}" opacity="0.6"/>`;
    return s;
  },

  coast(w, h, seed, o = {}) {
    const r = rng(seed);
    let s = sky(w, h, 'day', [0.66, 0.3, 0.2]);
    const hz = h * 0.55;
    s += `<rect y="${f1(hz)}" width="${w}" height="${f1(h - hz)}" fill="#a9b6ba"/>`;
    s += `<rect y="${f1(hz)}" width="${w}" height="${f1((h - hz) * 0.5)}" fill="#c2cccf" opacity="0.6"/>`;
    for (let k = 0; k < 40; k++) {
      const y = hz + (h - hz) * r();
      const x = w * r();
      s += `<line x1="${f1(x)}" y1="${f1(y)}" x2="${f1(x + w * (0.02 + r() * 0.06))}" y2="${f1(y)}" stroke="#eef1f0" stroke-width="${f1(w / 1400)}" opacity="${(0.25 + r() * 0.4).toFixed(2)}"/>`;
    }
    const left = o.side !== 'right';
    // scogliera
    const n = noise1(seed + 3);
    let d = left ? `M0 ${h} L0 ${f1(h * 0.3)}` : `M${w} ${h} L${w} ${f1(h * 0.3)}`;
    for (let t = 0; t <= 1.0001; t += 0.02) {
      const x = left ? w * 0.48 * t : w - w * 0.48 * t;
      const y = h * 0.3 + h * 0.62 * Math.pow(t, 1.6) + n(t * 4) * h * 0.05;
      d += ` L${f1(x)} ${f1(y)}`;
    }
    s += `<path d="${d} L${left ? 0 : w} ${h} Z" fill="#b4ab9c"/>`;
    if (o.houses) {
      const pal = ['#e6d3b6', '#d9b9a1', '#e8dcc6', '#cfb79d', '#e2c9a8'];
      for (let k = 0; k < 26; k++) {
        const t = r() * 0.85;
        const x = left ? w * 0.42 * t : w - w * 0.42 * t;
        const y = h * 0.32 + h * 0.6 * Math.pow(t, 1.6) - h * 0.02 - r() * h * 0.08;
        const bw = w * (0.018 + r() * 0.018);
        s += `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(bw)}" height="${f1(bw * (1 + r()))}" fill="${pal[k % pal.length]}"/><rect x="${f1(x + bw * 0.3)}" y="${f1(y + bw * 0.3)}" width="${f1(bw * 0.18)}" height="${f1(bw * 0.25)}" fill="#7d7468" opacity="0.6"/>`;
      }
    }
    if (o.stacks) {
      // faraglioni
      [[0.62, 0.16], [0.72, 0.21], [0.8, 0.13]].forEach(([x, hh], k) => {
        const cx = w * x;
        const bw = w * (0.05 + k * 0.01);
        s += `<path d="M${f1(cx - bw)} ${f1(hz + h * 0.03)} C${f1(cx - bw)} ${f1(hz - h * hh)} ${f1(cx + bw * 0.6)} ${f1(hz - h * hh * 1.1)} ${f1(cx + bw)} ${f1(hz + h * 0.03)} Z" fill="${k === 1 ? '#9b9282' : '#aaa190'}"/>`;
      });
    }
    if (o.boat) s += `<path d="M${f1(w * 0.58)} ${f1(h * 0.78)} l${f1(w * 0.08)} 0 l${f1(-w * 0.01)} ${f1(h * 0.015)} l${f1(-w * 0.06)} 0 Z" fill="#f4f1ea"/>`;
    return s;
  },

  sea(w, h, seed, o = {}) {
    const r = rng(seed);
    let s = sky(w, h, o.night ? 'dusk' : 'dawn', [0.5, 0.42, 0.3]);
    const hz = h * 0.6;
    if (o.volcano) {
      s += `<path d="M${f1(w * 0.42)} ${f1(hz)} L${f1(w * 0.6)} ${f1(h * 0.33)} L${f1(w * 0.66)} ${f1(h * 0.32)} L${f1(w * 0.88)} ${f1(hz)} Z" fill="#b9b2a8"/>`;
      s += `<ellipse cx="${f1(w * 0.66)}" cy="${f1(h * 0.24)}" rx="${f1(w * 0.07)}" ry="${f1(h * 0.05)}" fill="#ece6dc" filter="url(#blur2)" opacity="0.8"/>`;
    }
    if (o.land) s += `<path d="${ridge(w, h, hz - h * 0.03, h * 0.025, 3, seed + 4, 3)}" fill="#c3bcb0"/>`;
    s += `<rect y="${f1(hz)}" width="${w}" height="${f1(h - hz)}" fill="#aab6b9"/>`;
    s += `<defs><linearGradient id="glint" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f1ea" stop-opacity="0.55"/><stop offset="1" stop-color="#f4f1ea" stop-opacity="0"/></linearGradient></defs>`;
    s += `<polygon points="${f1(w * 0.47)},${f1(hz)} ${f1(w * 0.53)},${f1(hz)} ${f1(w * 0.6)},${h} ${f1(w * 0.4)},${h}" fill="url(#glint)" opacity="0.6"/>`;
    for (let k = 0; k < 60; k++) {
      const y = hz + (h - hz) * Math.pow(r(), 1.4);
      const x = w * (0.3 + r() * 0.4);
      s += `<line x1="${f1(x)}" y1="${f1(y)}" x2="${f1(x + w * (0.01 + r() * 0.05))}" y2="${f1(y)}" stroke="#f6f4ef" stroke-width="${f1(w / 1500)}" opacity="${(0.2 + r() * 0.5).toFixed(2)}"/>`;
    }
    if (o.city) for (let k = 0; k < 18; k++) {
      const x = w * (0.02 + k * 0.022);
      const bh = h * (0.03 + r() * 0.05);
      s += `<rect x="${f1(x)}" y="${f1(hz - bh)}" width="${f1(w * 0.02)}" height="${f1(bh)}" fill="#cfc5b4"/>`;
    }
    return s;
  },

  city(w, h, seed, o = {}) {
    const r = rng(seed);
    let s = sky(w, h, 'warm', [0.78, 0.3, 0.24]);
    if (o.mountains) {
      // Apuane dietro la città: cime chiare come il marmo
      s += `<defs><linearGradient id="apu" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f3f0ea"/><stop offset="0.5" stop-color="#c9c2b6"/></linearGradient></defs>`;
      s += `<path d="${ridge(w, h, h * 0.3, h * 0.1, 4, seed + 4, 7)}" fill="url(#apu)"/>`;
      s += `<rect y="${f1(h * 0.36)}" width="${w}" height="${f1(h * 0.2)}" fill="url(#haze)" opacity="0.8"/>`;
    }
    s += `<path d="${ridge(w, h, h * 0.5, h * 0.06, 2, seed + 5, 3)}" fill="#ddd4c4"/>`;
    const base = h * 0.7;
    // file di edifici
    for (let row = 0; row < 2; row++) {
      let x = -w * 0.02;
      while (x < w) {
        const bw = w * (0.04 + r() * 0.06);
        const bh = h * (row ? 0.08 + r() * 0.08 : 0.12 + r() * 0.12);
        const y = base + row * h * 0.08 - bh;
        s += `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(bw)}" height="${f1(bh + h)}" fill="${row ? '#c9bca5' : '#d8cdb9'}"/>`;
        s += `<polygon points="${f1(x)},${f1(y)} ${f1(x + bw / 2)},${f1(y - bw * 0.18)} ${f1(x + bw)},${f1(y)}" fill="${row ? '#b59c82' : '#c6ae94'}"/>`;
        for (let k = 0; k < 3; k++) s += `<rect x="${f1(x + bw * (0.18 + k * 0.25))}" y="${f1(y + bh * 0.3)}" width="${f1(bw * 0.1)}" height="${f1(bh * 0.18)}" fill="#8f8473" opacity="0.45"/>`;
        x += bw + w * 0.004;
      }
    }
    const lm = o.landmark ?? 'dome';
    const cx = w * (o.x ?? 0.45);
    if (lm === 'dome' || lm === 'dome2') {
      const dw = w * 0.13;
      const dy = base - h * 0.2;
      s += `<rect x="${f1(cx - dw * 0.62)}" y="${f1(dy)}" width="${f1(dw * 1.24)}" height="${f1(h * 0.25)}" fill="#cdbfa6"/>`;
      s += `<rect x="${f1(cx - dw * 0.5)}" y="${f1(dy - h * 0.05)}" width="${f1(dw)}" height="${f1(h * 0.06)}" fill="#c4b59b"/>`;
      s += `<path d="M${f1(cx - dw * 0.48)} ${f1(dy - h * 0.05)} C${f1(cx - dw * 0.45)} ${f1(dy - h * 0.2)} ${f1(cx + dw * 0.45)} ${f1(dy - h * 0.2)} ${f1(cx + dw * 0.48)} ${f1(dy - h * 0.05)} Z" fill="${lm === 'dome' ? '#b88f72' : '#aeb3b1'}"/>`;
      for (let k = -2; k <= 2; k++) s += `<path d="M${f1(cx + k * dw * 0.18)} ${f1(dy - h * 0.05)} Q${f1(cx + k * dw * 0.1)} ${f1(dy - h * 0.15)} ${f1(cx)} ${f1(dy - h * 0.165)}" stroke="#efe4d4" stroke-width="${f1(w / 900)}" fill="none" opacity="0.7"/>`;
      s += `<rect x="${f1(cx - dw * 0.05)}" y="${f1(dy - h * 0.2)}" width="${f1(dw * 0.1)}" height="${f1(h * 0.04)}" fill="#efe6d8"/><path d="M${f1(cx - dw * 0.05)} ${f1(dy - h * 0.2)} L${f1(cx)} ${f1(dy - h * 0.23)} L${f1(cx + dw * 0.05)} ${f1(dy - h * 0.2)} Z" fill="#b88f72"/>`;
      if (lm === 'dome') {
        const tx = cx + dw * 1.1;
        s += `<rect x="${f1(tx)}" y="${f1(base - h * 0.42)}" width="${f1(w * 0.025)}" height="${f1(h * 0.42)}" fill="#e7dccb"/><rect x="${f1(tx)}" y="${f1(base - h * 0.42)}" width="${f1(w * 0.025)}" height="${f1(h * 0.02)}" fill="#cdbfa6"/>`;
      }
    }
    if (lm === 'tower' || lm === 'lean') {
      const tw = w * 0.035;
      const th = h * (lm === 'lean' ? 0.36 : 0.5);
      const ang = lm === 'lean' ? 4 : 0;
      s += `<g transform="rotate(${ang} ${f1(cx)} ${f1(base)})"><rect x="${f1(cx - tw / 2)}" y="${f1(base - th)}" width="${f1(tw)}" height="${f1(th)}" fill="#efe9de"/>`;
      if (lm === 'lean') for (let k = 1; k < 8; k++) s += `<line x1="${f1(cx - tw / 2)}" y1="${f1(base - (th * k) / 8)}" x2="${f1(cx + tw / 2)}" y2="${f1(base - (th * k) / 8)}" stroke="#cfc6b6" stroke-width="${f1(w / 900)}"/>`;
      else s += `<rect x="${f1(cx - tw * 0.7)}" y="${f1(base - th - h * 0.04)}" width="${f1(tw * 1.4)}" height="${f1(h * 0.04)}" fill="#c99f7e"/>`;
      s += `</g>`;
      if (lm === 'lean') s += `<path d="M${f1(cx - w * 0.2)} ${f1(base)} C${f1(cx - w * 0.19)} ${f1(base - h * 0.12)} ${f1(cx - w * 0.08)} ${f1(base - h * 0.12)} ${f1(cx - w * 0.07)} ${f1(base)} Z" fill="#ece5d9"/>`;
    }
    if (lm === 'arches') {
      const aw = w * 0.42;
      const ax = cx - aw / 2;
      const ah = h * 0.26;
      s += `<path d="M${f1(ax)} ${f1(base)} L${f1(ax)} ${f1(base - ah)} Q${f1(cx)} ${f1(base - ah * 1.18)} ${f1(ax + aw)} ${f1(base - ah * 0.85)} L${f1(ax + aw)} ${f1(base)} Z" fill="#d6c3a5"/>`;
      for (let row = 0; row < 3; row++) for (let k = 0; k < 12; k++) {
        const x = ax + aw * (0.03 + k * 0.08);
        const y = base - ah * (0.9 - row * 0.3) + (k / 12) * ah * 0.12 * (row === 0 ? 1 : 0.5);
        s += `<path d="M${f1(x)} ${f1(y + ah * 0.22)} L${f1(x)} ${f1(y + ah * 0.08)} Q${f1(x + aw * 0.025)} ${f1(y)} ${f1(x + aw * 0.05)} ${f1(y + ah * 0.08)} L${f1(x + aw * 0.05)} ${f1(y + ah * 0.22)} Z" fill="#9a8770" opacity="0.65"/>`;
      }
    }
    if (lm === 'walls') {
      s += `<rect x="0" y="${f1(base - h * 0.02)}" width="${w}" height="${f1(h * 0.08)}" fill="#c08f6c"/>`;
      for (let k = 0; k < 18; k++) s += `<circle cx="${f1(w * (0.03 + k * 0.057))}" cy="${f1(base - h * 0.06)}" r="${f1(w * 0.026)}" fill="#8e9472"/>`;
    }
    const gy = base + h * 0.08;
    if (o.river ?? (lm === 'dome' || lm === 'arches')) {
      // fiume in primo piano con i riflessi
      s += `<rect y="${f1(gy)}" width="${w}" height="${f1(h - gy)}" fill="#a9b2b0"/>`;
      s += `<rect y="${f1(gy)}" width="${w}" height="${f1(h * 0.012)}" fill="#8f8a7e" opacity="0.6"/>`;
      for (let k = 0; k < 50; k++) {
        const y = gy + h * 0.02 + (h - gy) * Math.pow(r(), 1.3);
        const x = w * r();
        s += `<line x1="${f1(x)}" y1="${f1(y)}" x2="${f1(x + w * (0.02 + r() * 0.06))}" y2="${f1(y)}" stroke="#e9ece9" stroke-width="${f1(w / 1500)}" opacity="${(0.2 + r() * 0.4).toFixed(2)}"/>`;
      }
      s += `<rect x="${f1(cx - w * 0.06)}" y="${f1(gy + h * 0.015)}" width="${f1(w * 0.12)}" height="${f1((h - gy) * 0.6)}" fill="#d9cdb8" opacity="0.18"/>`;
    } else {
      // piazza lastricata in prospettiva
      s += `<rect y="${f1(gy)}" width="${w}" height="${f1(h - gy)}" fill="#cdbfa7"/>`;
      for (let k = -10; k <= 20; k++) s += `<line x1="${f1(w / 2 + (k - 5) * w * 0.02)}" y1="${f1(gy)}" x2="${f1(w / 2 + (k - 5) * w * 0.14)}" y2="${h}" stroke="#bba98e" stroke-width="${f1(w / 1600)}"/>`;
      for (let k = 1; k < 6; k++) s += `<line x1="0" y1="${f1(gy + (h - gy) * Math.pow(k / 6, 1.6))}" x2="${w}" y2="${f1(gy + (h - gy) * Math.pow(k / 6, 1.6))}" stroke="#bba98e" stroke-width="${f1(w / 1600)}"/>`;
    }
    s += `<rect width="${w}" height="${h}" fill="url(#haze)" opacity="0.3"/>`;
    return s;
  },

  lake(w, h, seed) {
    let s = sky(w, h, 'day', [0.25, 0.25, 0.2]);
    const hz = h * 0.56;
    const back = ridge(w, h, h * 0.3, h * 0.12, 2.4, seed + 1);
    const mid = ridge(w, h, h * 0.42, h * 0.1, 3.2, seed + 2);
    s += `<path d="${back}" fill="#c3c6c0"/><path d="${mid}" fill="#9fa595"/>`;
    s += `<rect y="${f1(hz)}" width="${w}" height="${f1(h - hz)}" fill="#b2bdbd"/>`;
    s += `<defs><clipPath id="water"><rect y="${f1(hz)}" width="${w}" height="${f1(h - hz)}"/></clipPath></defs>`;
    s += `<g clip-path="url(#water)"><g transform="translate(0 ${f1(hz * 2)}) scale(1 -1)" opacity="0.25"><path d="${mid}" fill="#7f8778"/></g></g>`;
    s += `<rect y="${f1(hz)}" width="${w}" height="${f1(h - hz)}" fill="#b2bdbd" opacity="0.45"/>`;
    // villa sull'acqua
    const vx = w * 0.18;
    s += `<rect x="${f1(vx)}" y="${f1(hz - h * 0.1)}" width="${f1(w * 0.16)}" height="${f1(h * 0.1)}" fill="#e7d6bb"/>`;
    for (let k = 0; k < 6; k++) s += `<rect x="${f1(vx + w * (0.012 + k * 0.025))}" y="${f1(hz - h * 0.08)}" width="${f1(w * 0.01)}" height="${f1(h * 0.035)}" fill="#8f8574" opacity="0.6"/>`;
    s += `<polygon points="${f1(vx - w * 0.005)},${f1(hz - h * 0.1)} ${f1(vx + w * 0.08)},${f1(hz - h * 0.13)} ${f1(vx + w * 0.165)},${f1(hz - h * 0.1)}" fill="#b49276"/>`;
    for (let k = 0; k < 5; k++) s += cypress(vx + w * (0.18 + k * 0.012), hz, h * 0.1, '#5f6650');
    return s;
  },

  volcano(w, h, seed) {
    let s = sky(w, h, 'dusk', [0.25, 0.3, 0.2]);
    s += `<path d="M0 ${f1(h * 0.72)} L${f1(w * 0.3)} ${f1(h * 0.5)} Q${f1(w * 0.47)} ${f1(h * 0.22)} ${f1(w * 0.52)} ${f1(h * 0.22)} Q${f1(w * 0.57)} ${f1(h * 0.22)} ${f1(w * 0.74)} ${f1(h * 0.5)} L${w} ${f1(h * 0.7)} L${w} ${h} L0 ${h} Z" fill="#8b847b"/>`;
    s += `<path d="M${f1(w * 0.46)} ${f1(h * 0.26)} Q${f1(w * 0.52)} ${f1(h * 0.2)} ${f1(w * 0.58)} ${f1(h * 0.26)} L${f1(w * 0.62)} ${f1(h * 0.33)} L${f1(w * 0.42)} ${f1(h * 0.33)} Z" fill="#efe9e0"/>`;
    for (let k = 0; k < 4; k++) s += `<ellipse cx="${f1(w * (0.5 + k * 0.06))}" cy="${f1(h * (0.17 - k * 0.025))}" rx="${f1(w * (0.05 + k * 0.03))}" ry="${f1(h * (0.04 + k * 0.012))}" fill="#e8e2d8" opacity="${(0.75 - k * 0.15).toFixed(2)}" filter="url(#blur2)"/>`;
    s += `<path d="${ridge(w, h, h * 0.78, h * 0.04, 3, seed + 3)}" fill="#6f6962"/>`;
    s += `<path d="M${f1(w * 0.55)} ${f1(h * 0.34)} C${f1(w * 0.6)} ${f1(h * 0.5)} ${f1(w * 0.64)} ${f1(h * 0.62)} ${f1(w * 0.7)} ${f1(h * 0.8)}" stroke="#5c5650" stroke-width="${f1(w / 160)}" fill="none" opacity="0.5"/>`;
    return s;
  },

  interior(w, h, seed) {
    const r = rng(seed);
    let s = `<defs><linearGradient id="wall" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ece5d9"/><stop offset="1" stop-color="#d9cfbf"/></linearGradient><filter id="blur2"><feGaussianBlur stdDeviation="${f1(w / 90)}"/></filter></defs><rect width="${w}" height="${h}" fill="url(#wall)"/>`;
    const n = 3 + Math.floor(r() * 2);
    for (let k = 0; k < n; k++) {
      const aw = w / (n + 1.5);
      const x = (w - n * aw * 1.3) / 2 + k * aw * 1.3;
      const top = h * 0.14;
      s += `<path d="M${f1(x)} ${f1(h * 0.72)} L${f1(x)} ${f1(top + aw / 2)} A${f1(aw / 2)} ${f1(aw / 2)} 0 0 1 ${f1(x + aw)} ${f1(top + aw / 2)} L${f1(x + aw)} ${f1(h * 0.72)} Z" fill="#f8f4ec"/>`;
      s += `<path d="M${f1(x + aw * 0.08)} ${f1(h * 0.72)} L${f1(x + aw * 0.08)} ${f1(top + aw / 2)} A${f1(aw * 0.42)} ${f1(aw * 0.42)} 0 0 1 ${f1(x + aw * 0.92)} ${f1(top + aw / 2)} L${f1(x + aw * 0.92)} ${f1(h * 0.72)} Z" fill="#f2ede4" opacity="0.8"/>`;
    }
    s += `<rect y="${f1(h * 0.72)}" width="${w}" height="${f1(h * 0.28)}" fill="#cfc5b4"/>`;
    for (let k = -6; k <= 16; k++) s += `<line x1="${f1(w / 2)}" y1="${f1(h * 0.72)}" x2="${f1(w / 2 + (k - 5) * w * 0.12)}" y2="${h}" stroke="#bdb2a0" stroke-width="${f1(w / 1400)}"/>`;
    s += `<rect x="${f1(w * 0.3)}" y="${f1(h * 0.64)}" width="${f1(w * 0.4)}" height="${f1(h * 0.05)}" fill="#f4f1eb"/><rect x="${f1(w * 0.33)}" y="${f1(h * 0.69)}" width="${f1(w * 0.34)}" height="${f1(h * 0.1)}" fill="#e6e0d6"/>`;
    s += `<ellipse cx="${f1(w * 0.5)}" cy="${f1(h * 0.3)}" rx="${f1(w * 0.3)}" ry="${f1(h * 0.25)}" fill="#fffaf0" opacity="0.35" filter="url(#blur2)"/>`;
    return s;
  },

  workshop(w, h, seed) {
    const r = rng(seed);
    let s = `<defs><linearGradient id="wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9d3c9"/><stop offset="1" stop-color="#bfb7aa"/></linearGradient><linearGradient id="ray" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fffaf0" stop-opacity="0.55"/><stop offset="1" stop-color="#fffaf0" stop-opacity="0"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#wall)"/>`;
    s += `<polygon points="${f1(w * 0.55)},0 ${f1(w * 0.75)},0 ${f1(w * 0.45)},${h} ${f1(w * 0.1)},${h}" fill="url(#ray)"/>`;
    s += `<rect y="${f1(h * 0.78)}" width="${w}" height="${f1(h * 0.22)}" fill="#a9a194"/>`;
    for (let k = 0; k < 6; k++) {
      const bw = w * (0.1 + r() * 0.08);
      const bh = bw * (0.6 + r() * 0.35);
      const bx = w * (0.04 + k * 0.16) + r() * w * 0.02;
      const by = h * 0.8 - bh;
      const d = bw * 0.28;
      s += `<rect x="${f1(bx)}" y="${f1(by)}" width="${f1(bw)}" height="${f1(bh)}" fill="#ece9e3"/><polygon points="${f1(bx)},${f1(by)} ${f1(bx + d)},${f1(by - d * 0.6)} ${f1(bx + bw + d)},${f1(by - d * 0.6)} ${f1(bx + bw)},${f1(by)}" fill="#f7f5f1"/><polygon points="${f1(bx + bw)},${f1(by)} ${f1(bx + bw + d)},${f1(by - d * 0.6)} ${f1(bx + bw + d)},${f1(by + bh - d * 0.6)} ${f1(bx + bw)},${f1(by + bh)}" fill="#cbc5ba"/>`;
      s += `<path d="M${f1(bx + bw * 0.1)} ${f1(by + bh * (0.3 + r() * 0.4))} C${f1(bx + bw * 0.4)} ${f1(by + bh * r())} ${f1(bx + bw * 0.6)} ${f1(by + bh * r())} ${f1(bx + bw * 0.95)} ${f1(by + bh * (0.2 + r() * 0.6))}" stroke="#bdb8b0" stroke-width="${f1(w / 1200)}" fill="none"/>`;
    }
    return s;
  },

  night(w, h, seed) {
    const r = rng(seed);
    let s = sky(w, h, 'night');
    s += `<path d="${ridge(w, h, h * 0.5, h * 0.05, 2, seed)}" fill="#26272b"/>`;
    s += `<polygon points="${f1(w * 0.47)},${f1(h * 0.55)} ${f1(w * 0.53)},${f1(h * 0.55)} ${f1(w * 0.95)},${h} ${f1(w * 0.05)},${h}" fill="#303136"/>`;
    for (let k = 0; k < 6; k++) {
      const t = k / 6;
      const y = h * 0.56 + (h * 0.44) * Math.pow(t, 1.5);
      s += `<line x1="${f1(w / 2)}" y1="${f1(y)}" x2="${f1(w / 2)}" y2="${f1(y + h * 0.02 * (1 + t * 3))}" stroke="#d9c39a" stroke-width="${f1(w / 500 * (1 + t * 2))}" opacity="0.6"/>`;
    }
    for (let k = 0; k < 24; k++) s += `<circle cx="${f1(w * r())}" cy="${f1(h * (0.45 + r() * 0.12))}" r="${f1(w * (0.004 + r() * 0.012))}" fill="#e7cf9f" opacity="${(0.25 + r() * 0.5).toFixed(2)}" filter="url(#soft)"/>`;
    return s;
  },

  port(w, h, seed) {
    let s = scenes.sea(w, h, seed, { land: true });
    const q = h * 0.78;
    s += `<rect y="${f1(q)}" width="${w}" height="${f1(h - q)}" fill="#b8b0a3"/>`;
    const r = rng(seed + 9);
    for (let k = 0; k < 8; k++) {
      const bw = w * (0.06 + r() * 0.03);
      const bh = bw * 0.6;
      const bx = w * (0.05 + k * 0.11);
      s += `<rect x="${f1(bx)}" y="${f1(q - bh)}" width="${f1(bw)}" height="${f1(bh)}" fill="#f1eee8"/><rect x="${f1(bx + bw)}" y="${f1(q - bh * 0.95)}" width="${f1(bw * 0.18)}" height="${f1(bh * 0.95)}" fill="#d3cdc3"/>`;
    }
    // nave da carico all'ancora
    const sx = w * 0.56;
    const sy = h * 0.6;
    const sl = w * 0.36;
    s += `<path d="M${f1(sx)} ${f1(sy - h * 0.035)} L${f1(sx + sl)} ${f1(sy - h * 0.035)} L${f1(sx + sl * 0.97)} ${f1(sy + h * 0.01)} L${f1(sx + sl * 0.04)} ${f1(sy + h * 0.01)} Z" fill="#4c4a48"/>`;
    s += `<rect x="${f1(sx)}" y="${f1(sy - h * 0.035)}" width="${f1(sl)}" height="${f1(h * 0.006)}" fill="#8a5a46"/>`;
    const pal = ['#b9a58a', '#9aa3a4', '#c8b9a2', '#8f9590', '#d1c4ae'];
    for (let k = 0; k < 11; k++) {
      const ch = h * (0.018 + (k % 3) * 0.01);
      s += `<rect x="${f1(sx + sl * (0.08 + k * 0.06))}" y="${f1(sy - h * 0.035 - ch)}" width="${f1(sl * 0.055)}" height="${f1(ch)}" fill="${pal[k % pal.length]}"/>`;
    }
    s += `<rect x="${f1(sx + sl * 0.82)}" y="${f1(sy - h * 0.1)}" width="${f1(sl * 0.1)}" height="${f1(h * 0.065)}" fill="#ece8e1"/><rect x="${f1(sx + sl * 0.84)}" y="${f1(sy - h * 0.09)}" width="${f1(sl * 0.06)}" height="${f1(h * 0.008)}" fill="#6f6a63"/>`;
    return s;
  },
};

/** SVG completo di una scena. */
export function sceneSvg(name, w, h, seed, opts = {}) {
  const fn = scenes[name] ?? scenes.interior;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${fn(w, h, seed, opts)}</svg>`;
}

export const SCENE_NAMES = Object.keys(scenes);
