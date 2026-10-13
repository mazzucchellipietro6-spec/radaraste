#!/usr/bin/env node
// Invia su Telegram il messaggio del mattino con gli "Affari di oggi" (data/affari-telegram.txt).
// Funziona SOLO se nei Secrets del repository ci sono TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID:
// senza, non fa nulla e lo scrive nel log. Il token non va mai scritto nel codice.
// Come crearli (gratis): vedi la sezione "Notifiche Telegram" del README.
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT = process.env.TELEGRAM_CHAT_ID || '';
const FILE = process.argv[2] || 'data/affari-telegram.txt';
const LIMITE = 4000; // Telegram accetta messaggi fino a 4096 caratteri

// divide il testo in parti sotto il limite, senza spezzare le righe
export function parti(testo, limite = LIMITE) {
  const out = []; let cur = '';
  for (const riga of testo.split('\n')) {
    if ((cur + '\n' + riga).length > limite && cur) { out.push(cur); cur = riga; } else cur = cur ? cur + '\n' + riga : riga;
  }
  if (cur) out.push(cur);
  return out;
}

async function main() {
  if (!TOKEN || !CHAT) { console.log('Telegram non configurato (mancano TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID): nessun messaggio inviato.'); return; }
  if (!existsSync(FILE)) { console.log('Nessun file ' + FILE + ': nessun messaggio inviato.'); return; }
  const testo = (await readFile(FILE, 'utf8')).trim();
  for (const p of parti(testo)) {
    const r = await fetch('https://api.telegram.org/bot' + TOKEN + '/sendMessage', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT, text: p, disable_web_page_preview: true })
    });
    const j = await r.json().catch(() => ({}));
    // non stampare mai il token: solo l'esito
    if (!r.ok || !j.ok) { console.error('✗ Telegram ha rifiutato il messaggio: ' + (j.description || r.status)); process.exitCode = 1; return; }
  }
  console.log('✓ Messaggio Telegram inviato.');
}

if (import.meta.url === 'file://' + process.argv[1]) main();
