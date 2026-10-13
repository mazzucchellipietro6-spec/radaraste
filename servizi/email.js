/* Email degli abbonamenti: modelli in italiano (testo semplice e HTML sobrio) e invio con l'API di Resend.
 * Si invia SOLO se ci sono RESEND_API_KEY ed EMAIL_MITTENTE (variabili d'ambiente); altrimenti l'email non parte e
 * resta solo una riga nel registro. Un invio fallito non blocca mai la funzione che lo chiede. */
import { registra, sito } from './risposte.js';

export const API_RESEND = 'https://api.resend.com/emails';
const NOME = 'Radar Aste Italia';

const escape = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const NOMI_PIANI = { gratis: 'Gratis', base: 'Base', pro: 'Pro' };
const nomePiano = (p) => NOMI_PIANI[p] || 'a pagamento';

// "2026-10-27T10:00:00Z" → "27 ottobre 2026" (ora italiana); null se manca
export function dataItaliana(valore) {
  if (!valore) return null;
  const d = new Date(valore);
  if (isNaN(d)) return null;
  return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Rome' });
}

// indirizzo del sito con la pagina (o null se SITO_URL manca)
const pagina = (dati, nome) => (dati.sito ? dati.sito + '/' + nome : null);

/* ogni modello riceve { sito, piano, fineProva, finePeriodo, linkFattura, test } e restituisce
 * { oggetto, paragrafi, link: { testo, url } | null } */
export const MODELLI = {
  benvenuto: (d) => ({
    oggetto: 'Benvenuto in ' + NOME + ' ' + nomePiano(d.piano),
    paragrafi: [
      'Grazie: il tuo abbonamento ' + nomePiano(d.piano) + ' a ' + NOME + ' è attivo.',
      d.fineProva ? 'La prova gratuita dura fino al ' + dataItaliana(d.fineProva) + '. Prima di quella data puoi disdire senza alcun addebito.' : null,
      'Puoi vedere il piano, cambiare il metodo di pagamento o disdire in qualsiasi momento dalla pagina del tuo account.'
    ],
    link: pagina(d, 'account.html') && { testo: 'Vai al tuo account', url: pagina(d, 'account.html') }
  }),
  provaInScadenza: (d) => ({
    oggetto: 'La tua prova gratuita sta per finire',
    paragrafi: [
      'La prova gratuita del piano ' + nomePiano(d.piano) + ' di ' + NOME + ' finisce' + (d.fineProva ? ' il ' + dataItaliana(d.fineProva) : ' tra pochi giorni') + '.',
      'Se non fai nulla, l\'abbonamento continua e il primo pagamento parte alla fine della prova con il metodo che hai indicato.',
      'Se non vuoi continuare, disdici prima di quella data dalla pagina del tuo account: non ti verrà addebitato nulla.'
    ],
    link: pagina(d, 'account.html') && { testo: 'Gestisci l\'abbonamento', url: pagina(d, 'account.html') }
  }),
  pagamentoNonRiuscito: (d) => ({
    oggetto: 'Pagamento non riuscito per il tuo abbonamento',
    paragrafi: [
      'Non siamo riusciti a incassare il pagamento del tuo abbonamento ' + nomePiano(d.piano) + ' a ' + NOME + '.',
      'Controlla il metodo di pagamento dalla pagina del tuo account: il pagamento verrà ritentato nei prossimi giorni. Se non va a buon fine, dopo qualche giorno tornerai al piano Gratis.',
      d.linkFattura ? 'Puoi anche pagare direttamente la fattura da qui: ' + d.linkFattura : null
    ],
    link: pagina(d, 'account.html') && { testo: 'Aggiorna il metodo di pagamento', url: pagina(d, 'account.html') }
  }),
  abbonamentoDisdetto: (d) => ({
    oggetto: 'Il tuo abbonamento è terminato',
    paragrafi: [
      'Il tuo abbonamento ' + nomePiano(d.piano) + ' a ' + NOME + ' è terminato: da ora usi il piano Gratis.',
      'Le aste seguite, le note e le ricerche salvate restano dove sono. Se vuoi, puoi abbonarti di nuovo in qualsiasi momento.'
    ],
    link: pagina(d, 'prezzi.html') && { testo: 'Vedi i piani', url: pagina(d, 'prezzi.html') }
  }),
  accountCancellato: (d) => ({
    oggetto: 'Il tuo account è stato cancellato',
    paragrafi: [
      'Come richiesto, abbiamo cancellato il tuo account di ' + NOME + ' e i dati collegati (diritto alla cancellazione, art. 17 del GDPR).',
      'Gli abbonamenti attivi sono stati annullati: non riceverai altri addebiti. I dati di fatturazione restano presso il servizio di pagamento solo per il tempo richiesto dagli obblighi fiscali.',
      'I dati salvati nel browser (aste seguite, note, preferenze) restano sul tuo dispositivo: puoi cancellarli dalle impostazioni del browser.',
      'Se non hai chiesto tu la cancellazione, contatta subito il titolare del sito ai recapiti indicati nell\'informativa sulla privacy.'
    ],
    link: pagina(d, 'privacy.html') && { testo: 'Informativa sulla privacy', url: pagina(d, 'privacy.html') }
  })
};

// compone l'email: { oggetto, testo, html }
export function componi(nome, dati = {}) {
  const modello = MODELLI[nome];
  if (!modello) throw new Error('Modello di email sconosciuto: ' + nome);
  const m = modello(dati);
  const paragrafi = m.paragrafi.filter(Boolean);
  if (dati.test) paragrafi.push('Modalità test: nessun pagamento reale.');
  const piede = 'Questa è un\'email automatica di ' + NOME + '.';
  const testo = [...paragrafi, m.link ? m.link.testo + ': ' + m.link.url : null].filter(Boolean).join('\n\n') + '\n\n-- \n' + piede + '\n';
  const html = '<!doctype html><html lang="it"><body style="margin:0;padding:24px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5">' +
    '<div style="max-width:560px;margin:0 auto">' +
    '<p style="font-weight:bold;margin:0 0 16px">' + NOME + '</p>' +
    paragrafi.map((p) => '<p style="margin:0 0 12px">' + escape(p) + '</p>').join('') +
    (m.link ? '<p style="margin:20px 0"><a href="' + escape(m.link.url) + '">' + escape(m.link.testo) + '</a></p>' : '') +
    '<p style="margin:24px 0 0;font-size:13px">' + escape(piede) + '</p>' +
    '</div></body></html>';
  return { oggetto: m.oggetto, testo, html };
}

export const emailValida = (a) => typeof a === 'string' && a.length <= 254 && /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/.test(a);
const maschera = (a) => String(a).replace(/^(.)[^@]*(@.*)$/, '$1***$2');

export function inviabile(env) { return !!(env && env.RESEND_API_KEY && env.EMAIL_MITTENTE); }

/* invia un'email: { a, modello, dati } → { inviata, motivo }. Non lancia mai errori.
 * dati.sito viene da SITO_URL; dati.test segnala la modalità test (chiave Stripe di test). */
export async function inviaEmail(env, { a, modello, dati = {} }) {
  if (!emailValida(a)) { registra('email "' + modello + '" non inviata: destinatario mancante o non valido'); return { inviata: false, motivo: 'destinatario' }; }
  const completo = { sito: sito(env), test: !/^(sk|rk)_live_/.test(String(env.STRIPE_SECRET_KEY || '')), ...dati };
  let email;
  try { email = componi(modello, completo); } catch (e) { registra(e.message); return { inviata: false, motivo: 'modello' }; }
  if (!inviabile(env)) {
    registra('email "' + modello + '" a ' + maschera(a) + ' non inviata: RESEND_API_KEY o EMAIL_MITTENTE mancanti');
    return { inviata: false, motivo: 'non configurata' };
  }
  try {
    const r = await fetch(API_RESEND, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.EMAIL_MITTENTE, to: [a], subject: email.oggetto, text: email.testo, html: email.html }),
      signal: AbortSignal.timeout(10000)
    });
    if (!r.ok) { registra('email "' + modello + '" non inviata: Resend ha risposto ' + r.status); return { inviata: false, motivo: 'servizio' }; }
    return { inviata: true };
  } catch (e) {
    registra('email "' + modello + '" non inviata: Resend non raggiungibile', e && e.name);
    return { inviata: false, motivo: 'rete' };
  }
}
