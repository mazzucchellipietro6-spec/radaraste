// Modelli delle email, tradotti nella lingua del cliente. Le notifiche allo staff sono in italiano.
import type { Translator } from '~/i18n';
import { getTranslator } from '~/i18n';
import { company } from '~/lib/site';
import { siteUrl } from './site-url';

export const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

type Row = [string, string | number | null | undefined];

function rowsHtml(rows: Row[]) {
  const r = rows.filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '');
  if (!r.length) return '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:20px 0;font-size:14px">
${r.map(([k, v]) => `<tr><td style="padding:8px 12px 8px 0;border-top:1px solid #e6dccb;color:#5c5850;vertical-align:top;width:38%">${esc(k)}</td><td style="padding:8px 0;border-top:1px solid #e6dccb;color:#1a1a1c;white-space:pre-wrap">${esc(v)}</td></tr>`).join('\n')}
</table>`;
}
const rowsText = (rows: Row[]) =>
  rows
    .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '')
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');

async function layout(tr: Translator, o: { heading: string; paragraphs: string[]; rows?: Row[]; cta?: { label: string; url: string }; foot?: string }) {
  const c = await company();
  const legal = [c.legalName, c.vatNumber ? `P.IVA ${c.vatNumber}` : '', c.address].filter(Boolean).join(' · ');
  const dir = tr.dir;
  const html = `<!doctype html><html lang="${tr.info.hreflang}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(o.heading)}</title></head>
<body style="margin:0;padding:0;background:#f1ece2;font-family:Helvetica,Arial,sans-serif;color:#1a1a1c">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1ece2;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#f8f6f1;border:1px solid #e6dccb">
<tr><td style="padding:32px 36px 20px;text-align:center;border-bottom:1px solid #e6dccb">
<div style="font-family:Georgia,'Times New Roman',serif;font-size:22px;letter-spacing:6px;color:#1a1a1c">WHITE CARRARA</div>
<div style="font-size:10px;letter-spacing:3px;color:#7a5e36;margin-top:6px;text-transform:uppercase">From Carrara to the World.</div>
</td></tr>
<tr><td style="padding:32px 36px;font-size:15px;line-height:1.65;text-align:${dir === 'rtl' ? 'right' : 'left'}">
<h1 style="font-family:Georgia,'Times New Roman',serif;font-weight:normal;font-size:24px;line-height:1.3;margin:0 0 18px">${esc(o.heading)}</h1>
${o.paragraphs.map((p) => `<p style="margin:0 0 14px">${esc(p)}</p>`).join('\n')}
${o.rows ? rowsHtml(o.rows) : ''}
${o.cta ? `<p style="margin:26px 0"><a href="${esc(o.cta.url)}" style="display:inline-block;background:#1a1a1c;color:#f8f6f1;text-decoration:none;padding:14px 26px;font-size:12px;letter-spacing:2px;text-transform:uppercase">${esc(o.cta.label)}</a></p>` : ''}
<p style="margin:24px 0 0">${esc(tr.t('emails.signature'))}</p>
${o.foot ? `<p style="margin:18px 0 0;font-size:12px;color:#5c5850">${esc(o.foot)}</p>` : ''}
</td></tr>
<tr><td style="padding:18px 36px;border-top:1px solid #e6dccb;font-size:11px;line-height:1.6;color:#5c5850;text-align:center">
WHITE CARRARA · ${esc(legal)}<br>${c.email ? esc(c.email) : ''}${c.phone ? ` · ${esc(c.phone)}` : ''}
</td></tr></table></td></tr></table></body></html>`;
  const text = [
    'WHITE CARRARA — From Carrara to the World.',
    '',
    o.heading,
    '',
    ...o.paragraphs,
    o.rows ? `\n${rowsText(o.rows)}` : '',
    o.cta ? `\n${o.cta.label}: ${o.cta.url}` : '',
    '',
    tr.t('emails.signature'),
    o.foot ?? '',
  ].join('\n');
  return { html, text };
}

const greet = (tr: Translator, name?: string | null) => (name ? tr.t('emails.greeting', { name: name.split(' ')[0] }) : tr.t('emails.greetingNoName'));

export async function requestReceivedEmail(lang: string, d: { name?: string | null; reference: string; rows: Row[]; materials?: boolean }) {
  const tr = await getTranslator(lang);
  const subject = tr.t('emails.requestReceived.subject', { ref: d.reference });
  const paragraphs = [`${greet(tr, d.name)} ${tr.t('emails.requestReceived.body')}`];
  if (d.materials) paragraphs.push(tr.t('emails.requestReceived.materialsNote'));
  const { html, text } = await layout(tr, {
    heading: subject,
    paragraphs,
    rows: [[tr.t('emails.reference'), d.reference], ...d.rows],
    foot: tr.t('emails.autoNote'),
  });
  return { subject, html, text };
}

export async function bookingReceivedEmail(lang: string, d: { name: string; reference: string; rows: Row[] }) {
  const tr = await getTranslator(lang);
  const subject = tr.t('emails.bookingReceived.subject', { ref: d.reference });
  const { html, text } = await layout(tr, {
    heading: subject,
    paragraphs: [`${greet(tr, d.name)} ${tr.t('emails.bookingReceived.body')}`, tr.t('emails.bookingReceived.pending')],
    rows: [[tr.t('emails.reference'), d.reference], ...d.rows],
    foot: tr.t('emails.autoNote'),
  });
  return { subject, html, text };
}

export async function bookingStatusEmail(
  lang: string,
  kind: 'bookingConfirmed' | 'bookingDeclined' | 'paymentReceived',
  d: { name: string; reference: string; rows: Row[]; payUrl?: string | null },
) {
  const tr = await getTranslator(lang);
  const subject = tr.t(`emails.${kind}.subject`, { ref: d.reference });
  const paragraphs = [`${greet(tr, d.name)} ${tr.t(`emails.${kind}.body`)}`];
  if (kind === 'bookingConfirmed' && d.payUrl) paragraphs.push(tr.t('emails.bookingConfirmed.pay'));
  const { html, text } = await layout(tr, {
    heading: subject,
    paragraphs,
    rows: [[tr.t('emails.reference'), d.reference], ...d.rows],
    cta: kind === 'bookingConfirmed' && d.payUrl ? { label: tr.t('emails.bookingConfirmed.payButton'), url: d.payUrl } : undefined,
    foot: tr.t('emails.autoNote'),
  });
  return { subject, html, text };
}

export async function simpleEmail(
  lang: string,
  kind: 'quoteSent' | 'b2bReceived' | 'b2bApproved' | 'b2bRejected' | 'newMessage',
  d: { name?: string | null; vars?: Record<string, string>; extra?: string; cta?: boolean },
) {
  const tr = await getTranslator(lang);
  const subject = tr.t(`emails.${kind}.subject`, d.vars);
  const { html, text } = await layout(tr, {
    heading: subject,
    paragraphs: [`${greet(tr, d.name)} ${tr.t(`emails.${kind}.body`, d.vars)}`, ...(d.extra ? [d.extra] : [])],
    cta: d.cta ? { label: tr.t('emails.openAccount'), url: `${siteUrl()}/${lang}/account/` } : undefined,
    foot: tr.t('emails.autoNote'),
  });
  return { subject, html, text };
}

export async function authEmail(lang: string, kind: 'authConfirm' | 'authMagic' | 'authReset', url: string, name?: string | null) {
  const tr = await getTranslator(lang);
  const subject = tr.t(`emails.${kind}.subject`);
  const { html, text } = await layout(tr, {
    heading: subject,
    paragraphs: [`${greet(tr, name)} ${tr.t(`emails.${kind}.body`)}`],
    cta: { label: tr.t(`emails.${kind}.button`), url },
  });
  return { subject, html, text };
}

/** Notifica interna allo staff (sempre in italiano). */
export async function staffEmail(title: string, rows: Row[], adminPath: string) {
  const tr = await getTranslator('it');
  const { html, text } = await layout(tr, {
    heading: title,
    paragraphs: ['Nuova attività sul sito WHITE CARRARA.'],
    rows,
    cta: { label: 'Apri nel pannello', url: `${siteUrl()}${adminPath}` },
  });
  return { subject: `[WHITE CARRARA] ${title}`, html, text };
}
