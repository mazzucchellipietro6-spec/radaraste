// Azioni sulle prenotazioni: verifica, conferma, link di pagamento Stripe, rifiuto, dati interni.
import type { APIRoute } from 'astro';
import { canAccess, resource } from '~/lib/server/admin/resources';
import { withUser } from '~/lib/server/db';
import { readBody } from '~/lib/server/http';
import { createPaymentLink } from '~/lib/server/stripe';
import { sendEmail } from '~/lib/server/email';
import { bookingStatusEmail } from '~/lib/server/emails';
import { getTranslator } from '~/i18n';

export const prerender = false;

type B = { id: string; reference: string; first_name: string; last_name: string; email: string; lang: string | null; item_title: string | null; preferred_date: Date | null; participants: number | null; price: string | null; currency: string };

export const POST: APIRoute = async (ctx) => {
  const admin = ctx.locals.admin!;
  if (!canAccess(resource('bookings')!, admin.profile)) return new Response('Non autorizzato', { status: 403 });
  const b = await readBody(ctx.request);
  const id = String(b.id ?? '');
  const go = (q: string) => new Response(null, { status: 303, headers: { location: `/admin/bookings/${id}/?${q}` } });
  if (!/^[0-9a-f-]{36}$/.test(id)) return go('error=ID%20non%20valido');
  const booking = await withUser(admin.user.claims, async (tx) => (await tx<B[]>`select id, reference, first_name, last_name, email, lang, item_title, preferred_date, participants, price, currency from public.bookings where id = ${id}`)[0]);
  if (!booking) return go('error=Prenotazione%20non%20trovata');
  const lang = booking.lang ?? 'en';
  const tr = await getTranslator(lang);
  const rows: [string, string | number | null][] = [
    [tr.t('emails.fields.experience'), booking.item_title],
    [tr.t('emails.fields.date'), booking.preferred_date ? tr.fmt.date(booking.preferred_date) : null],
    [tr.t('emails.fields.participants'), booking.participants],
  ];
  const name = `${booking.first_name} ${booking.last_name}`;
  try {
    switch (b.action) {
      case 'checking':
        await withUser(admin.user.claims, (tx) => tx`update public.bookings set status = 'checking' where id = ${id}`);
        return go('ok=Stato%20aggiornato');
      case 'confirm': {
        await withUser(admin.user.claims, (tx) => tx`update public.bookings set status = 'confirmed', confirmed_at = now() where id = ${id}`);
        const mail = await bookingStatusEmail(lang, 'bookingConfirmed', { name, reference: booking.reference, rows });
        await sendEmail({ to: booking.email, ...mail, template: 'booking-confirmed', lang, related: { type: 'booking', id } });
        return go('ok=Prenotazione%20confermata%20e%20cliente%20avvisato');
      }
      case 'confirm_pay': {
        const amount = Number(String(b.amount ?? '').replace(',', '.'));
        const link = await createPaymentLink({
          kind: 'booking', refId: id, reference: booking.reference, description: booking.item_title ?? 'WHITE CARRARA', amount, currency: booking.currency || 'EUR',
          email: booking.email, lang, createdBy: admin.user.id,
        });
        await withUser(admin.user.claims, (tx) => tx`update public.bookings set status = 'awaiting_payment', confirmed_at = now(), price = ${amount}, payment_url = ${link.url} where id = ${id}`);
        const mail = await bookingStatusEmail(lang, 'bookingConfirmed', { name, reference: booking.reference, rows: [...rows, [tr.t('emails.fields.price'), tr.fmt.price(amount)]], payUrl: link.url });
        await sendEmail({ to: booking.email, ...mail, template: 'booking-confirmed-pay', lang, related: { type: 'booking', id } });
        return go('ok=Link%20di%20pagamento%20inviato');
      }
      case 'complete':
        await withUser(admin.user.claims, (tx) => tx`update public.bookings set status = 'completed' where id = ${id}`);
        return go('ok=Segnata%20come%20completata');
      case 'decline': {
        await withUser(admin.user.claims, (tx) => tx`update public.bookings set status = 'declined' where id = ${id}`);
        const mail = await bookingStatusEmail(lang, 'bookingDeclined', { name, reference: booking.reference, rows });
        await sendEmail({ to: booking.email, ...mail, template: 'booking-declined', lang, related: { type: 'booking', id } });
        return go('ok=Cliente%20avvisato');
      }
      case 'internal': {
        const partner = /^[0-9a-f-]{36}$/.test(String(b.partner_id ?? '')) ? String(b.partner_id) : null;
        const cost = b.partner_cost ? Number(String(b.partner_cost).replace(',', '.')) : null;
        const confirmed = b.partner_confirmed === 'on';
        await withUser(admin.user.claims, (tx) => tx`insert into public.booking_internal (booking_id, partner_id, partner_cost, partner_confirmed_at, notes)
          values (${id}, ${partner}, ${Number.isFinite(cost) ? cost : null}, ${confirmed ? new Date() : null}, ${String(b.notes ?? '').slice(0, 5000) || null})
          on conflict (booking_id) do update set partner_id = excluded.partner_id, partner_cost = excluded.partner_cost,
            partner_confirmed_at = case when ${confirmed} then coalesce(public.booking_internal.partner_confirmed_at, now()) else null end, notes = excluded.notes`);
        return go('ok=1');
      }
    }
  } catch (err) {
    return go(`error=${encodeURIComponent((err as Error).message.slice(0, 200))}`);
  }
  return go('error=Azione%20sconosciuta');
};
