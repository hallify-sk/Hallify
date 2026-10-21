<script lang="ts">
	/** A first-run tip for the current step. The parent positions it. */
	interface Props {
		title: string;
		text: string;
		dismissLabel: string;
		onDismiss: () => void;
	}
	const { title, text, dismissLabel, onDismiss }: Props = $props();
</script>

<div class="coach" role="note">
	<span class="arrow" aria-hidden="true"></span>
	<b>{title}</b>
	<p>{text}</p>
	<div class="row">
		<button type="button" class="ok" onclick={onDismiss}>{dismissLabel}</button>
	</div>
</div>

<style>
	.coach {
		position: relative; width: 256px; padding: 12px 14px; border-radius: var(--radius-xl);
		background: var(--text-base); color: var(--bg-panel); font-size: 12.5px; line-height: 1.45;
		box-shadow: 0 10px 30px rgba(0, 0, 0, .25);
	}
	.arrow {
		position: absolute; left: 18px; top: -7px; width: 14px; height: 14px; transform: rotate(45deg);
		background: var(--text-base);
	}
	b { display: block; font-size: 13px; margin-bottom: 4px; }
	p { margin: 0; opacity: .92; }
	.row { display: flex; justify-content: flex-end; margin-top: 10px; }
	.ok {
		height: 26px; padding: 0 10px; border-radius: var(--radius); border: 1px solid rgba(255, 255, 255, .25);
		background: rgba(255, 255, 255, .12); color: inherit; font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit;
	}
	.ok:hover { background: rgba(255, 255, 255, .22); }
</style>
