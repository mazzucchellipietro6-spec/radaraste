// Analisi automatica di colori e venature, fatta nel browser (nessun dato inviato).
// Serve sia per la foto del cliente sia per le lastre del catalogo: stesso metodo, stessi numeri.
export interface Features {
  bg: [number, number, number]; // colore di fondo (Lab)
  vein: [number, number, number]; // colore medio delle venature (Lab)
  coverage: number; // quota di superficie occupata dalle venature (0-1)
  contrast: number; // differenza di luminosità fondo/venature
  linearity: number; // 0 = nuvolato, 1 = venature tutte nella stessa direzione
  fineness: number; // densità di bordi: venature fini e diffuse > ampie
  darkVeins: boolean;
}

function srgbToLinear(c: number) {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
function toLab(r: number, g: number, b: number): [number, number, number] {
  const R = srgbToLinear(r);
  const G = srgbToLinear(g);
  const B = srgbToLinear(b);
  let x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  let y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  let z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  x = f(x);
  y = f(y);
  z = f(z);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
const median = (arr: number[]) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
};

export async function loadImageData(src: string | Blob, size = 224): Promise<ImageData> {
  const url = typeof src === 'string' ? src : URL.createObjectURL(src);
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  await img.decode();
  const scale = size / Math.max(img.naturalWidth, img.naturalHeight);
  const w = Math.max(16, Math.round(img.naturalWidth * scale));
  const h = Math.max(16, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  if (typeof src !== 'string') URL.revokeObjectURL(url);
  return ctx.getImageData(0, 0, w, h);
}

export function extractFeatures(data: ImageData): Features {
  const { width: w, height: h } = data;
  const px = data.data;
  const L = new Float32Array(w * h);
  const A = new Float32Array(w * h);
  const Bv = new Float32Array(w * h);
  // ritaglio dei bordi (cornici, scritte) e campionamento
  const m = Math.round(Math.min(w, h) * 0.06);
  for (let i = 0; i < w * h; i++) {
    const lab = toLab(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]);
    L[i] = lab[0];
    A[i] = lab[1];
    Bv[i] = lab[2];
  }
  const ls: number[] = [];
  const as: number[] = [];
  const bs: number[] = [];
  for (let y = m; y < h - m; y++)
    for (let x = m; x < w - m; x++) {
      const i = y * w + x;
      ls.push(L[i]);
      as.push(A[i]);
      bs.push(Bv[i]);
    }
  const bg: [number, number, number] = [median(ls), median(as), median(bs)];
  // venature: pixel che si discostano dal fondo
  let veinCount = 0;
  let dark = 0;
  const vein = [0, 0, 0];
  for (let k = 0; k < ls.length; k++) {
    const d = Math.hypot(ls[k] - bg[0], (as[k] - bg[1]) * 1.5, (bs[k] - bg[2]) * 1.5);
    if (d > 10) {
      veinCount++;
      vein[0] += ls[k];
      vein[1] += as[k];
      vein[2] += bs[k];
      if (ls[k] < bg[0]) dark++;
    }
  }
  const coverage = veinCount / Math.max(1, ls.length);
  const veinColor: [number, number, number] = veinCount ? [vein[0] / veinCount, vein[1] / veinCount, vein[2] / veinCount] : [...bg];
  // direzione delle venature: coerenza del tensore di struttura (gradienti di luminosità)
  let jxx = 0;
  let jyy = 0;
  let jxy = 0;
  let edges = 0;
  let n = 0;
  for (let y = m + 1; y < h - m - 1; y++)
    for (let x = m + 1; x < w - m - 1; x++) {
      const i = y * w + x;
      const gx = L[i + 1] - L[i - 1];
      const gy = L[i + w] - L[i - w];
      jxx += gx * gx;
      jyy += gy * gy;
      jxy += gx * gy;
      if (Math.hypot(gx, gy) > 6) edges++;
      n++;
    }
  const tr = jxx + jyy;
  const linearity = tr > 0 ? Math.sqrt((jxx - jyy) ** 2 + 4 * jxy * jxy) / tr : 0;
  return {
    bg,
    vein: veinColor,
    coverage,
    contrast: Math.abs(bg[0] - veinColor[0]),
    linearity,
    fineness: edges / Math.max(1, n),
    darkVeins: dark >= veinCount / 2,
  };
}

export interface Comparison {
  distance: number;
  level: 'high' | 'medium' | 'low';
  reasons: ('bg' | 'bgTone' | 'veinColor' | 'contrast' | 'coverage' | 'linearity')[];
  differences: ('bgLighter' | 'bgDarker' | 'moreVeins' | 'fewerVeins' | 'moreContrast' | 'lessContrast' | 'moreLinear' | 'lessLinear')[];
}

/** Confronta la foto (a) con un marmo del catalogo (b): distanza pesata e motivi leggibili. */
export function compare(a: Features, b: Features): Comparison {
  const dBg = Math.hypot(a.bg[0] - b.bg[0], (a.bg[1] - b.bg[1]) * 2, (a.bg[2] - b.bg[2]) * 2);
  const dVein = Math.hypot(a.vein[0] - b.vein[0], (a.vein[1] - b.vein[1]) * 2, (a.vein[2] - b.vein[2]) * 2);
  const dCov = Math.abs(a.coverage - b.coverage) * 100;
  const dCon = Math.abs(a.contrast - b.contrast);
  const dLin = Math.abs(a.linearity - b.linearity) * 40;
  const dFine = Math.abs(a.fineness - b.fineness) * 60;
  const distance = dBg * 1.4 + dVein * 0.6 + dCov * 0.5 + dCon * 0.6 + dLin + dFine * 0.5;
  const reasons: Comparison['reasons'] = [];
  if (dBg < 6) reasons.push('bg');
  else if (Math.abs(a.bg[2] - b.bg[2]) < 3) reasons.push('bgTone');
  if (dVein < 12) reasons.push('veinColor');
  if (dCon < 6) reasons.push('contrast');
  if (dCov < 8) reasons.push('coverage');
  if (dLin < 6) reasons.push('linearity');
  const differences: Comparison['differences'] = [];
  if (a.bg[0] - b.bg[0] > 6) differences.push('bgLighter');
  if (b.bg[0] - a.bg[0] > 6) differences.push('bgDarker');
  if (a.coverage - b.coverage > 0.1) differences.push('moreVeins');
  if (b.coverage - a.coverage > 0.1) differences.push('fewerVeins');
  if (a.contrast - b.contrast > 8) differences.push('moreContrast');
  if (b.contrast - a.contrast > 8) differences.push('lessContrast');
  if (a.linearity - b.linearity > 0.18) differences.push('moreLinear');
  if (b.linearity - a.linearity > 0.18) differences.push('lessLinear');
  const level = distance < 32 ? 'high' : distance < 60 ? 'medium' : 'low';
  return { distance, level, reasons, differences };
}

/** Riduce la foto a max 1024 px in JPEG prima dell'invio all'AI (più leggera e senza metadati GPS). */
export async function toJpegDataUrl(file: Blob, max = 1024): Promise<string> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  await img.decode();
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(url);
  return canvas.toDataURL('image/jpeg', 0.86);
}
