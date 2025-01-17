<script lang="ts">
	let {
		name,
		id,
		type = 'text',
		value
	}: { name: string; id: string; type?: 'text' | 'password' | 'email'; value?: string } = $props();

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
	class="w-full invalid:border-red-400 bg-slate-100 border border-slate-400/30 rounded mt-2 text-sm p-2 text-slate-500 focus:text-slate-700 shadow-sm"
/>
