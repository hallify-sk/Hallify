<script lang="ts">
	import ClientBookingForm from '$lib/components/ClientBookingForm.svelte';
	import { t } from '$lib/i18n.svelte';
	import type { PageData, ActionData } from './$types';

	interface Props { data: PageData; form: ActionData; }
	const { data, form }: Props = $props();
</script>

<svelte:head><title>{t.publicBooking.requestReservation} – {data.hall.name}</title></svelte:head>

<div class="page">
	<ClientBookingForm
		hall={data.hall}
		blocks={data.blocks}
		takenDates={data.takenDates}
		heldDates={data.heldDates}
		earliestDate={data.earliestDate}
		holdMinutes={data.holdMinutes}
		extras={data.extras ?? []}
		backHref={`/halls/${data.hall.slug ?? data.hall.id}`}
		formError={form?.error ?? null}
		showAutoApproveNote={false}
	/>
</div>

<style>
	.page { max-width: 600px; margin: 0 auto; padding: 28px 20px; }
</style>
