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
				case 'e':
					setBrush('wallGrab');
					break;
				case 'l':
					setBrush('zoneGrab');
					break;
				case 'r':
					setBrush('ruler');
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
			setBrush('zoneGrab');
		}}
		class="w-full overflow-hidden h-12 rounded-md hover:bg-background-200 flex items-center relative justify-around gap-6 {$brush.type ==
		'zoneGrab'
			? 'text-primary-600 bg-background-200'
			: 'text-primary-400'}"
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			fill="none"
			viewBox="0 0 24 24"
			stroke-width="1.5"
			stroke="currentColor"
			class="w-5 h-5 absolute left-1.5"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				d="m21 7.5-2.25-1.313M21 7.5v2.25m0-2.25-2.25 1.313M3 7.5l2.25-1.313M3 7.5l2.25 1.313M3 7.5v2.25m9 3 2.25-1.313M12 12.75l-2.25-1.313M12 12.75V15m0 6.75 2.25-1.313M12 21.75V19.5m0 2.25-2.25-1.313m0-16.875L12 2.25l2.25 1.313M21 14.25v2.25l-2.25 1.313m-13.5 0L3 16.5v-2.25"
			/>
		</svg>
		<svg
			data-slot="icon"
			aria-hidden="true"
			fill="currentColor"
			viewBox="0 0 20 20"
			xmlns="http://www.w3.org/2000/svg"
			class="w-5 h-5 absolute left-4 top-5"
		>
			<path
				clip-rule="evenodd"
				d="M11 2a1 1 0 1 0-2 0v6.5a.5.5 0 0 1-1 0V3a1 1 0 1 0-2 0v5.5a.5.5 0 0 1-1 0V5a1 1 0 1 0-2 0v7a7 7 0 1 0 14 0V8a1 1 0 1 0-2 0v3.5a.5.5 0 0 1-1 0V3a1 1 0 1 0-2 0v5.5a.5.5 0 0 1-1 0V2Z"
				fill-rule="evenodd"
			></path>
		</svg>
		<p class="absolute left-12 w-28 overflow-hidden text-left">Zone grab</p>
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
			setBrush('wallGrab');
		}}
		class="w-full overflow-hidden h-12 rounded-md hover:bg-background-200 flex items-center relative justify-around gap-6 {$brush.type ==
		'wallGrab'
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
		<svg
			data-slot="icon"
			aria-hidden="true"
			fill="currentColor"
			viewBox="0 0 20 20"
			xmlns="http://www.w3.org/2000/svg"
			class="w-5 h-5 absolute left-4 top-5 stroke-text-50"
		>
			<path
				clip-rule="evenodd"
				d="M11 2a1 1 0 1 0-2 0v6.5a.5.5 0 0 1-1 0V3a1 1 0 1 0-2 0v5.5a.5.5 0 0 1-1 0V5a1 1 0 1 0-2 0v7a7 7 0 1 0 14 0V8a1 1 0 1 0-2 0v3.5a.5.5 0 0 1-1 0V3a1 1 0 1 0-2 0v5.5a.5.5 0 0 1-1 0V2Z"
				fill-rule="evenodd"
			></path>
		</svg>
		<p class="absolute left-12 w-28 overflow-hidden text-left">Wall grab</p>
	</button>
	<button
		on:click={() => {
			setBrush('ruler');
		}}
		class="w-full overflow-hidden h-12 rounded-md hover:bg-background-200 flex items-center relative justify-around gap-6 {$brush.type ==
		'ruler'
			? 'text-primary-600 bg-background-200'
			: 'text-primary-400'}"
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="24"
			height="24"
			viewBox="0 0 24 24"
			class="w-6 h-6 absolute left-2 "
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			><path stroke="none" d="M0 0h24v24H0z" fill="none" /><path
				d="M5 4h14a1 1 0 0 1 1 1v5a1 1 0 0 1 -1 1h-7a1 1 0 0 0 -1 1v7a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-14a1 1 0 0 1 1 -1"
			/><path d="M4 8l2 0" /><path d="M4 12l3 0" /><path d="M4 16l2 0" /><path d="M8 4l0 2" /><path
				d="M12 4l0 3"
			/><path d="M16 4l0 2" /></svg
		>
		<p class="absolute left-12 w-28 overflow-hidden text-left">Ruler</p>
	</button>
</div>
