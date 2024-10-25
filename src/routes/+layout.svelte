<script>
	import { invalidate, onNavigate } from '$app/navigation';

	onNavigate(() => {
		invalidate('/');
	});

	export let data;

	import { userStore, permissionStore } from '$lib/components/authStore';

  $: user = data.user;

  console.log(user);

	userStore.set(data.user);
	permissionStore.set(data.permission);

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
