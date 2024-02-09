<script lang="ts">
	import Calendar from '$lib/Calendar.svelte';
	import Navbar from '$lib/Navbar.svelte';
	export let data;
	console.log(data);
</script>

<Navbar user={data.user} />

<Calendar />

<!--
{#each data.stages as stage, i}
    <a href="/editor/{stage.id}">Stage #{i+1}</a>
{/each}
-->
