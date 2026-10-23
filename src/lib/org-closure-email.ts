// The email a venue's client gets when the venue closes its Hallify organisation
// while they still have an upcoming booking there. Closing deletes the booking and
// the client's account on that venue's site, so without this the client would find
// out only when their links stopped working.
//
// Pure (no env, no db) so it can be tested. Users have no stored language, so the
// email is Slovak first with an English copy underneath.
import { formatDate } from '$lib/format';

export interface UpcomingBooking {
	title: string;
	event_date: string;
	hall_name: string | null;
}

export interface ClosureRecipient {
	email: string;
	first_name: string | null;
	bookings: UpcomingBooking[];
}

const esc = (s: unknown) =>
	String(s ?? '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c] as string));

/** Group booking rows by the client who made them (one email per person). */
export function groupByClient(
	rows: Array<{ email: string | null; first_name: string | null; title: string; event_date: string; hall_name: string | null }>
): ClosureRecipient[] {
	const byEmail = new Map<string, ClosureRecipient>();
	for (const r of rows) {
		const email = (r.email ?? '').trim();
		if (!email) continue;
		const key = email.toLowerCase();
		let rec = byEmail.get(key);
		if (!rec) {
			rec = { email, first_name: r.first_name, bookings: [] };
			byEmail.set(key, rec);
		}
		rec.bookings.push({ title: r.title, event_date: r.event_date, hall_name: r.hall_name });
	}
	return [...byEmail.values()];
}

export function closureEmail(orgName: string, rec: ClosureRecipient): { subject: string; html: string } {
	const list = (locale: 'sk' | 'en') =>
		rec.bookings
			.map((b) => `<li style="margin:0 0 4px">${esc(b.title)} · ${esc(formatDate(b.event_date, locale))}${b.hall_name ? ` · ${esc(b.hall_name)}` : ''}</li>`)
			.join('');
	const name = rec.first_name ? esc(rec.first_name) : '';
	const org = esc(orgName);
	const p = 'font-size:14px;line-height:1.6;color:#454a45;margin:0 0 10px';
	const html = `
	<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#202322">
		<h2 style="font-size:19px;font-weight:800;margin:0 0 12px">${org} ukončuje rezervácie cez Hallify</h2>
		<p style="${p}">Dobrý deň${name ? ` ${name}` : ''},</p>
		<p style="${p}">prevádzkovateľ <strong>${org}</strong> zrušil svoj účet v systéme Hallify. Vaše nadchádzajúce rezervácie v ňom preto boli odstránené a váš účet na jeho stránke prestane fungovať:</p>
		<ul style="${p};padding-left:20px">${list('sk')}</ul>
		<p style="${p}">Ak ste sa s prevádzkovateľom dohodli na termíne, kontaktujte ho, prosím, priamo a overte si, či vaša udalosť platí.</p>
		<hr style="border:none;border-top:1px solid #e3e5e3;margin:22px 0">
		<h3 style="font-size:15px;font-weight:700;margin:0 0 10px">${org} no longer takes bookings through Hallify</h3>
		<p style="${p}">${name ? `Hello ${name}, the` : 'The'} operator of <strong>${org}</strong> has closed its Hallify account. Your upcoming bookings there have been removed and your account on its site will stop working:</p>
		<ul style="${p};padding-left:20px">${list('en')}</ul>
		<p style="${p}">If you agreed a date with the venue, please contact them directly to confirm your event still stands.</p>
		<p style="font-size:12px;color:#878f87;margin:22px 0 0">Hallify</p>
	</div>`;
	return { subject: `${orgName}: vaša rezervácia bola zrušená / your booking was cancelled`, html };
}

/** Cookie carrying the closure summary to the confirmation page (/app/org-closed). */
export const CLOSED_COOKIE = 'hallify_org_closed';
