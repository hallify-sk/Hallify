<script lang="ts">
    export let data;
    console.log(data);
</script>

{#each data.stages as stage, i}
    <a href="/editor/{stage.id}">Stage #{i+1}</a>
{/each}