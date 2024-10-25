<script lang="ts">
	import { collapsibleOpen } from "$lib/util";

	export let id: string;

	export function toggleCollapsible(){
		if($collapsibleOpen == id) {
			collapsibleOpen.set("");
			return;
		}
		collapsibleOpen.set(id);
	}
</script>

<div class="relative dropdown">
	<slot />
</div>
