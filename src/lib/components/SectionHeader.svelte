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
		font-size: 10px;
		font-weight: 650;
		letter-spacing: 0.13em;
		line-height: 1.7;
		text-transform: uppercase;
		color: var(--accent-ink);
		margin-bottom: 10px;
	}

	h1 {
		/* --display-size, not a fixed clamp: this component is used on both density
		   tiers, and a hardcoded marketing-scale title rendered ~40px on operator
		   screens that ask for ~30px. */
		font-size: var(--display-size, clamp(28px, 3.2vw, 40px));
		font-weight: 550;
		letter-spacing: -0.055em;
		line-height: 1.08;
		color: var(--text-base);
	}
</style>
