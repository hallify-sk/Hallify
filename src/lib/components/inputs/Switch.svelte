<script lang="ts">
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
	class="w-8 h-4 p-0.5 bg-background-4 rounded-full block relative cursor-pointer peer-checked:bg-blue-500 duration-200"
>
	<div
		class="w-3 h-3 bg-white block rounded-full absolute {checked
			? 'left-[18px]'
			: 'left-0.5'} duration-200"
	></div>
</label>
