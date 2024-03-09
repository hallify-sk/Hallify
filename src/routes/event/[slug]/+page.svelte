<script lang="ts">
	import Navbar from '$lib/Navbar.svelte';

    export let data;
    console.log(data);
</script>

<Navbar
	user={data.user}
/>

<h1 class="mt-12">Hello</h1>