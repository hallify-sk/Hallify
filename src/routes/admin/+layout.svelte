<script>
	import NavbarAdmin from "$lib/components/NavbarAdmin.svelte";
	export let data;
</script>

<NavbarAdmin permission={data.permission} user={data.user}/>

<slot/>