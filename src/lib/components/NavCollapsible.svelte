<script lang="ts">
	import { collapsibleOpen } from "$lib/util";

	export let id: string;
</script>

<div class="relative dropdown">
	<button
		on:click={() => {
			if($collapsibleOpen == id) {
				collapsibleOpen.set("");
				return;
			}
			collapsibleOpen.set(id);
		}}
		class="py-3 px-3 text-sm border-b-2 border-b-transparent hover:border-b-blue-500 flex items-center gap-2"
	>
		<slot />
	</button>
</div>
