<script lang="ts">
	let {
		name,
		id,
		type = 'text',
		value,
		placeholder
	}: { name: string; id: string; type?: 'text' | 'password' | 'email'; value?: string, placeholder?: string } = $props();

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
	class="w-full invalid:border-red-400 bg-slate-100 border border-slate-400/30 rounded text-sm p-2 text-slate-600 focus:text-slate-800 placeholder:text-slate-400 shadow-sm"
/>
