// A single event as an iCalendar file (RFC 5545), for "Add to calendar" on the
// client's booking page. Times are the venue's local wall-clock times, written
// "floating" (no zone): the client's calendar shows 15:00 as 15:00, which is what
// the venue and the client agreed on.

export interface IcsEvent {
	uid: string;
	title: string;
	/** YYYY-MM-DD */
	date: string;
	/** HH:MM, or null for a whole-day booking. */
	start?: string | null;
	end?: string | null;
	location?: string | null;
	description?: string | null;
	url?: string | null;
	/** Stamp time; defaults to now. */
	now?: Date;
}

/** Escape a TEXT value: backslash, semicolon, comma and newlines. */
export function icsEscape(v: string): string {
	return v.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Lines longer than 75 octets are folded (CRLF + space). */
export function icsFold(line: string): string {
	const bytes = new TextEncoder().encode(line);
	if (bytes.length <= 75) return line;
	const out: string[] = [];
	let cur = '';
	let curLen = 0;
	for (const ch of line) {
		const n = new TextEncoder().encode(ch).length;
		if (curLen + n > (out.length ? 74 : 75)) { out.push(cur); cur = ''; curLen = 0; }
		cur += ch; curLen += n;
	}
	out.push(cur);
	return out.join('\r\n ');
}

const ymd = (d: string) => d.slice(0, 10).replace(/-/g, '');
const hm = (t: string) => t.slice(0, 5).replace(':', '') + '00';
const TIME = /^\d{2}:\d{2}/;

function nextDay(date: string): string {
	const d = new Date(`${date.slice(0, 10)}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + 1);
	return d.toISOString().slice(0, 10);
}

function stamp(d: Date): string {
	return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export function buildIcs(e: IcsEvent): string {
	const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Hallify//Reservation//SK', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT'];
	lines.push(`UID:${e.uid}`);
	lines.push(`DTSTAMP:${stamp(e.now ?? new Date())}`);
	const start = e.start && TIME.test(e.start) ? e.start : null;
	const end = e.end && TIME.test(e.end) ? e.end : null;
	if (start) {
		lines.push(`DTSTART:${ymd(e.date)}T${hm(start)}`);
		if (end) {
			// An end at or before the start runs past midnight.
			const endDate = end <= start ? nextDay(e.date) : e.date;
			lines.push(`DTEND:${ymd(endDate)}T${hm(end)}`);
		} else {
			lines.push(`DTEND:${ymd(nextDay(e.date))}T000000`);
		}
	} else {
		lines.push(`DTSTART;VALUE=DATE:${ymd(e.date)}`);
		lines.push(`DTEND;VALUE=DATE:${ymd(nextDay(e.date))}`);
	}
	lines.push(`SUMMARY:${icsEscape(e.title)}`);
	if (e.location) lines.push(`LOCATION:${icsEscape(e.location)}`);
	if (e.description) lines.push(`DESCRIPTION:${icsEscape(e.description)}`);
	if (e.url) lines.push(`URL:${e.url}`);
	lines.push('END:VEVENT', 'END:VCALENDAR');
	return lines.map(icsFold).join('\r\n') + '\r\n';
}
