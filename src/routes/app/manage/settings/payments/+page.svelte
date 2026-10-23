<script lang="ts">
	import { pageTitle } from '$lib/page-title';
	import { enhance } from '$app/forms';
	import { t } from '$lib/i18n.svelte';
	import { formatIban } from '$lib/payment';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const errorFor = (field: string) => (form && 'field' in form && form.field === field ? form.error : '');
</script>

<svelte:head><title>{pageTitle(t.payment.settingsTab, t.settings.title)}</title></svelte:head>

<section class="section section--lead" id="payments">
	<div class="section-head">
		<h2>{t.payment.settingsTitle}</h2>
		<p>{t.payment.settingsHint}</p>
	</div>

	<form method="POST" action="?/save" class="pay-defaults"
		use:enhance={() => async ({ update }) => { await update({ reset: false }); }}>
		<div class="field-row">
			<div class="field">
				<label for="pd-iban">{t.payment.iban}</label>
				<input id="pd-iban" name="iban" type="text" autocomplete="off" spellcheck="false"
					value={data.defaults.iban ? formatIban(data.defaults.iban) : ''} placeholder="SK00 0000 0000 0000 0000 0000"
					aria-invalid={!!errorFor('iban')} />
			</div>
			<div class="field">
				<label for="pd-bic">{t.payment.bic}</label>
				<input id="pd-bic" name="bic" type="text" autocomplete="off" spellcheck="false" maxlength="11"
					value={data.defaults.bic} placeholder="TATRSKBX" aria-invalid={!!errorFor('bic')} />
			</div>
		</div>
		<div class="field">
			<label for="pd-recipient">{t.payment.recipient}</label>
			<input id="pd-recipient" name="recipient" type="text" maxlength="140"
				value={data.defaults.recipient} placeholder={t.payment.recipientPlaceholder} />
		</div>
		<div class="field">
			<label for="pd-note">{t.payment.defaultNote}</label>
			<textarea id="pd-note" name="note" rows="3" maxlength="1000" placeholder={t.payment.defaultNotePlaceholder}>{data.defaults.note}</textarea>
		</div>
		{#if form?.error}<p class="pd-err" role="alert">{form.error}</p>{/if}
		{#if form?.saved}<p class="pd-ok" role="status">{t.payment.defaultsSaved}</p>{/if}
		<div class="pd-actions">
			<button type="submit" class="btn-action">{t.payment.saveDefaults}</button>
		</div>
	</form>
</section>

<style>
	.pay-defaults { max-width: 640px; }
	.pay-defaults label { font-size: 12px; font-weight: 600; color: var(--text-muted); }
	.pay-defaults textarea { resize: vertical; }
	.pd-actions { display: flex; justify-content: flex-end; }
	.pd-err { color: var(--danger); font-size: 12.5px; margin: 0 0 10px; }
	.pd-ok { color: var(--success); font-size: 12.5px; margin: 0 0 10px; }
	@media (max-width: 560px) { .field-row { grid-template-columns: 1fr; } }
</style>
