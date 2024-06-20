
{#await import('$lib/Editor.svelte') then app}
  <svelte:component this={app.default} />
{/await}