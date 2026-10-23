<script lang="ts">
	import PlanPrintDoc from '$lib/editor/PlanPrintDoc.svelte';
	import { t } from '$lib/i18n.svelte';
	import type { PageData } from './$types';

	interface Props { data: PageData; }
	const { data }: Props = $props();
</script>

<svelte:head><title>{data.template.name} — {t.halls.templates} – Hallify</title></svelte:head>

<PlanPrintDoc layout={data.layout} title={data.template.name} subtitle={`${t.halls.templates} · ${data.template.hallName}`}
	backHref={`/app/manage/halls/${data.hallId}/templates/${data.template.id}`} showTables={true} />
