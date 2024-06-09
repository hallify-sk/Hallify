<script lang="ts">
	export let disabled: boolean = false;
	export let name: string;
	export let checked: boolean = false;
	export let onCheck: () => void = () => {};
</script>

<label
	for={name}
	class="relative w-10 h-5 grid bg-background-200 rounded-full border-2 border-slate-400/60
    hover:border-slate-400 cursor-pointer duration-100 has-[:checked]:bg-emerald-500
    has-[:checked]:border-emerald-500 group place-items-center has-[:disabled]:border-slate-300 has-[:disabled]:cursor-default"
>
	<input on:change={onCheck} bind:checked type="checkbox" class="hidden peer" {name} {disabled} id={name} />
	<div class="bg-white p-2 rounded-full absolute left-0 peer-checked:left-5 duration-150"></div>
</label>

<style lang="postcss">
</style>
