<script lang="ts">
	// The add / edit form of a platform webhook endpoint: URL, description, and either
	// every event or a chosen few, grouped as on the payload reference below it.
	import { enhance } from '$app/forms';
	import { t } from '$lib/i18n.svelte';
	import { PLATFORM_EVENT_GROUPS, type PlatformEventGroup } from '$lib/platform-webhook-events';

	interface Values { url?: string; description?: string | null; events?: string[] | null; all?: boolean }
	interface Props {
		action: string;
		prefix: string;
		id?: string;
		values: Values | null;
		error: string | null;
		submitLabel: string;
		onDone: () => void;
	}
	const { action, prefix, id, values, error, submitLabel, onDone }: Props = $props();

	// "Every event" when nothing was chosen before (a new endpoint, or one set to all).
	let scope = $state<'all' | 'selected'>(
		values?.all === false || (Array.isArray(values?.events) && values?.all !== true) ? 'selected' : 'all'
	);
	const groups = Object.entries(PLATFORM_EVENT_GROUPS) as [PlatformEventGroup, readonly string[]][];
	const isChecked = (ev: string) => Array.isArray(values?.events) && values.events.includes(ev);
</script>

<form
	method="POST"
	{action}
	class="ep-form"
	use:enhance={() => async ({ result, update }) => {
		if (result.type === 'success') onDone();
		await update({ reset: result.type === 'success' });
	}}
>
	{#if error}<div class="alert-error" role="alert">{error}</div>{/if}
	{#if id}<input type="hidden" name="id" value={id} />{/if}

	<div class="field">
		<label for="{prefix}-url">{t.platformWebhooks.endpointUrl}</label>
		<input id="{prefix}-url" name="url" type="url" value={values?.url ?? ''} placeholder="https://hooks.example.com/hallify" pattern="https://.*" required />
		<span class="hint">{t.platformWebhooks.urlRules}</span>
	</div>
	<div class="field">
		<label for="{prefix}-desc">{t.platformWebhooks.description}</label>
		<input id="{prefix}-desc" name="description" value={values?.description ?? ''} placeholder={t.platformWebhooks.descriptionPlaceholder} maxlength="200" />
	</div>

	<fieldset class="field events">
		<legend>{t.platformWebhooks.eventsLabel}</legend>
		<div class="scope">
			<label class="check"><input type="radio" name="scope" value="all" bind:group={scope} /> <span>{t.platformWebhooks.allEvents}</span></label>
			<label class="check"><input type="radio" name="scope" value="selected" bind:group={scope} /> <span>{t.platformWebhooks.selectedEvents}</span></label>
		</div>
		{#if scope === 'selected'}
			<div class="groups">
				{#each groups as [group, events] (group)}
					<div class="group">
						<p class="group-name">{t.platformWebhooks.groups[group]}</p>
						{#each events as ev (ev)}
							<label class="check">
								<input type="checkbox" name="event_{ev}" checked={isChecked(ev)} />
								<span>{t.platformWebhooks.events[ev as keyof typeof t.platformWebhooks.events]} <code>{ev}</code></span>
							</label>
						{/each}
					</div>
				{/each}
			</div>
		{/if}
	</fieldset>

	<div class="form-actions">
		<button type="submit" class="btn-action btn-sm">{submitLabel}</button>
		<button type="button" class="btn-outline btn-sm" onclick={onDone}>{t.common.cancel}</button>
	</div>
</form>

<style>
	.ep-form { display: flex; flex-direction: column; gap: 14px; }
	.field { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
	.field label, legend { font-size: 12px; font-weight: 600; color: var(--text-muted); }
	.field input:not([type='radio']):not([type='checkbox']) {
		height: 38px; box-sizing: border-box; padding: 0 11px; border-radius: var(--radius-sm);
		border: 1px solid var(--border); background: var(--bg-panel2); font-size: 13px; color: var(--text-base);
		font-family: inherit; outline: none; width: 100%;
	}
	.field input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }
	.hint { font-size: 11px; color: var(--text-subtle); }
	fieldset { border: 0; padding: 0; margin: 0; }
	legend { padding: 0; margin-bottom: 6px; }
	.scope { display: flex; flex-wrap: wrap; gap: 6px 18px; }
	.check { display: flex; align-items: center; gap: 7px; font-size: 12.5px; color: var(--text-base); cursor: pointer; font-weight: 500; }
	.check input { accent-color: var(--accent); cursor: pointer; flex-shrink: 0; }
	.check code { font-size: 10.5px; color: var(--text-subtle); }
	.groups { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px 22px; margin-top: 12px; }
	.group { display: flex; flex-direction: column; gap: 6px; }
	.group-name { margin: 0; font-size: 10px; font-weight: 650; text-transform: uppercase; letter-spacing: .13em; color: var(--text-muted); }
	.form-actions { display: flex; gap: 8px; }
</style>
