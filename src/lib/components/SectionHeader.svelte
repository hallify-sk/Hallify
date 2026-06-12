<script lang="ts">
	interface Props {
		overline: string;
		title: string;
	}
	const { overline, title }: Props = $props();
</script>

<div class="section-header">
	<span class="overline">{overline}</span>
	<h1>{title}</h1>
</div>

<style>
	.section-header {
		margin-bottom: 24px;
	}

	.overline {
		display: block;
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-muted);
		margin-bottom: 4px;
	}

	h1 {
		font-size: 22px;
		font-weight: 700;
		color: var(--text-base);
	}
</style>
