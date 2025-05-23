<script lang="ts">
	let {
		name,
		id,
		type = 'number',
		value = $bindable(20),
		placeholder,
		oninput = () => {}
	}: {
		name: string;
		id: string;
		type?: 'number';
		value?: number;
		placeholder?: string;
		oninput?: () => void;
	} = $props();

	function removeValidation() {
		(document.getElementById(id) as HTMLInputElement).setCustomValidity('');
	}
</script>

<input
	onchange={() => {
		removeValidation();
		oninput();
	}}
	{type}
	{name}
	{id}
	bind:value
	{placeholder}
	class="w-full p-2 text-sm border rounded shadow-sm invalid:border-danger bg-background-1 border-border-main/50 text-text-2 focus:text-text-4 placeholder:text-text-1"
/>
