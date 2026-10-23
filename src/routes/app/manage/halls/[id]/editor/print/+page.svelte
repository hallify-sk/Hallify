<script lang="ts">
	import PlanPrintDoc from '$lib/editor/PlanPrintDoc.svelte';
	import { t } from '$lib/i18n.svelte';
	import type { PageData } from './$types';

	interface Props { data: PageData; }
	const { data }: Props = $props();
</script>

<svelte:head><title>{t.halls.floorplan} – {data.hall.name} – Hallify</title></svelte:head>

<PlanPrintDoc layout={data.layout} title={data.hall.name} subtitle={t.halls.floorplan}
	backHref={`/app/manage/halls/${data.hall.id}/editor`} />
