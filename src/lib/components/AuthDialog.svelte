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
	import Button from './Button.svelte';

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
		class="flex flex-col w-full"
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
		<div class="flex flex-col gap-2 p-4">
			<div>
				<label for="" class="text-sm text-text-4">E-Mail</label>
				<TextInput name="email" id="email" placeholder="meno@email.com" />
			</div>
			<div>
				<label for="" class="text-sm text-text-4">Heslo</label>
				<TextInput type="password" name="password" id="password" />
			</div>
			{#if loginError}
				<p in:fly={{ x: 10, duration: 600 }} class="text-danger">{loginError}</p>
			{/if}
		</div>
		<div
			class="flex justify-between w-full p-4 border-t rounded-b bg-background-2 border-border-main/30"
		>
			<Button
				color="transparent"
				onclick={() => {
					openLogin = false;
				}}
			>
				<p>Zrušiť</p>
			</Button>
			<div class="flex flex-row gap-2">
				<Button
					type="button"
					onclick={() => ((openLogin = false), (openRegister = true))}
					color="secondary"
				>
					<Icon scale="small">
						<Plus />
					</Icon>
					<p>Registrovať sa</p>
				</Button>
				<Button type="submit" color="primary">
					<Icon scale="small">
						<LogIn />
					</Icon>
					<p>Prihlásiť sa</p>
				</Button>
			</div>
		</div>
	</form>
</Dialog>

<Dialog bind:open={openRegister}>
	{#snippet header()}
		<p>Registrovať sa</p>
	{/snippet}
	<form
		class="flex flex-col w-full"
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
		<div class="flex flex-col gap-2 p-4">
			<div class="grid grid-cols-1 gap-2 md:grid-cols-2">
				<div>
					<label for="" class="text-sm text-text-4">Meno</label>
					<TextInput name="firstName" id="firstName" placeholder="Janko" />
				</div>
				<div>
					<label for="" class="text-sm text-text-4">Priezvisko</label>
					<TextInput name="lastName" id="lastName" placeholder="Mrkvička" />
				</div>
			</div>
			<div>
				<label for="" class="text-sm text-text-4">E-Mail</label>
				<TextInput name="email" id="email" placeholder="jankomrkva@email.com" />
			</div>
			<div>
				<label for="" class="text-sm text-text-4">Heslo</label>
				<TextInput type="password" name="password" id="password" />
			</div>
			{#if registerError}
				<p in:fly={{ x: 10, duration: 600 }} class="mt-4 text-danger">{registerError}</p>
			{/if}
		</div>
		<div
			class="flex justify-between w-full p-4 border-t rounded-b bg-background-2 border-slate-400/30"
		>
			<Button
				onclick={() => {
					openRegister = false;
				}}
				color="transparent"
			>
				<p>Zrušiť</p>
			</Button>
			<div class="flex flex-row gap-2">
				<Button onclick={() => ((openLogin = true), (openRegister = false))} color="secondary">
					<Icon scale="small">
						<LogIn />
					</Icon>
					<p>Prihlásiť sa</p>
				</Button>
				<Button type="submit" color="primary">
					<Icon scale="small">
						<Plus />
					</Icon>
					<p>Registrovať sa</p>
				</Button>
			</div>
		</div>
	</form>
</Dialog>
