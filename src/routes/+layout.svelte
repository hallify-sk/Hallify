<script>
	import { invalidate, onNavigate } from '$app/navigation';

	onNavigate(() => {
		invalidate('/');
	});

	import '../app.postcss';

	import { Toaster } from 'svelte-french-toast';
</script>

<Toaster toastOptions={{ className: 'toast', position: 'bottom-right' }} />

<slot />

<style lang="postcss">
	:global(.toast) {
		@apply !border-slate-400/30 !border !bg-slate-100 !shadow-none hover:!bg-slate-50;
	}
</style>
