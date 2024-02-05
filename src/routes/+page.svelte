<script lang="ts">
	import Navbar from "$lib/Navbar.svelte";
	export let data;
	console.log(data);
</script>

<Navbar />



<!--
{#each data.stages as stage, i}
    <a href="/editor/{stage.id}">Stage #{i+1}</a>
{/each}
-->
