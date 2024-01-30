<script lang="ts">
	import { onMount } from 'svelte';
	import { brush } from './stores/stage';

	function setBrush(brushStr: string) {
		brush.set({ type: brushStr, snapCoefficient: $brush.snapCoefficient });
	}
	onMount(() => {
		window.addEventListener('keydown', (e) => {
			switch (e.key) {
				case 'g':
					setBrush('grab');
					break;
				case 'z':
					setBrush('zone');
					break;
				case 'w':
					setBrush('wall');
					break;
				case 't':
				setBrush('placeTables');
				break;
			}
		});
	});
</script>

<div
	class="fixed top-0 left-0 w-12 bg-background-100 h-screen p-1 flex flex-col gap-1 border-r border-background-200 group overflow-x-hidden hover:w-40 duration-200"
>
	<button
		on:click={() => {
			setBrush('grab');
		}}
		class="w-full overflow-hidden h-12 rounded-md hover:bg-background-200 flex items-center relative justify-around gap-6 {$brush.type ==
		'grab'
			? 'text-primary-600 bg-background-200'
			: 'text-primary-400'}"
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			fill="none"
			viewBox="0 0 24 24"
			stroke-width="1.5"
			stroke="currentColor"
			class="w-6 h-6 absolute left-2"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				d="M10.05 4.575a1.575 1.575 0 1 0-3.15 0v3m3.15-3v-1.5a1.575 1.575 0 0 1 3.15 0v1.5m-3.15 0 .075 5.925m3.075.75V4.575m0 0a1.575 1.575 0 0 1 3.15 0V15M6.9 7.575a1.575 1.575 0 1 0-3.15 0v8.175a6.75 6.75 0 0 0 6.75 6.75h2.018a5.25 5.25 0 0 0 3.712-1.538l1.732-1.732a5.25 5.25 0 0 0 1.538-3.712l.003-2.024a.668.668 0 0 1 .198-.471 1.575 1.575 0 1 0-2.228-2.228 3.818 3.818 0 0 0-1.12 2.687M6.9 7.575V12m6.27 4.318A4.49 4.49 0 0 1 16.35 15m.002 0h-.002"
			/>
		</svg>
		<p class="absolute left-12">Grab</p>
	</button>
	<button
		on:click={() => {
			setBrush('zone');
		}}
		class="w-full overflow-hidden h-12 rounded-md hover:bg-background-200 flex items-center relative justify-around gap-6 {$brush.type ==
		'zone'
			? 'text-primary-600 bg-background-200'
			: 'text-primary-400'}"
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			fill="none"
			viewBox="0 0 24 24"
			stroke-width="1.5"
			stroke="currentColor"
			class="w-6 h-6 absolute left-2"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				d="m21 7.5-2.25-1.313M21 7.5v2.25m0-2.25-2.25 1.313M3 7.5l2.25-1.313M3 7.5l2.25 1.313M3 7.5v2.25m9 3 2.25-1.313M12 12.75l-2.25-1.313M12 12.75V15m0 6.75 2.25-1.313M12 21.75V19.5m0 2.25-2.25-1.313m0-16.875L12 2.25l2.25 1.313M21 14.25v2.25l-2.25 1.313m-13.5 0L3 16.5v-2.25"
			/>
		</svg>
		<p class="absolute left-12 w-28 overflow-hidden text-left">Zone painter</p>
	</button>
	<button
		on:click={() => {
			setBrush('wall');
		}}
		class="w-full overflow-hidden h-12 rounded-md hover:bg-background-200 flex items-center relative justify-around gap-6 {$brush.type ==
		'wall'
			? 'text-primary-600 bg-background-200'
			: 'text-primary-400'}"
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="currentColor"
			class="w-6 h-6 absolute left-2"
		>
			<path
				d="M12.378 1.602a.75.75 0 0 0-.756 0L3 6.632l9 5.25 9-5.25-8.622-5.03ZM21.75 7.93l-9 5.25v9l8.628-5.032a.75.75 0 0 0 .372-.648V7.93ZM11.25 22.18v-9l-9-5.25v8.57a.75.75 0 0 0 .372.648l8.628 5.033Z"
			/>
		</svg>
		<p class="absolute left-12 w-28 overflow-hidden text-left">Wall painter</p>
	</button>
	<button
		on:click={() => {
			setBrush('placeTables');
		}}
		class="w-full overflow-hidden h-12 rounded-md hover:bg-background-200 flex items-center relative justify-around gap-6 {$brush.type ==
		'placeTables'
			? 'text-primary-600 bg-background-200'
			: 'text-primary-400'}"
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			class="w-6 h-6 absolute left-2"
			width="24"
			height="24"
			viewBox="0 0 24 24"
			stroke-width="2"
			stroke="currentColor"
			fill="none"
			stroke-linecap="round"
			stroke-linejoin="round"
			><path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M3 6h18" /><path
				d="M4 6v13"
			/><path d="M20 19v-13" /><path d="M4 10h16" /><path d="M15 6v8a2 2 0 0 0 2 2h3" /></svg
		>
		<p class="absolute left-12 w-28 overflow-hidden text-left">Place Tables</p>
	</button>
</div>
