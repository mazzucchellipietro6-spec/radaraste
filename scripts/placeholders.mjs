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

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const imagesDir = join(root, 'src/assets/images');
const force = process.argv.includes('--force');
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
const MOODS = {
  dawn: ['#d8ccb8', '#8c8373', '#f8f6f1'],
  stone: ['#cfc8bc', '#76716a', '#f8f6f1'],
  sea: ['#c4ccce', '#59666c', '#f8f6f1'],
  city: ['#d6cbb8', '#857761', '#f8f6f1'],
  night: ['#45454a', '#1c1c1f', '#f8f6f1'],
  green: ['#c7cab7', '#68705c', '#f8f6f1'],
  interior: ['#e2d9ca', '#988e7e', '#1a1a1c'],
};

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function wrap(text, max) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > max) {
      lines.push(line.trim());
      line = w;
    } else line += ' ' + w;
  }
  if (line.trim()) lines.push(line.trim());
  return lines.slice(0, 4);
}

function captionSvg(img, color) {
  const { w, h } = img;
  const s = Math.max(0.55, Math.min(1.4, w / 2000));
  const pad = Math.round(56 * s);
  const fs1 = Math.round(15 * s);
  const fs2 = Math.round(24 * s);
  const lines = wrap(img.desc, Math.round(w / (fs2 * 0.62) / 2.1));
  const lh = Math.round(fs2 * 1.35);
  const blockH = fs1 + 14 * s + lines.length * lh + fs1 + 10 * s;
  const y0 = h - pad - blockH;
  const x = w - pad;
  const inset = Math.round(Math.min(w, h) * 0.03);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <defs>
    <radialGradient id="v" cx="50%" cy="45%" r="75%">
      <stop offset="60%" stop-color="#000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.22"/>
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#v)"/>
  <rect x="${inset}" y="${inset}" width="${w - inset * 2}" height="${h - inset * 2}" fill="none" stroke="#c9ac80" stroke-opacity="0.55" stroke-width="${Math.max(1, Math.round(1.2 * s))}"/>
  <g fill="${color}" text-anchor="end">
    <text x="${x}" y="${y0 + fs1}" font-family="Inter" font-weight="500" font-size="${fs1}" letter-spacing="${(3 * s).toFixed(1)}" opacity="0.85">SEGNAPOSTO · ${esc(img.file)}</text>
    ${lines.map((l, k) => `<text x="${x}" y="${y0 + fs1 + 14 * s + (k + 1) * lh}" font-family="Caladea, DejaVu Serif" font-style="italic" font-size="${fs2}" opacity="0.92">${esc(l)}</text>`).join('\n    ')}
    <text x="${x}" y="${y0 + blockH}" font-family="Inter" font-size="${fs1}" opacity="0.7">${w} × ${h} px</text>
  </g>
</svg>`;
}

let textureCache = null;
async function texture(w, h) {
  // Venature leggere in scala di grigi, riusate come grana su tutti i segnaposto fotografici
  if (!textureCache) {
    const tw = 1200;
    const th = 800;
    const px = marblePixels({ ...PRESETS.statuario, base: [128, 128, 128], base2: [122, 122, 122], vein: [96, 96, 96], amount: 0.7, fine: 0.2 }, tw, th, 1.2);
    textureCache = await sharp(px, { raw: { width: tw, height: th, channels: 3 } }).png().toBuffer();
  }
  return sharp(textureCache).resize(w, h, { fit: 'cover' }).toBuffer();
}

async function photoPlaceholder(img) {
  const [top, bottom, ink] = MOODS[img.mood] ?? MOODS.stone;
  const { w, h } = img;
  const bg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/></svg>`;
  const tex = await texture(w, h);
  return sharp(Buffer.from(bg))
    .composite([
      { input: tex, blend: 'soft-light' },
      { input: Buffer.from(captionSvg(img, ink)) },
    ])
    .jpeg({ quality: 84, mozjpeg: true })
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
  if (!existsSync(texPath) || force) {
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
