// Carica pdf.js (modulo ES, assets/vendor/pdfjs, licenza Apache 2.0) e lo passa agli script classici del sito, che non
// possono usare import(): js/lettore-perizia.js aggiunge questo file come <script type="module"> al primo uso e aspetta
// l'evento "radaraste:pdfjs". Il worker è un file del sito (CSP worker-src 'self').
import * as pdfjs from '../assets/vendor/pdfjs/pdf.min.mjs';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('../assets/vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
window.pdfjsLib = pdfjs;
window.dispatchEvent(new Event('radaraste:pdfjs'));
