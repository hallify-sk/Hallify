import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { st } from '$lib/i18n-server';
import { requireOrgPermission } from '$lib/server/access';
import { parsePaymentDefaults, type DefaultsField } from '$lib/payment';
import { loadPaymentDefaults, savePaymentDefaults } from '$lib/server/payments';

/** The venue's default payment instructions (D6): the account, its holder and a note
 *  clients see on every booking that states no account of its own. Hallify itself
 *  collects nothing. */
export const load: PageServerLoad = async ({ locals }) => {
	const org = await requireOrgPermission(locals, 'settings.manage');
	return { defaults: await loadPaymentDefaults(locals.db, org.id) };
};

export const actions: Actions = {
	save: async ({ request, locals }) => {
		const org = await requireOrgPermission(locals, 'settings.manage');
		const data = await request.formData();
		const parsed = parsePaymentDefaults({
			iban: String(data.get('iban') ?? ''),
			bic: String(data.get('bic') ?? ''),
			recipient: String(data.get('recipient') ?? ''),
			note: String(data.get('note') ?? ''),
		});
		if (!parsed.ok) {
			const p = st(locals.locale).payment;
			const byField: Record<DefaultsField, string> = { iban: p.errIban, bic: p.errBic, recipient: p.errRecipient, note: p.errNote };
			return fail(400, { error: byField[parsed.field], field: parsed.field });
		}
		await savePaymentDefaults(locals.db, org.id, parsed.values);
		return { saved: true };
	},
};
