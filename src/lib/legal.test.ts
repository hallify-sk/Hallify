import { describe, expect, it } from 'vitest';
import { DPA, OPERATOR_VAT_REGISTERED, PRIVACY, TERMS, type LegalDoc } from './legal';
import { sk, en } from './i18n';

const text = (doc: LegalDoc) =>
	doc.sections.flatMap((s) => [s.heading, ...s.blocks.flatMap((b) => [b.p ?? '', ...(b.list ?? [])])]).join('\n');

describe('VAT wording (B128)', () => {
	it('the operator is not a VAT payer, so every document says prices are final', () => {
		expect(OPERATOR_VAT_REGISTERED).toBe(false);
		const skTerms = text(TERMS.sk);
		const enTerms = text(TERMS.en);
		// §1 and §4 used to contradict each other: "not a VAT payer" vs "prices exclude VAT".
		for (const doc of [skTerms, text(PRIVACY.sk), text(DPA.sk)]) {
			expect(doc).not.toMatch(/bez DPH|DPH, ktorá sa uplatní/i);
		}
		for (const doc of [enTerms, text(PRIVACY.en), text(DPA.en)]) {
			expect(doc).not.toMatch(/exclud\w* VAT|VAT, which is applied/i);
		}
		expect(skTerms.match(/nie je platiteľom DPH/g)?.length).toBeGreaterThanOrEqual(2);
		expect(enTerms.match(/not registered for VAT/g)?.length).toBeGreaterThanOrEqual(2);
	});

	it('the note next to plan prices says the same in both languages', () => {
		expect(sk.accountPages.pricesFinalNoVat).toMatch(/konečné.*nie je platiteľom DPH/);
		expect(en.accountPages.pricesFinalNoVat).toMatch(/final.*not a VAT payer/);
	});
});
