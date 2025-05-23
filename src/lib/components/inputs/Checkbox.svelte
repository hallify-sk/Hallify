<script lang="ts">
	import Check from '$lib/icons/Check.svelte';
	import Icon from '$lib/icons/Icon.svelte';

	interface Props {
		name: string;
		id: string;
		checked?: boolean;
	}

	let { name, id, checked = $bindable(false) }: Props = $props();
</script>

<input bind:checked type="checkbox" {name} {id} class="hidden peer" />
<label
	for={name}
	class="w-6 h-6 p-0.5 bg-background-5 text-background-main border-2 border-solid border-background-4 rounded grid place-items-center relative cursor-pointer peer-checked:bg-blue-500 duration-200"
>
	{#if checked}
		<Icon scale="tiny" stroke={4}>
			<Check />
		</Icon>
	{/if}
</label>
