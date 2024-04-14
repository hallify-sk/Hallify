<script>
	import { theme } from '$lib/stores/theme';
	import '../../app.css';

	theme.set('light');

</script>

<div class="bg-background-50">
	<slot />
</div>