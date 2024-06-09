<script>
	import { theme } from "$lib/stores/theme";
	import "../../app.css";

	theme.set("light");
</script>

<div class="bg-background-100 min-h-screen pr-4">
	<slot />
</div>
