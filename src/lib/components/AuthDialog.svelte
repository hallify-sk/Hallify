<script lang="ts">
	//Icon
	import Icon from '$lib/icons/Icon.svelte';
	import LogIn from '$lib/icons/LogIn.svelte';

	//Svelte
	import { applyAction, enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { fly } from 'svelte/transition';

	//Components
	import Dialog from './Dialog.svelte';
	import TextInput from './inputs/TextInput.svelte';

	let { open = $bindable(false) }: { open: boolean } = $props();

	let loginError: string | unknown = $state('');
	let validate: string[] = $state([]);

	$effect(() => {
		validate.forEach((i) => {
			(document.getElementById(i) as HTMLInputElement).setCustomValidity('Chybné pole');
		});
	});
</script>

<Dialog bind:open>
	{#snippet header()}
		<p>Prihlásiť sa</p>
	{/snippet}
	<form
		class="w-full flex flex-col"
		action="/api/auth"
		method="post"
		use:enhance={() => {
			return async ({ result }) => {
				// `result` is an `ActionResult` object
				if (result.type === 'failure') {
					loginError = result.data?.message;
					if (Array.isArray(result.data?.validate)) validate = result.data.validate;
					console.error(result);
				} else {
					await invalidateAll();
					open = false;
					await applyAction(result);
				}
			};
		}}
	>
		<div class="p-4 flex flex-col">
			<label for="" class="text-sm text-slate-800">E-Mail</label>
			<TextInput name="email" id="email" />
			<label for="" class="text-sm text-slate-800 mt-4">Heslo</label>
			<TextInput type="password" name="password" id="password" />
			{#if loginError}
				<p in:fly={{ x: 10, duration: 600 }} class="text-red-500 mt-4">{loginError}</p>
			{/if}
		</div>
		<div class="bg-slate-200 p-4 w-full border-t border-slate-400/30 flex justify-between">
			<button
				type="button"
				onclick={() => (open = false)}
				class="flex flex-row gap-2 items-center hover:bg-slate-100/50 duration-150 text-slate-500 px-4 py-2 rounded text-sm"
			>
				<p>Zrušiť</p>
			</button>
			<button
				type="submit"
				class="flex flex-row gap-2 items-center bg-blue-500 hover:bg-blue-400 duration-150 text-slate-100 px-4 py-2 rounded border border-blue-600/30 text-sm"
			>
				<Icon scale="small">
					<LogIn />
				</Icon>
				<p>Prihlásiť sa</p>
			</button>
		</div>
	</form>
</Dialog>
