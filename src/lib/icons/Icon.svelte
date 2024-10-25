<script lang="ts">
	export let scale: 'big' | 'medium' | 'small' | 'tiny';
	export let isPeer: boolean = false;
</script>

<svg
	data-slot="icon"
	aria-hidden="true"
	fill="none"
	stroke-width="1.5"
	stroke="currentColor"
	viewBox="0 0 24 24"
	xmlns="http://www.w3.org/2000/svg"
	class:peer={isPeer}
	class="{scale === 'big'
		? 'w-12 h-12'
		: scale === 'medium'
			? 'w-6 h-6'
			: scale === 'small'
				? 'w-5 h-5'
				: 'w-3 h-3'}"
>
	<slot />
</svg>
