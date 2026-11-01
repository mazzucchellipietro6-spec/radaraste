// Invio email con Resend (https://resend.com). Ogni invio viene registrato nella tabella email_log.
// Senza RESEND_API_KEY le email non partono e il registro lo segnala come "skipped".
import { asSystem, dbConfigured } from './db';
import { env } from './env';

export interface Mail {
  to: string;
  subject: string;
  html: string;
  text: string;
  template: string;
  lang?: string;
  replyTo?: string;
  related?: { type: string; id: string };
}

export const emailConfigured = () => !!env('RESEND_API_KEY') && !!env('EMAIL_FROM');

export async function sendEmail(mail: Mail): Promise<'sent' | 'skipped' | 'failed'> {
  let status: 'sent' | 'skipped' | 'failed' = 'skipped';
  let providerId: string | null = null;
  let error: string | null = null;
  if (emailConfigured()) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${env('RESEND_API_KEY')}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          from: env('EMAIL_FROM'),
          to: [mail.to],
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
          reply_to: mail.replyTo ?? env('EMAIL_REPLY_TO') ?? undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
      if (res.ok) {
        status = 'sent';
        providerId = data.id ?? null;
      } else {
        status = 'failed';
        error = data.message ?? `HTTP ${res.status}`;
      }
    } catch (err) {
      status = 'failed';
      error = (err as Error).message;
    }
  } else {
    console.warn(`[email] non inviata (RESEND_API_KEY o EMAIL_FROM mancanti): "${mail.subject}" a ${mail.to}`);
  }
  if (dbConfigured()) {
    await asSystem(
      (tx) => tx`insert into public.email_log (to_email, subject, template, lang, status, provider_id, error, related_type, related_id)
                values (${mail.to}, ${mail.subject}, ${mail.template}, ${mail.lang ?? null}, ${status}, ${providerId}, ${error},
                        ${mail.related?.type ?? null}, ${mail.related?.id ?? null})`,
    ).catch((e) => console.warn('[email] registro non aggiornato:', (e as Error).message));
  }
  if (status === 'failed') console.error('[email] invio fallito:', error);
  return status;
}

/** Indirizzo a cui arrivano le notifiche per lo staff (nuove richieste, prenotazioni, B2B). */
export const notifyAddress = () => env('ADMIN_NOTIFY_EMAIL') ?? env('ADMIN_EMAILS')?.split(',')[0]?.trim();
