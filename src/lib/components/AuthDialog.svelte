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

	let fieldErrors: Record<string, string> = $state({});

	function clearErrors() {
		fieldErrors = {};
	}

	function handleFormErrors(result: any, isRegister = false) {
		if (result.type === 'failure') {

			// Set field-specific errors
			if (result.data?.errors) {
				fieldErrors = result.data.errors;
			}

			console.log(result.data);

			// Handle legacy validate array format
			if (Array.isArray(result.data?.validate)) {
				const errors: Record<string, string> = {};
				result.data.validate.forEach((field: string) => {
					errors[field] = result.data.message;
				});
				fieldErrors = errors;
			}
		}
	}
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
			clearErrors();
			return async ({ result }) => {
				handleFormErrors(result, false);
				if (result.type === 'success') {
					await invalidateAll();
					openLogin = false;
					await applyAction(result);
				}
			};
		}}
	>
		<div class="flex flex-col gap-2 p-4">
			<div>
				<label for="login-email" class="text-sm text-text-4">E-Mail</label>
				<TextInput
					name="email"
					id="login-email"
					placeholder="meno@email.com"
					error={fieldErrors.email}
				/>
			</div>
			<div>
				<label for="login-password" class="text-sm text-text-4">Heslo</label>
				<TextInput
					type="password"
					name="password"
					id="login-password"
					error={fieldErrors.password}
				/>
			</div>
		</div>
		<div
			class="flex justify-between w-full p-4 border-t rounded-b bg-background-2 border-border-main/30"
		>
			<Button
				color="transparent"
				onclick={() => {
					openLogin = false;
					clearErrors();
				}}
			>
				<p>Zrušiť</p>
			</Button>
			<div class="flex flex-row gap-2">
				<Button
					type="button"
					onclick={() => {
						openLogin = false;
						openRegister = true;
						clearErrors();
					}}
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
			clearErrors();
			return async ({ result }) => {
				handleFormErrors(result, true);
				if (result.type === 'success') {
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
					<label for="register-firstName" class="text-sm text-text-4">Meno</label>
					<TextInput
						name="firstName"
						id="register-firstName"
						placeholder="Janko"
						error={fieldErrors.firstName}
					/>
				</div>
				<div>
					<label for="register-lastName" class="text-sm text-text-4">Priezvisko</label>
					<TextInput
						name="lastName"
						id="register-lastName"
						placeholder="Mrkvička"
						error={fieldErrors.lastName}
					/>
				</div>
			</div>
			<div>
				<label for="register-email" class="text-sm text-text-4">E-Mail</label>
				<TextInput
					name="email"
					id="register-email"
					placeholder="jankomrkva@email.com"
					error={fieldErrors.email}
				/>
			</div>
			<div>
				<label for="register-password" class="text-sm text-text-4">Heslo</label>
				<TextInput
					type="password"
					name="password"
					id="register-password"
					error={fieldErrors.password}
				/>
			</div>
		</div>
		<div
			class="flex justify-between w-full p-4 border-t rounded-b bg-background-2 border-slate-400/30"
		>
			<Button
				onclick={() => {
					openRegister = false;
					clearErrors();
				}}
				color="transparent"
			>
				<p>Zrušiť</p>
			</Button>
			<div class="flex flex-row gap-2">
				<Button
					onclick={() => {
						openLogin = true;
						openRegister = false;
						clearErrors();
					}}
					color="secondary"
				>
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
