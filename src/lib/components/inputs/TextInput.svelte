<script lang="ts">
	let {
		name,
		id,
		type = 'text',
		value = $bindable(''),
		placeholder
	}: {
		name: string;
		id: string;
		type?: 'text' | 'password' | 'email';
		value?: string;
		placeholder?: string;
	} = $props();

	function removeValidation() {
		(document.getElementById(id) as HTMLInputElement).setCustomValidity('');
	}
</script>

<input
	onchange={removeValidation}
	{type}
	{name}
	{id}
	{value}
	{placeholder}
	class="w-full p-2 text-sm border rounded shadow-sm invalid:border-danger bg-background-1 border-border-main/50 text-text-2 focus:text-text-4 placeholder:text-text-1"
/>
