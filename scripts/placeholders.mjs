#!/usr/bin/env node
// Crea le immagini segnaposto del sito (solo quelle mancanti) e aggiorna IMMAGINI.md.
//   npm run placeholders            -> crea solo i file che non esistono
//   npm run placeholders -- --force -> rigenera tutti i segnaposto (non tocca le foto vere: vedi sotto)
// Un file è considerato "foto vera" se non contiene il marcatore WC-PLACEHOLDER nei metadati.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { IMAGES } from './images.manifest.mjs';
import { sceneSvg } from './scenes.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const imagesDir = join(root, 'src/assets/images');
const force = process.argv.includes('--force');
// --only=testo: rigenera solo i file il cui nome contiene il testo (utile mentre si ritoccano le scene)
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
const MARK = 'WC-PLACEHOLDER';

// ---------- rumore di Perlin (deterministico) ----------
function makeNoise(seed) {
  const p = new Uint8Array(512);
  const perm = Array.from({ length: 256 }, (_, i) => i);
  let s = seed >>> 0 || 1;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const grad = (h, x, y) => {
    switch (h & 7) {
      case 0: return x + y;
      case 1: return -x + y;
      case 2: return x - y;
      case 3: return -x - y;
      case 4: return x;
      case 5: return -x;
      case 6: return y;
      default: return -y;
    }
  };
  const noise = (x, y) => {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    const u = fade(x);
    const v = fade(y);
    const a = p[X] + Y;
    const b = p[X + 1] + Y;
    const l1 = grad(p[a], x, y) + u * (grad(p[b], x - 1, y) - grad(p[a], x, y));
    const l2 = grad(p[a + 1], x, y - 1) + u * (grad(p[b + 1], x - 1, y - 1) - grad(p[a + 1], x, y - 1));
    return (l1 + v * (l2 - l1)) * 0.7071;
  };
  const fbm = (x, y, oct = 5) => {
    let sum = 0;
    let amp = 0.5;
    let f = 1;
    for (let i = 0; i < oct; i++) {
      sum += amp * noise(x * f, y * f);
      f *= 2.03;
      amp *= 0.5;
    }
    return sum;
  };
  return { noise, fbm };
}

// ---------- marmi procedurali (solo per i segnaposto) ----------
// Venature "a cresta" con distorsione del dominio: imitano l'aspetto dei marmi apuani.
const PRESETS = {
  'bianco-carrara': { seed: 11, base: [226, 227, 226], base2: [210, 212, 213], vein: [120, 126, 134], warp: 1.6, f: 1.4, sharp: 22, amount: 0.55, mask: 0.25, cloud: 0.9, fine: 0.5, stretch: [1, 1.8], halo: 0.18 },
  statuario: { seed: 23, base: [247, 246, 242], base2: [236, 235, 231], vein: [78, 82, 90], warp: 2.2, f: 0.9, sharp: 30, amount: 0.95, mask: 0.45, cloud: 0.3, fine: 0.35, stretch: [1, 1.4], halo: 0.18 },
  calacatta: { seed: 37, base: [247, 244, 236], base2: [238, 233, 222], vein: [132, 106, 70], vein2: [118, 112, 104], warp: 2.4, f: 0.8, sharp: 22, amount: 0.9, mask: 0.2, cloud: 0.3, fine: 0.35, stretch: [1, 1.2], halo: 0.08 },
  arabescato: { seed: 41, base: [242, 241, 237], base2: [226, 226, 223], vein: [70, 74, 82], warp: 1.2, f: 1.8, sharp: 16, amount: 0.95, mask: 0.05, cloud: 0.4, fine: 0.7, stretch: [1, 1], web: true, halo: 0.18 },
  bardiglio: { seed: 53, base: [136, 144, 153], base2: [116, 124, 134], vein: [72, 79, 88], light: [192, 197, 203], warp: 1.2, f: 2.2, sharp: 12, amount: 0.6, mask: 0.2, cloud: 0.7, fine: 0.6, stretch: [3.5, 1], halo: 0.18 },
};

const mix = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const ridge = (n, sharp) => Math.pow(Math.max(0, 1 - Math.abs(n) * 2.2), sharp);

function marblePixels(pr, w, h, scale = 1) {
  const { fbm, noise } = makeNoise(pr.seed);
  const out = Buffer.alloc(w * h * 3);
  const aspect = w / h;
  let i = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const U = ((((x / w) * aspect) / scale + 0.37) * pr.f) * pr.stretch[1];
      const V = (((y / h) / scale + 0.11) * pr.f) * pr.stretch[0];
      const qx = fbm(U, V, 4);
      const qy = fbm(U + 5.2, V + 1.3, 4);
      const r = fbm(U + pr.warp * qx, V + pr.warp * qy, 6);
      let vein = ridge(r, pr.sharp);
      let fine = ridge(fbm(U * 2.3 + pr.warp * qy + 3, V * 2.3 + pr.warp * qx + 7, 5), pr.sharp * 1.8) * pr.fine;
      if (pr.web) vein = Math.max(vein, ridge(fbm(U * 1.4 + pr.warp * qx * 1.5 + 11, V * 1.4 + pr.warp * qy * 1.5, 5), pr.sharp * 0.9));
      const m = smoothstep(-0.15, 0.25, fbm(U * 0.6 + 20, V * 0.6 + 20, 3) + pr.mask);
      vein *= m;
      fine *= 0.4 + 0.6 * m;
      const cloud = smoothstep(-0.3, 0.4, fbm(U * 0.9 + 30, V * 0.9, 4)) * pr.cloud;
      const halo = ridge(r, pr.sharp * 0.18) * pr.halo * m;
      const grain = noise(x * 0.8, y * 0.8) * 2.2;
      for (let c = 0; c < 3; c++) {
        let col = mix(pr.base[c], pr.base2[c], cloud);
        col = mix(col, pr.vein[c], halo * pr.amount);
        col = pr.light ? mix(col, pr.light[c], Math.min(1, fine * 1.2)) : mix(col, (pr.vein2 ?? pr.vein)[c], Math.min(1, fine * 0.7));
        col = mix(col, pr.vein[c], Math.min(1, vein * pr.amount));
        out[i + c] = Math.max(0, Math.min(255, Math.round(col + grain)));
      }
      i += 3;
    }
  }
  return out;
}

// ---------- segnaposto fotografici ----------
// Ogni foto da scattare ha per ora un'illustrazione sobria (scripts/scenes.mjs) oppure una composizione
// con i marmi generati (lastre in galleria, campioni, ambienti, smartphone). In basso a destra resta
// una piccola scritta "SEGNAPOSTO" con il nome del file da sostituire.

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const seedOf = (str) => [...str].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
const MARBLE_IDS = Object.keys(PRESETS);

/** Marmo a metà risoluzione, poi ingrandito: per le composizioni basta e si genera in fretta. */
async function marbleTile(slug, w, h, scale = 1) {
  const hw = Math.max(8, Math.round(w / 2));
  const hh = Math.max(8, Math.round(h / 2));
  const px = marblePixels(PRESETS[slug] ?? PRESETS.statuario, hw, hh, scale);
  return sharp(px, { raw: { width: hw, height: hh, channels: 3 } }).resize(Math.round(w), Math.round(h)).png().toBuffer();
}

/** Grana fotografica leggerissima, così le illustrazioni non sembrano piatte. */
function grain(w, h, seed, alpha = 16) {
  const buf = Buffer.alloc(w * h * 4);
  let st = seed >>> 0 || 1;
  for (let i = 0; i < w * h; i++) {
    st = (st * 1664525 + 1013904223) >>> 0;
    const v = 96 + (st >>> 24) % 64;
    buf[i * 4] = v;
    buf[i * 4 + 1] = v;
    buf[i * 4 + 2] = v;
    buf[i * 4 + 3] = alpha;
  }
  return { input: buf, raw: { width: w, height: h, channels: 4 } };
}

function captionSvg(img) {
  const { w, h } = img;
  const s = Math.max(0.6, Math.min(1.3, w / 2000));
  const fs = Math.round(12.5 * s);
  const label = `SEGNAPOSTO · ${img.file}`;
  const tw = label.length * fs * 0.68 + 22 * s;
  const ph = fs * 2.3;
  const pad = Math.round(26 * s);
  const x = w - pad - tw;
  const y = (img.hero ? h * 0.8 : h - pad) - ph;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${tw.toFixed(1)}" height="${ph.toFixed(1)}" rx="${(ph / 2).toFixed(1)}" fill="#1a1a1c" fill-opacity="0.38"/>
  <text x="${(x + tw / 2).toFixed(1)}" y="${(y + ph / 2 + fs * 0.36).toFixed(1)}" text-anchor="middle" font-family="Inter, DejaVu Sans" font-weight="500" font-size="${fs}" letter-spacing="${(1.6 * s).toFixed(1)}" fill="#f8f6f1" fill-opacity="0.92">${esc(label)}</text>
</svg>`;
}

// --- composizioni con i marmi ---
async function slabsScene(img) {
  const { w, h } = img;
  const vertical = h > w;
  const floor = h * (vertical ? 0.84 : 0.86);
  const bg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs>
      <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e2dbcf"/><stop offset="1" stop-color="#d3c9b9"/></linearGradient>
      <linearGradient id="fl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bdb3a3"/><stop offset="1" stop-color="#a99f8f"/></linearGradient>
      <radialGradient id="spot" cx="0.5" cy="0.2" r="0.7"><stop offset="0" stop-color="#fffaf1" stop-opacity="0.7"/><stop offset="1" stop-color="#fffaf1" stop-opacity="0"/></radialGradient>
      <filter id="b"><feGaussianBlur stdDeviation="${(w / 140).toFixed(1)}"/></filter>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#wall)"/>
    <rect width="${w}" height="${h}" fill="url(#spot)"/>
    <rect y="${floor.toFixed(1)}" width="${w}" height="${(h - floor).toFixed(1)}" fill="url(#fl)"/>
    <line x1="0" y1="${floor.toFixed(1)}" x2="${w}" y2="${floor.toFixed(1)}" stroke="#9c9282" stroke-width="${(w / 900).toFixed(1)}"/>
  </svg>`;
  const order = vertical ? ['calacatta', 'statuario', 'bardiglio'] : ['bianco-carrara', 'calacatta', 'statuario', 'arabescato', 'bardiglio'];
  const gap = w * (vertical ? 0.035 : 0.022);
  const margin = w * (vertical ? 0.1 : 0.06);
  const sw = (w - margin * 2 - gap * (order.length - 1)) / order.length;
  const layers = [];
  let shadows = '';
  for (let i = 0; i < order.length; i++) {
    const sh = h * (vertical ? 0.62 + (i % 2) * 0.08 : 0.58 + ((i * 7) % 3) * 0.06);
    const x = margin + i * (sw + gap);
    const y = floor - sh;
    shadows += `<rect x="${(x + sw * 0.1).toFixed(1)}" y="${(floor - h * 0.012).toFixed(1)}" width="${(sw * 0.95).toFixed(1)}" height="${(h * 0.03).toFixed(1)}" fill="#3c372f" opacity="0.35" filter="url(#b)"/>`;
    shadows += `<rect x="${(x + sw).toFixed(1)}" y="${(y + h * 0.01).toFixed(1)}" width="${(w * 0.02).toFixed(1)}" height="${(sh - h * 0.01).toFixed(1)}" fill="#3c372f" opacity="0.18" filter="url(#b)"/>`;
    layers.push({ input: await marbleTile(order[i], sw, sh, vertical ? 1.5 : 1.4), left: Math.round(x), top: Math.round(y) });
    // spessore della lastra e luce sul bordo
    layers.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(sw)}" height="${Math.round(sh)}"><rect width="100%" height="100%" fill="none" stroke="#000" stroke-opacity="0.08" stroke-width="2"/><rect x="${Math.round(sw) - Math.max(3, Math.round(w / 400))}" width="${Math.max(3, Math.round(w / 400))}" height="100%" fill="#000" fill-opacity="0.12"/><rect width="100%" height="100%" fill="url(#g)"/><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.18"/><stop offset="0.5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.06"/></linearGradient></defs></svg>`), left: Math.round(x), top: Math.round(y) });
  }
  const shadowSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><filter id="b"><feGaussianBlur stdDeviation="${(w / 160).toFixed(1)}"/></filter></defs>${shadows}</svg>`);
  return sharp(Buffer.from(bg)).composite([{ input: shadowSvg }, ...layers]).png().toBuffer();
}

async function ambientScene(img) {
  const { w, h } = img;
  const slug = img.opts?.marble ?? 'calacatta';
  const dark = slug === 'bardiglio';
  const floor = h * 0.8;
  const side = w * 0.17;
  const wall = await marbleTile(slug, w - side, floor, 1.6);
  const cw = w * 0.46;
  const ch = h * 0.16;
  const cx = side + (w - side) * 0.22;
  const cy = h * 0.5;
  const front = await marbleTile(slug, cw, ch, 1.2);
  const overlay = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs>
      <linearGradient id="fl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${dark ? '#8f877b' : '#b8ab97'}"/><stop offset="1" stop-color="${dark ? '#776f64' : '#a3967f'}"/></linearGradient>
      <linearGradient id="pl" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#d9d0c2"/><stop offset="1" stop-color="#e9e2d6"/></linearGradient>
      <linearGradient id="light" x1="0" y1="0" x2="1" y2="0.6"><stop offset="0" stop-color="#fff8ec" stop-opacity="0"/><stop offset="0.6" stop-color="#fff8ec" stop-opacity="0.16"/><stop offset="1" stop-color="#fff8ec" stop-opacity="0"/></linearGradient>
      <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#fff3dc" stop-opacity="0.9"/><stop offset="1" stop-color="#fff3dc" stop-opacity="0"/></radialGradient>
      <filter id="b"><feGaussianBlur stdDeviation="${(w / 120).toFixed(1)}"/></filter>
    </defs>
    <rect width="${side.toFixed(1)}" height="${floor.toFixed(1)}" fill="url(#pl)"/>
    <rect x="${(side - w * 0.012).toFixed(1)}" width="${(w * 0.03).toFixed(1)}" height="${floor.toFixed(1)}" fill="#000" opacity="0.12" filter="url(#b)"/>
    ${[1, 2].map((k) => `<line x1="${(side + ((w - side) * k) / 3).toFixed(1)}" y1="0" x2="${(side + ((w - side) * k) / 3).toFixed(1)}" y2="${floor.toFixed(1)}" stroke="#000" stroke-opacity="0.07" stroke-width="${(w / 900).toFixed(1)}"/>`).join('')}
    <rect y="${floor.toFixed(1)}" width="${w}" height="${(h - floor).toFixed(1)}" fill="url(#fl)"/>
    ${Array.from({ length: 9 }, (_, k) => `<line x1="${(w * (k / 8)).toFixed(1)}" y1="${floor.toFixed(1)}" x2="${(w * (k / 8) * 1.6 - w * 0.3).toFixed(1)}" y2="${h}" stroke="#000" stroke-opacity="0.06" stroke-width="${(w / 1000).toFixed(1)}"/>`).join('')}
    <rect x="${(cx + cw * 0.04).toFixed(1)}" y="${(cy + ch + h * 0.02).toFixed(1)}" width="${(cw * 0.92).toFixed(1)}" height="${(h * 0.05).toFixed(1)}" fill="#000" opacity="0.22" filter="url(#b)"/>
    <rect x="${(cx - w * 0.004).toFixed(1)}" y="${(cy - h * 0.012).toFixed(1)}" width="${(cw + w * 0.008).toFixed(1)}" height="${(h * 0.014).toFixed(1)}" fill="${dark ? '#a9b0b6' : '#f6f3ee'}"/>
    <line x1="${(w * 0.74).toFixed(1)}" y1="0" x2="${(w * 0.74).toFixed(1)}" y2="${(h * 0.26).toFixed(1)}" stroke="#2a2a2c" stroke-width="${(w / 900).toFixed(1)}"/>
    <circle cx="${(w * 0.74).toFixed(1)}" cy="${(h * 0.29).toFixed(1)}" r="${(w * 0.06).toFixed(1)}" fill="url(#glow)"/>
    <circle cx="${(w * 0.74).toFixed(1)}" cy="${(h * 0.285).toFixed(1)}" r="${(w * 0.018).toFixed(1)}" fill="#fdf6e8" stroke="#b9a88a" stroke-width="${(w / 1200).toFixed(1)}"/>
    <path d="M${(cx + cw * 0.78).toFixed(1)} ${(cy - h * 0.012).toFixed(1)} c${(-w * 0.01).toFixed(1)} ${(-h * 0.05).toFixed(1)} ${(w * 0.012).toFixed(1)} ${(-h * 0.06).toFixed(1)} ${(w * 0.006).toFixed(1)} ${(-h * 0.1).toFixed(1)}" stroke="#6b6b55" stroke-width="${(w / 700).toFixed(1)}" fill="none"/>
    <rect x="${(cx + cw * 0.74).toFixed(1)}" y="${(cy - h * 0.06).toFixed(1)}" width="${(cw * 0.08).toFixed(1)}" height="${(h * 0.048).toFixed(1)}" rx="${(w * 0.006).toFixed(1)}" fill="#e9e3d8" stroke="#c8beaf" stroke-width="${(w / 1400).toFixed(1)}"/>
    <rect width="${w}" height="${h}" fill="url(#light)"/>
  </svg>`;
  const frontShade = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(cw)}" height="${Math.round(ch)}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0.04"/><stop offset="1" stop-color="#000" stop-opacity="0.16"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`);
  return sharp({ create: { width: w, height: h, channels: 3, background: '#d8d0c3' } })
    .composite([
      { input: wall, left: Math.round(side), top: 0 },
      { input: Buffer.from(overlay) },
      { input: front, left: Math.round(cx), top: Math.round(cy) },
      { input: frontShade, left: Math.round(cx), top: Math.round(cy) },
    ])
    .png()
    .toBuffer();
}

async function phoneScene(img) {
  const { w, h } = img;
  const base = await marbleTile('statuario', w, h, 1.5);
  const pw = Math.round(w * 0.26);
  const ph = Math.round(pw * 2.05);
  const px = Math.round(w * 0.56);
  const py = Math.round(h * 0.5 - ph / 2 + h * 0.04);
  const bezel = Math.round(pw * 0.045);
  const sx = px + bezel;
  const sy = py + bezel;
  const sw = pw - bezel * 2;
  const sh = ph - bezel * 2;
  const rad = Math.round(pw * 0.14);
  // sullo schermo: lo stesso marmo ingrandito, come nel mirino della fotocamera
  const crop = await sharp(base)
    .extract({ left: Math.max(0, px - Math.round(w * 0.2)), top: Math.max(0, py - Math.round(h * 0.05)), width: Math.round(sw * 0.75), height: Math.round(sh * 0.62) })
    .resize(sw, Math.round(sh * 0.74))
    .modulate({ brightness: 1.04 })
    .png()
    .toBuffer();
  const screenMask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${sw}" height="${sh}"><rect width="${sw}" height="${sh}" rx="${rad - bezel}" fill="#fff"/></svg>`);
  const screen = await sharp({ create: { width: sw, height: sh, channels: 4, background: '#f6f3ee' } })
    .composite([
      { input: crop, top: 0, left: 0 },
      {
        input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${sw}" height="${sh}">
          ${(() => {
            const m = sw * 0.16;
            const l = sw * 0.12;
            const t = sh * 0.14;
            const b = sh * 0.6;
            const st = `stroke="#fff" stroke-width="${(sw / 90).toFixed(1)}" fill="none" stroke-linecap="round"`;
            return `<path d="M${m} ${t + l} V${t} H${m + l} M${sw - m - l} ${t} H${sw - m} V${t + l} M${sw - m} ${b - l} V${b} H${sw - m - l} M${m + l} ${b} H${m} V${b - l}" ${st}/>`;
          })()}
          <rect y="${(sh * 0.74).toFixed(1)}" width="${sw}" height="${(sh * 0.26).toFixed(1)}" fill="#f8f6f1"/>
          ${['#f3efe7', '#cdbb9b', '#8e8a84'].map((c, i) => `<circle cx="${(sw * (0.2 + i * 0.12)).toFixed(1)}" cy="${(sh * 0.82).toFixed(1)}" r="${(sw * 0.045).toFixed(1)}" fill="${c}" stroke="#d6ccbb" stroke-width="${(sw / 200).toFixed(1)}"/>`).join('')}
          <rect x="${(sw * 0.56).toFixed(1)}" y="${(sh * 0.805).toFixed(1)}" width="${(sw * 0.28).toFixed(1)}" height="${(sh * 0.012).toFixed(1)}" fill="#a8875a"/>
          <rect x="${(sw * 0.56).toFixed(1)}" y="${(sh * 0.83).toFixed(1)}" width="${(sw * 0.2).toFixed(1)}" height="${(sh * 0.012).toFixed(1)}" fill="#d6ccbb"/>
          <rect x="${(sw * 0.15).toFixed(1)}" y="${(sh * 0.9).toFixed(1)}" width="${(sw * 0.7).toFixed(1)}" height="${(sh * 0.055).toFixed(1)}" rx="${(sh * 0.0275).toFixed(1)}" fill="#1a1a1c"/>
        </svg>`),
      },
      { input: screenMask, blend: 'dest-in' },
    ])
    .png()
    .toBuffer();
  const body = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs><filter id="b"><feGaussianBlur stdDeviation="${(w / 70).toFixed(1)}"/></filter></defs>
    <rect x="${px + w * 0.025}" y="${py + h * 0.04}" width="${pw}" height="${ph}" rx="${rad}" fill="#2b261f" opacity="0.38" filter="url(#b)"/>
    <rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="${rad}" fill="#1a1a1c"/>
    <rect x="${px + 1}" y="${py + 1}" width="${pw - 2}" height="${ph - 2}" rx="${rad}" fill="none" stroke="#5c5850" stroke-width="${(w / 800).toFixed(1)}"/>
  </svg>`);
  return sharp(base).composite([{ input: body }, { input: screen, left: sx, top: sy }]).png().toBuffer();
}

async function samplesScene(img) {
  const { w, h } = img;
  const tile = Math.round(Math.min(w, h) * 0.27);
  const spots = [
    ['statuario', 0.1, 0.14, -4],
    ['calacatta', 0.34, 0.1, 3],
    ['bardiglio', 0.2, 0.52, 2],
    ['arabescato', 0.45, 0.47, -3],
    ['bianco-carrara', 0.68, 0.36, 5],
  ];
  const bg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs>
      <linearGradient id="desk" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e6dfd2"/><stop offset="1" stop-color="#d6ccbc"/></linearGradient>
      <filter id="b"><feGaussianBlur stdDeviation="${(w / 160).toFixed(1)}"/></filter>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#desk)"/>
    <g transform="rotate(-6 ${w * 0.8} ${h * 0.6})">
      <rect x="${w * 0.66}" y="${h * 0.08}" width="${w * 0.4}" height="${h * 0.62}" fill="#000" opacity="0.12" filter="url(#b)"/>
      <rect x="${w * 0.65}" y="${h * 0.06}" width="${w * 0.4}" height="${h * 0.62}" fill="#fbfaf6"/>
      ${Array.from({ length: 9 }, (_, k) => `<line x1="${w * 0.68}" y1="${h * (0.12 + k * 0.06)}" x2="${w * (0.68 + 0.12 + ((k * 37) % 20) / 100)}" y2="${h * (0.12 + k * 0.06)}" stroke="#9c958a" stroke-width="${(w / 1400).toFixed(1)}"/>`).join('')}
      <rect x="${w * 0.7}" y="${h * 0.2}" width="${w * 0.16}" height="${h * 0.22}" fill="none" stroke="#7a736a" stroke-width="${(w / 1000).toFixed(1)}"/>
      <line x1="${w * 0.7}" y1="${h * 0.2}" x2="${w * 0.86}" y2="${h * 0.42}" stroke="#b9b2a8" stroke-width="${(w / 1400).toFixed(1)}"/>
    </g>
    <g transform="rotate(28 ${w * 0.62} ${h * 0.82})">
      <rect x="${w * 0.5}" y="${h * 0.81}" width="${w * 0.26}" height="${h * 0.014}" fill="#a8875a"/>
      <polygon points="${w * 0.76},${h * 0.81} ${w * 0.79},${h * 0.817} ${w * 0.76},${h * 0.824}" fill="#3a332a"/>
    </g>
    ${spots.map(([, x, y, a]) => `<rect x="${(w * x + tile * 0.04).toFixed(1)}" y="${(h * y + tile * 0.06).toFixed(1)}" width="${tile}" height="${tile}" fill="#2b261f" opacity="0.3" filter="url(#b)" transform="rotate(${a} ${(w * x + tile / 2).toFixed(1)} ${(h * y + tile / 2).toFixed(1)})"/>`).join('')}
  </svg>`;
  const layers = [];
  for (const [slug, x, y, a] of spots) {
    const t = await marbleTile(slug, tile, tile, 1.8);
    const edged = await sharp(t)
      .composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${tile}" height="${tile}"><rect width="${tile}" height="${tile}" fill="none" stroke="#000" stroke-opacity="0.1" stroke-width="3"/></svg>`) }])
      .png()
      .toBuffer();
    const rot = await sharp(edged).rotate(a, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    const m = await sharp(rot).metadata();
    layers.push({ input: rot, left: Math.round(w * x + tile / 2 - m.width / 2), top: Math.round(h * y + tile / 2 - m.height / 2) });
  }
  return sharp(Buffer.from(bg)).composite(layers).png().toBuffer();
}

const COMPOSITES = { slabs: slabsScene, ambient: ambientScene, phone: phoneScene, samples: samplesScene };

async function photoPlaceholder(img) {
  const { w, h } = img;
  const seed = seedOf(img.file);
  const base = COMPOSITES[img.scene]
    ? await COMPOSITES[img.scene](img)
    : await sharp(Buffer.from(sceneSvg(img.scene ?? 'interior', w, h, seed, img.opts ?? {}))).png().toBuffer();
  return sharp(base)
    .composite([grain(w, h, seed), { input: Buffer.from(captionSvg(img)) }])
    .jpeg({ quality: 86, mozjpeg: true })
    .withMetadata({ exif: { IFD0: { ImageDescription: `${MARK} ${img.desc}` } } })
    .toBuffer();
}

async function marblePlaceholder(img) {
  const preset = PRESETS[img.marble];
  const px = marblePixels(preset, img.w, img.h, img.scale ?? 1);
  const s = Math.max(0.6, img.w / 2000);
  const fs = Math.round(14 * s);
  const label = `<svg xmlns="http://www.w3.org/2000/svg" width="${img.w}" height="${img.h}">
    <text x="${img.w - Math.round(40 * s)}" y="${img.h - Math.round(36 * s)}" text-anchor="end" font-family="Inter" font-weight="500" font-size="${fs}" letter-spacing="${(2.5 * s).toFixed(1)}" fill="#1a1a1c" fill-opacity="0.55">SEGNAPOSTO GENERATO AL COMPUTER · ${esc(img.file)}</text></svg>`;
  return sharp(px, { raw: { width: img.w, height: img.h, channels: 3 } })
    .composite([{ input: Buffer.from(label) }])
    .jpeg({ quality: 88, mozjpeg: true })
    .withMetadata({ exif: { IFD0: { ImageDescription: `${MARK} ${img.desc}` } } })
    .toBuffer();
}

async function isPlaceholder(path) {
  try {
    const meta = await sharp(path).metadata();
    return !!meta.exif && meta.exif.toString('latin1').includes(MARK);
  } catch {
    return false;
  }
}

async function main() {
  let made = 0;
  for (const img of IMAGES) {
    if (only && !img.file.includes(only)) continue;
    const path = join(imagesDir, img.file);
    if (existsSync(path) && !(force && (await isPlaceholder(path)))) continue;
    mkdirSync(dirname(path), { recursive: true });
    const buf = img.kind === 'marble' ? await marblePlaceholder(img) : await photoPlaceholder(img);
    writeFileSync(path, buf);
    made++;
    process.stdout.write(`  creato ${img.file}\n`);
  }

  // Texture di marmo leggerissima per gli sfondi delle sezioni
  const texPath = join(root, 'src/assets/textures/marble-texture.webp');
  if (!existsSync(texPath) || (force && !only)) {
    mkdirSync(dirname(texPath), { recursive: true });
    const tw = 1600;
    const th = 1100;
    const px = marblePixels({ ...PRESETS.statuario, seed: 7, base: [241, 236, 226], base2: [237, 231, 220], vein: [208, 199, 184], amount: 0.6, fine: 0.3 }, tw, th, 1.4);
    await sharp(px, { raw: { width: tw, height: th, channels: 3 } }).webp({ quality: 70 }).toFile(texPath);
    process.stdout.write('  creata textures/marble-texture.webp\n');
  }

  // Elenco delle foto per il fotografo
  const rows = await Promise.all(
    IMAGES.map(async (img) => {
      const path = join(imagesDir, img.file);
      const state = (await isPlaceholder(path)) ? 'segnaposto' : 'foto vera';
      return `| \`src/assets/images/${img.file}\` | ${img.w} × ${img.h} | ${img.desc} | ${state} |`;
    }),
  );
  const md = `# Fotografie del sito

Ogni immagine del sito è per ora un **segnaposto** (le lastre di marmo sono generate al computer e
riportano la scritta "SEGNAPOSTO"). Per mettere la foto vera:

1. prepara la foto con **lo stesso nome** e circa le **stesse proporzioni** indicate qui sotto
   (le dimensioni sono quelle minime consigliate; va bene anche più grande);
2. sostituisci il file nella cartella indicata (oppure caricala dal pannello contenuti \`/keystatic\`);
3. pubblica: il sito crea da solo le versioni AVIF/WebP ridimensionate per telefono, tablet e computer.

Formato consigliato: JPG di alta qualità, profilo colore sRGB. Le foto delle lastre devono essere
fotografie reali del materiale effettivamente disponibile: non usare immagini di altri fornitori senza permesso.

Totale immagini: ${IMAGES.length}.

| File | Dimensioni (px) | Cosa deve mostrare | Stato |
|---|---|---|---|
${rows.join('\n')}
`;
  writeFileSync(join(root, 'IMMAGINI.md'), md);
  console.log(`Segnaposto creati: ${made}. Elenco aggiornato in IMMAGINI.md`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
