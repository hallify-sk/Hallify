<script>
	import NavbarAdmin from '$lib/components/NavbarAdmin.svelte';
	let { data, children } = $props();
</script>

<NavbarAdmin permission={data.permission} user={data.user} />

{@render children?.()}
