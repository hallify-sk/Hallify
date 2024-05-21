<script lang="ts">
	export let disabled: boolean = false;
	export let name: string;
	export let checked: boolean = false;
	export let onCheck: () => void = () => {};
</script>

<input
	on:change={onCheck}
	bind:checked
	type="checkbox"
	class="hidden peer"
	{name}
	{disabled}
	id={name}
/>
<label
	for={name}
	class="relative w-10 h-5 grid bg-background-200 rounded-full border-2 border-slate-400/60 
    hover:border-slate-400 cursor-pointer duration-100 peer-checked:bg-emerald-500 
    peer-checked:border-emerald-500 group place-items-center peer-disabled:border-slate-300"
>
    <div class="bg-white p-2 rounded-full absolute left-0 peer-checked:right-0"></div>
</label>
