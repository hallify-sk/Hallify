// One branded layout for every email, and the template renderer.
//
// Email clients ignore most <style> blocks, so everything is inline. Template bodies
// (editable by platform admins) are plain <h2>/<p>/<blockquote>; the inline styles
// are added here, so a customised template gets the same look.

import { isHttpUrl } from '$lib/safe-url';
import type { EmailLocale } from './email-copy';

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value: unknown): string {
	return String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/** Free text as HTML: escaped, with its line breaks kept. */
export function textToHtml(value: unknown): string {
	return escapeHtml(value).replace(/\r\n|\r|\n/g, '<br>');
}

/**
 * Fill {{variables}}. Every value is escaped: names, titles and messages are typed
 * by clients and staff, and used to land in staff inboxes as live HTML (links,
 * tracking images) under the platform's own sender address.
 */
export function renderTemplate(template: string, vars: Record<string, string | null | undefined>): string {
	const html = template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => textToHtml(vars[key] ?? ''));
	// A variable that came out empty leaves an empty paragraph or quote behind.
	return html.replace(/<(p|blockquote)(\s[^>]*)?>\s*<\/\1>\s*/gi, '');
}

const FONT = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const INK = '#202322';
const MUTED = '#5d635d';
const FAINT = '#878f87';
const LINE = '#e6e4df';
const ACCENT = '#f05ca1';
const ACCENT_INK = '#27131c';

const TAG_STYLES: Record<string, string> = {
	h2: `margin:0 0 12px;font-size:20px;line-height:1.3;font-weight:800;color:${INK}`,
	p: `margin:0 0 14px;font-size:15px;line-height:1.6;color:${INK}`,
	blockquote: `margin:0 0 16px;padding:12px 16px;background:#f9f8f6;border-left:3px solid ${ACCENT};border-radius:6px;font-size:15px;line-height:1.6;color:${INK};white-space:pre-wrap`,
	a: `color:#a6225e;word-break:break-all`,
};

/** Give the bare tags of a template body their inline styles (ours first, so a
 *  style the template sets itself still wins). */
export function styleBody(html: string): string {
	return html.replace(/<(h2|p|blockquote|a)(\s[^>]*)?>/gi, (match, tag: string, attrs: string | undefined) => {
		const style = TAG_STYLES[tag.toLowerCase()];
		const rest = attrs ?? '';
		if (/\sstyle\s*=\s*"/i.test(rest)) {
			return `<${tag}${rest.replace(/\sstyle\s*=\s*"/i, ` style="${style};`)}>`;
		}
		return `<${tag} style="${style}"${rest}>`;
	});
}

export interface EmailLayout {
	locale: EmailLocale;
	/** Shown in the header: the venue's name, or Hallify. */
	brand: string;
	/** Used as the document title and the inbox preview line. */
	subject: string;
	/** Already-safe HTML (a rendered template or code-built markup). */
	bodyHtml: string;
	/** Label/value rows shown under the body. Values are plain text. */
	details?: Array<[label: string, value: string | null | undefined]>;
	/** A quoted note (plain text), e.g. the venue's message with a status change. */
	note?: { label: string; text: string } | null;
	cta?: { label: string; url: string } | null;
	/** Plain-text footer lines. */
	footer?: string[];
	/** Text for the "copy this link" line under the button. */
	linkFallback?: string;
}

export function renderLayout(o: EmailLayout): string {
	const rows = (o.details ?? []).filter(([, v]) => v != null && String(v).trim() !== '');
	const details = rows.length
		? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:4px 0 18px;border:1px solid ${LINE};border-radius:10px;background:#fbfaf8;border-collapse:separate">
${rows.map(([k, v], i) => `<tr><td style="${FONT};padding:9px 14px;font-size:13px;color:${MUTED};width:38%;vertical-align:top${i ? `;border-top:1px solid ${LINE}` : ''}">${escapeHtml(k)}</td><td style="${FONT};padding:9px 14px;font-size:14px;color:${INK};font-weight:600;vertical-align:top${i ? `;border-top:1px solid ${LINE}` : ''}">${textToHtml(v)}</td></tr>`).join('\n')}
</table>`
		: '';

	const note = o.note && o.note.text.trim()
		? `<p style="margin:0 0 6px;font-size:13px;font-weight:700;color:${MUTED}">${escapeHtml(o.note.label)}</p>
<blockquote style="${TAG_STYLES.blockquote}">${textToHtml(o.note.text)}</blockquote>`
		: '';

	const ctaUrl = o.cta && isHttpUrl(o.cta.url) ? o.cta.url : null;
	const cta = o.cta && ctaUrl
		? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 18px"><tr><td style="border-radius:12px;background:${ACCENT}">
<a href="${escapeHtml(ctaUrl)}" style="${FONT};display:inline-block;padding:12px 22px;font-size:15px;font-weight:700;color:${ACCENT_INK};text-decoration:none;border-radius:12px">${escapeHtml(o.cta.label)}</a>
</td></tr></table>
${o.linkFallback ? `<p style="margin:0 0 4px;font-size:12px;line-height:1.5;color:${FAINT}">${escapeHtml(o.linkFallback)}<br><a href="${escapeHtml(ctaUrl)}" style="color:${FAINT};word-break:break-all">${escapeHtml(ctaUrl)}</a></p>` : ''}`
		: '';

	const footer = (o.footer ?? []).filter(Boolean).map((line) => `<p style="margin:0 0 6px;font-size:12px;line-height:1.5;color:${FAINT}">${escapeHtml(line)}</p>`).join('\n');

	return `<!doctype html>
<html lang="${o.locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(o.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f2ef">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(o.subject)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f2ef">
<tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid ${LINE};border-radius:14px;border-collapse:separate">
<tr><td style="${FONT};padding:18px 28px;border-bottom:1px solid ${LINE};font-size:16px;font-weight:800;color:${INK}"><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${ACCENT};margin-right:8px"></span>${escapeHtml(o.brand)}</td></tr>
<tr><td style="${FONT};padding:26px 28px 12px;color:${INK}">
${styleBody(o.bodyHtml)}
${details}
${note}
${cta}
</td></tr>
${footer ? `<tr><td style="${FONT};padding:14px 28px 18px;border-top:1px solid ${LINE}">\n${footer}\n</td></tr>` : ''}
</table>
</td></tr>
</table>
</body>
</html>`;
}
