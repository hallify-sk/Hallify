// Platform email templates: what is worth storing, and a safe preview.
// Pure, so the platform email page and its tests share it.

/** Only the templates that really differ from the default. Empty (after trimming)
 *  or identical to the default means "use the default", so the default keeps
 *  improving for templates nobody changed, and an emptied field never sends a
 *  blank email. Unknown keys are dropped. */
export function templateOverrides(submitted: Record<string, unknown>, defaults: Record<string, string>): Record<string, string> {
	const out: Record<string, string> = {};
	for (const key of Object.keys(defaults)) {
		const v = submitted[key];
		if (typeof v !== 'string') continue;
		const norm = v.replace(/\r\n/g, '\n');
		if (!norm.trim() || norm.trim() === defaults[key].trim()) continue;
		out[key] = norm;
	}
	return out;
}

const esc = (s: string) => s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c] as string));

/** Sample values for the preview, one per variable a template may use. */
export const SAMPLE_VARS: Record<string, string> = {
	title: 'Svadba Novákovci',
	userName: 'Jana Nováková',
	guestName: 'Jana Nováková',
	senderName: 'Jana Nováková',
	hallName: 'Veľká sála',
	date: '12. 6. 2027',
	subject: 'Svadba Novákovci',
	message: 'Dobrý deň, môžeme prísť o hodinu skôr?',
	status: 'Schválená',
	resetUrl: 'https://hallify.sk/app/reset-password?token=ukazka'
};

/** The template with sample values filled in (escaped, like real data should be). */
export function previewTemplate(template: string): string {
	return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => esc(SAMPLE_VARS[key] ?? `{{${key}}}`));
}
