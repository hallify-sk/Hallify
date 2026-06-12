<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from '$lib/i18n';
	import SectionHeader from '$lib/components/SectionHeader.svelte';
	import type { PageData } from './$types';

	interface Props { data: PageData; }
	const { data }: Props = $props();

	// ── Metrics polling ──
	const MAX_POINTS = 60;
	let cpuHistory = $state<number[]>([]);
	let memHistory = $state<{ heapUsed: number; heapTotal: number; rss: number; systemUsed: number; systemTotal: number }[]>([]);
	let latestCpu = $state(0);
	let latestMem = $state({ heapUsed: 0, heapTotal: 0, rss: 0, systemUsed: 0, systemTotal: 0 });

	async function fetchMetrics() {
		try {
			const res = await fetch('/api/system-metrics');
			if (!res.ok) return;
			const d = await res.json();
			latestCpu = d.cpu;
			latestMem = d.memory;
			cpuHistory = [...cpuHistory.slice(-(MAX_POINTS - 1)), d.cpu];
			memHistory = [...memHistory.slice(-(MAX_POINTS - 1)), d.memory];
		} catch { /* ignore */ }
	}

	function buildPath(values: number[], maxVal: number, w: number, h: number): string {
		if (values.length < 2) return '';
		const step = w / (MAX_POINTS - 1);
		const offset = (MAX_POINTS - values.length) * step;
		return values.map((v, i) => {
			const x = offset + i * step;
			const y = h - (v / maxVal) * h;
			return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
		}).join(' ');
	}

	function buildArea(values: number[], maxVal: number, w: number, h: number): string {
		const line = buildPath(values, maxVal, w, h);
		if (!line) return '';
		const step = w / (MAX_POINTS - 1);
		const offset = (MAX_POINTS - values.length) * step;
		const lastX = offset + (values.length - 1) * step;
		return `${line} L${lastX.toFixed(1)},${h} L${offset.toFixed(1)},${h} Z`;
	}

	const CHART_W = 400;
	const CHART_H = 80;

	const cpuPath = $derived(buildPath(cpuHistory, 100, CHART_W, CHART_H));
	const cpuArea = $derived(buildArea(cpuHistory, 100, CHART_W, CHART_H));

	const memMaxMB = $derived(latestMem.systemTotal || 16384);
	const memRssPath = $derived(buildPath(memHistory.map(m => m.rss), memMaxMB, CHART_W, CHART_H));
	const memRssArea = $derived(buildArea(memHistory.map(m => m.rss), memMaxMB, CHART_W, CHART_H));
	const memHeapPath = $derived(buildPath(memHistory.map(m => m.heapUsed), memMaxMB, CHART_W, CHART_H));
	const memHeapArea = $derived(buildArea(memHistory.map(m => m.heapUsed), memMaxMB, CHART_W, CHART_H));

	onMount(() => {
		fetchMetrics();
		const timer = setInterval(fetchMetrics, 5000);
		return () => clearInterval(timer);
	});
</script>

<svelte:head><title>{t.settings.tabOverview} – {t.settings.title} – Hallify</title></svelte:head>

<div class="page">
<SectionHeader overline={t.settings.manage} title={t.settings.tabOverview} />

<!-- Live Metrics Charts -->
<div class="charts-row">
	<div class="card chart-card">
		<div class="chart-header">
			<h3>CPU Usage</h3>
			<span class="chart-value">{latestCpu}%</span>
		</div>
		<svg viewBox="0 0 {CHART_W} {CHART_H}" class="chart-svg" preserveAspectRatio="none">
			{#each [25, 50, 75] as pct}
				<line x1="0" y1={CHART_H - (pct / 100) * CHART_H} x2={CHART_W} y2={CHART_H - (pct / 100) * CHART_H} class="grid-line" />
			{/each}
			{#if cpuArea}
				<path d={cpuArea} class="area cpu-area" />
				<path d={cpuPath} class="line cpu-line" />
			{/if}
		</svg>
		<div class="chart-labels">
			<span>0%</span><span>50%</span><span>100%</span>
		</div>
	</div>

	<div class="card chart-card">
		<div class="chart-header">
			<h3>Memory Usage</h3>
			<span class="chart-value">{latestMem.rss} MB</span>
		</div>
		<svg viewBox="0 0 {CHART_W} {CHART_H}" class="chart-svg" preserveAspectRatio="none">
			{#each [25, 50, 75] as pct}
				<line x1="0" y1={CHART_H - (pct / 100) * CHART_H} x2={CHART_W} y2={CHART_H - (pct / 100) * CHART_H} class="grid-line" />
			{/each}
			{#if memRssArea}
				<path d={memRssArea} class="area rss-area" />
				<path d={memRssPath} class="line rss-line" />
			{/if}
			{#if memHeapArea}
				<path d={memHeapArea} class="area heap-area" />
				<path d={memHeapPath} class="line heap-line" />
			{/if}
		</svg>
		<div class="chart-legend">
			<span class="legend-item"><span class="legend-dot rss-dot"></span> RSS ({latestMem.rss} MB)</span>
			<span class="legend-item"><span class="legend-dot heap-dot"></span> Heap ({latestMem.heapUsed} MB)</span>
			<span class="legend-item legend-total">System: {latestMem.systemUsed} / {latestMem.systemTotal} MB</span>
		</div>
	</div>
</div>

<!-- System Info -->
<div class="card sys-card">
	<h3>{t.settings.system}</h3>
	<div class="info-grid">
		<div class="info-item">
			<span class="info-label">{t.settings.version}</span>
			<span class="info-value">{data.system.version}</span>
		</div>
		<div class="info-item">
			<span class="info-label">{t.settings.nodeVersion}</span>
			<span class="info-value">{data.system.nodeVersion}</span>
		</div>
		<div class="info-item">
			<span class="info-label">{t.settings.dbStatus}</span>
			<span class="info-value" class:connected={data.system.dbConnected} class:disconnected={!data.system.dbConnected}>
				{data.system.dbConnected ? t.settings.connected : t.settings.disconnected}
			</span>
		</div>
		<div class="info-item">
			<span class="info-label">{t.settings.uptime}</span>
			<span class="info-value">{data.system.uptime}</span>
		</div>
		<div class="info-item">
			<span class="info-label">Memory</span>
			<span class="info-value">{data.system.memoryUsage} MB</span>
		</div>
		<div class="info-item">
			<span class="info-label">Platform</span>
			<span class="info-value">{data.system.platform}</span>
		</div>
	</div>
	<div class="license-box">
		<div class="license-label">{t.settings.license}</div>
		<div class="license-type">{t.settings.licenseCommunity}</div>
	</div>
</div>
</div>

<style>
	.page { padding: 28px 32px; }

	.charts-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 20px;
		margin-bottom: 20px;
	}

	.chart-card { padding: 14px 18px; }

	.chart-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 8px;
	}

	.chart-header h3 {
		font-size: 12px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--accent);
		margin: 0;
	}

	.chart-value {
		font-size: 16px;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		color: var(--text-base);
	}

	.chart-svg {
		width: 100%;
		height: 80px;
		border-radius: 6px;
		background: var(--bg-panel2);
	}

	.grid-line { stroke: var(--border); stroke-width: 0.5; stroke-dasharray: 4 3; }
	.line { fill: none; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
	.area { opacity: 0.15; }
	.cpu-line { stroke: #7b6cf0; }
	.cpu-area { fill: #7b6cf0; }
	.rss-line { stroke: #3b82f6; }
	.rss-area { fill: #3b82f6; }
	.heap-line { stroke: #f59e0b; }
	.heap-area { fill: #f59e0b; }

	.chart-labels {
		display: flex;
		justify-content: space-between;
		font-size: 9px;
		color: var(--text-muted);
		margin-top: 2px;
	}

	.chart-legend {
		display: flex;
		gap: 12px;
		font-size: 10px;
		color: var(--text-muted);
		margin-top: 6px;
		flex-wrap: wrap;
	}

	.legend-item { display: flex; align-items: center; gap: 4px; }
	.legend-dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; }
	.rss-dot { background: #3b82f6; }
	.heap-dot { background: #f59e0b; }
	.legend-total { margin-left: auto; font-weight: 600; }

	.sys-card {
		padding: 24px;
		max-width: 600px;
	}

	.sys-card h3 {
		font-size: 14px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--accent);
		margin: 0 0 16px;
	}

	.info-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px 16px;
		margin-bottom: 16px;
	}

	.info-item {
		display: flex;
		justify-content: space-between;
		padding: 8px 0;
		border-bottom: 1px solid var(--border);
	}

	.info-label { font-size: 12px; color: var(--text-muted); }
	.info-value { font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums; }
	.connected { color: #15803d; }
	.disconnected { color: #dc2626; }

	.license-box {
		background: var(--bg-panel2);
		border-radius: 8px;
		padding: 12px 16px;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.license-label { font-size: 12px; color: var(--text-muted); font-weight: 600; }
	.license-type { font-size: 13px; font-weight: 700; color: var(--accent); }

	@media (max-width: 900px) {
		.charts-row { grid-template-columns: 1fr; }
	}
</style>
