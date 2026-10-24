<script lang="ts">
	import { venueTitle } from '$lib/page-title';
	import ClientBookingForm from '$lib/components/ClientBookingForm.svelte';
	import { t } from '$lib/i18n.svelte';
	import { page } from '$app/stores';
	import type { PageData, ActionData } from './$types';

	interface Props { data: PageData; form: ActionData; }
	const { data, form }: Props = $props();
</script>

<svelte:head><title>{venueTitle(data.domainOrg?.name, t.publicBooking.requestReservation, data.hall.name)}</title></svelte:head>

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
		unavailableDates={data.unavailableDates}
		fullMonths={data.fullMonths}
		formError={form?.error ?? null}
		initialDate={$page.url.searchParams.get('date')}
		initialGuests={$page.url.searchParams.get('guests')}
	/>
</div>

<style>
	/* Customer-facing, so the booking form gets the landing page's roomier gutters. */
	.page { max-width: 640px; margin: 0 auto; padding: 40px 24px 72px; }
</style>
