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
	import Plus from '$lib/icons/Plus.svelte';

	let {
		openLogin = $bindable(false),
		openRegister = $bindable(false)
	}: { openLogin: boolean; openRegister: boolean } = $props();

	let loginError: string | unknown = $state('');
	let registerError: string | unknown = $state('');
	let validate: string[] = $state([]);

	$effect(() => {
		validate.forEach((i) => {
			(document.getElementById(i) as HTMLInputElement).setCustomValidity('Chybné pole');
		});
	});
</script>

<Dialog bind:open={openLogin}>
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
					openLogin = false;
					await applyAction(result);
				}
			};
		}}
	>
		<div class="p-4 gap-2 flex flex-col">
			<div>
				<label for="" class="text-sm text-slate-800">E-Mail</label>
				<TextInput name="email" id="email" placeholder="meno@email.com" />
			</div>
			<div>
				<label for="" class="text-sm text-slate-800">Heslo</label>
				<TextInput type="password" name="password" id="password" />
			</div>
			{#if loginError}
				<p in:fly={{ x: 10, duration: 600 }} class="text-red-500">{loginError}</p>
			{/if}
			<p class="text-slate-700">Nemáte účet?</p>
		</div>
		<div class="bg-slate-200 p-4 w-full border-t border-slate-400/30 flex justify-between">
			<button
				type="button"
				onclick={() => (openLogin = false)}
				class="flex flex-row gap-2 items-center hover:bg-slate-100/50 duration-150 text-slate-500 px-4 py-2 rounded text-sm"
			>
				<p>Zrušiť</p>
			</button>
			<div class="flex flex-row gap-2">
				<button
					type="button"
					onclick={() => (openLogin = false, openRegister = true)}
					class="flex flex-row items-center bg-slate-100 justify-center gap-2 px-4 py-2 text-sm duration-150 border rounded hover:bg-slate-200/50 text-slate-500 border-slate-400/30"
				>
					<Icon scale="small">
						<Plus />
					</Icon>
					<p>Registrovať sa</p>
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
		</div>
	</form>
</Dialog>

<Dialog bind:open={openRegister}>
	{#snippet header()}
		<p>Registrovať sa</p>
	{/snippet}
	<form
		class="w-full flex flex-col"
		action="/api/user"
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
					openRegister = false;
					await applyAction(result);
				}
			};
		}}
	>
		<div class="p-4 flex flex-col gap-2">
			<div class="grid grid-cols-1 md:grid-cols-2 gap-2">
				<div>
					<label for="" class="text-sm text-slate-800">Meno</label>
					<TextInput name="firstName" id="firstName" placeholder="Janko" />
				</div>
				<div>
					<label for="" class="text-sm text-slate-800">Priezvisko</label>
					<TextInput name="lastName" id="lastName" placeholder="Mrkvička" />
				</div>
			</div>
			<div>
				<label for="" class="text-sm text-slate-800">E-Mail</label>
				<TextInput name="email" id="email" placeholder="jankomrkva@email.com" />
			</div>
			<div>
				<label for="" class="text-sm text-slate-800">Heslo</label>
				<TextInput type="password" name="password" id="password" />
			</div>
			{#if registerError}
				<p in:fly={{ x: 10, duration: 600 }} class="text-red-500 mt-4">{registerError}</p>
			{/if}
		</div>
		<div class="bg-slate-200 p-4 w-full border-t border-slate-400/30 flex justify-between">
			<button
				type="button"
				onclick={() => (openRegister = false)}
				class="flex flex-row gap-2 items-center hover:bg-slate-100/50 duration-150 text-slate-500 px-4 py-2 rounded text-sm"
			>
				<p>Zrušiť</p>
			</button>
			<div class="flex flex-row gap-2">
				<button
					type="button"
					onclick={() => (openLogin = true, openRegister = false)}
					class="flex flex-row items-center bg-slate-100 justify-center gap-2 px-4 py-2 text-sm duration-150 border rounded hover:bg-slate-200/50 text-slate-500 border-slate-400/30"
				>
					<Icon scale="small">
						<Plus />
					</Icon>
					<p>Prihlasiť sa</p>
				</button>
				<button
					type="submit"
					class="flex flex-row gap-2 items-center bg-blue-500 hover:bg-blue-400 duration-150 text-slate-100 px-4 py-2 rounded border border-blue-600/30 text-sm"
				>
					<Icon scale="small">
						<LogIn />
					</Icon>
					<p>Registrovať sa</p>
				</button>
			</div>
		</div>
	</form>
</Dialog>
