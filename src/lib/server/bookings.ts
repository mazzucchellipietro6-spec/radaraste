// Salvataggio delle richieste di prenotazione (sempre "richiesta": la conferma la dà lo staff).
import { asSystem, dbConfigured } from './db';
import { notifyAddress, sendEmail } from './email';
import { bookingReceivedEmail, staffEmail } from './emails';
import { currentUser } from './auth';
import type { APIContext } from 'astro';

export interface NewBooking {
  kind: 'experience' | 'destination' | 'custom_trip' | 'transfer';
  itemSlug: string | null;
  itemTitle: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  nationality: string | null;
  lang: string;
  preferredDate: string | null;
  alternativeDate: string | null;
  participants: number | null;
  guideLanguage: string | null;
  transfer: boolean;
  transferDetails: string | null;
  notes: string | null;
  details?: Record<string, unknown>;
}

export async function saveBooking(ctx: APIContext, b: NewBooking, customerRows: [string, string | number | null][]) {
  const user = await currentUser(ctx).catch(() => null);
  let saved: { id: string | null; reference: string } | null = null;
  if (dbConfigured()) {
    const rows = await asSystem(
      (tx) => tx<{ id: string; reference: string }[]>`
      insert into public.bookings (kind, item_slug, item_title, user_id, first_name, last_name, email, phone, nationality, lang,
        preferred_date, alternative_date, participants, guide_language, transfer, transfer_details, notes, details, privacy_consent_at)
      values (${b.kind}, ${b.itemSlug}, ${b.itemTitle}, ${user?.id ?? null}, ${b.firstName}, ${b.lastName}, ${b.email}, ${b.phone}, ${b.nationality}, ${b.lang},
        ${b.preferredDate}, ${b.alternativeDate}, ${b.participants}, ${b.guideLanguage}, ${b.transfer}, ${b.transferDetails}, ${b.notes},
        ${tx.json((b.details ?? {}) as never)}, now())
      returning id, reference`,
    );
    saved = rows[0];
  } else {
    saved = { id: null, reference: `WC-B-${Date.now().toString(36).toUpperCase()}` };
  }
  const name = `${b.firstName} ${b.lastName}`;
  const mail = await bookingReceivedEmail(b.lang, { name, reference: saved.reference, rows: customerRows });
  await sendEmail({ to: b.email, ...mail, template: 'booking-received', lang: b.lang, related: saved.id ? { type: 'booking', id: saved.id } : undefined });
  const to = notifyAddress();
  if (to) {
    const staff = await staffEmail(`Nuova richiesta di prenotazione ${saved.reference}`, [
      ['Tipo', b.kind],
      ['Esperienza / destinazione', b.itemTitle],
      ['Cliente', name],
      ['Email', b.email],
      ['Telefono', b.phone],
      ['Nazionalità', b.nationality],
      ['Data preferita', b.preferredDate],
      ['Data alternativa', b.alternativeDate],
      ['Partecipanti', b.participants],
      ['Lingua', b.guideLanguage],
      ['Transfer', b.transfer ? `Sì — ${b.transferDetails ?? ''}` : 'No'],
      ['Note', b.notes],
      ['Dettagli', b.details && Object.keys(b.details).length ? JSON.stringify(b.details, null, 1) : null],
    ], saved.id ? `/admin/bookings/${saved.id}/` : '/admin/');
    await sendEmail({ to, ...staff, template: 'staff-booking', lang: 'it', replyTo: b.email });
  }
  return saved;
}
