<script lang="ts">
	import { applyAction, enhance } from "$app/forms";
	import { PUBLIC_TURNSTILE_TOKEN } from "$env/static/public";
	import type { AuthModel } from "pocketbase";
	import Popup from "./Popup.svelte";
	import { createAvatar } from "@dicebear/core";
	import { initials } from "@dicebear/collection";
	import { Turnstile } from "svelte-turnstile";
	import { invalidateAll } from "$app/navigation";
	export let openLoginPopup: () => void = () => {};
	let loadingLogin: boolean = false;
	export let closeLoginPopup: () => void = () => {};

	export let openRegisterPopup: () => void = () => {};
	let loadingRegister: boolean = false;
	export let closeRegisterPopup: () => void = () => {};

	//Validation variables
	let emailLoginError: boolean = false;
	let passwordLoginError: boolean = false;
	let errorLoginMessage: string = "";

	let emailRegisterError: boolean = false;
	let passwordRegisterError: boolean = false;
	let nameRegisterError: boolean = false;
	let errorRegisterMessage: string = "";

	function turnstileLoginError(e: CustomEvent) {
		errorLoginMessage = "Skúste obnoviť stránku (zlyhala CAPTCHA)";
		console.log(e);
	}

	export let user: AuthModel;

	let profilePic: string;

	$: profilePic = createAvatar(initials, {
		seed: user?.name
	}).toDataUri();

	export let onAuth: () => void = () => {};
</script>

<header class="fixed top-0 left-0 z-50 h-screen border-r w-60 md:w-80 bg-background-100 border-background-200">
	<div class="flex flex-col justify-between h-full gap-1 px-4">
		<div class="flex flex-col h-full gap-2 pb-2 border-b border-b-background-200">
			<a href="/" class="flex items-center gap-4 py-2 mb-10">
				<img src="https://via.placeholder.com/150" alt="logo" class="w-10 h-10" />
				<p class="text-lg font-semibold text-text-600">Reduta</p>
			</a>
			<a class="flex gap-4 px-2 py-3 rounded-md text-text-500 hover:text-text-700 hover:bg-background-200" href="/">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="24"
					height="24"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="icon icon-tabler icons-tabler-outline icon-tabler-calendar-time"
					><path stroke="none" d="M0 0h24v24H0z" fill="none" /><path
						d="M11.795 21h-6.795a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v4"
					/><path d="M18 18m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0" /><path d="M15 3v4" /><path d="M7 3v4" /><path d="M3 11h16" /><path
						d="M18 16.496v1.504l1 1"
					/></svg
				>
				Moje podujatia
			</a>
			<a class="flex gap-4 px-2 py-3 rounded-md text-text-500 hover:text-text-700 hover:bg-background-200" href="/">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="24"
					height="24"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="icon icon-tabler icons-tabler-outline icon-tabler-info-circle"
					><path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" /><path d="M12 9h.01" /><path
						d="M11 12h1v4h1"
					/></svg
				>
				Služby
			</a>
			<a class="flex gap-4 px-2 py-3 rounded-md text-text-500 hover:text-text-700 hover:bg-background-200" href="/">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="24"
					height="24"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="icon icon-tabler icons-tabler-outline icon-tabler-message"
					><path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M8 9h8" /><path d="M8 13h6" /><path
						d="M18 4a3 3 0 0 1 3 3v8a3 3 0 0 1 -3 3h-5l-5 3v-3h-2a3 3 0 0 1 -3 -3v-8a3 3 0 0 1 3 -3h12z"
					/></svg
				>
				Kontakt
			</a>
		</div>
		<div class="flex flex-col gap-2 py-2">
			{#if user}
				<div class="flex flex-row items-center gap-3 py-1 pl-1 pr-4 rounded-md text-text-700">
					{#if profilePic}
						<img class="w-8 overflow-hidden rounded-full" src={profilePic} alt="Profilový obrázok" />
					{/if}
					<p>{user?.name}</p>
				</div>
				<a class="flex gap-4 px-2 py-3 rounded-md text-text-500 hover:text-text-700 hover:bg-background-200" href="/">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="24"
						height="24"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						class="icon icon-tabler icons-tabler-outline icon-tabler-settings"
						><path stroke="none" d="M0 0h24v24H0z" fill="none" /><path
							d="M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065z"
						/><path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" /></svg
					>
					Nastavenia
				</a>
				<form
					method="POST"
					action="/?/logout"
					class="flex w-full"
					use:enhance={async () => {
						return async ({ result }) => {
							if (result.type == "success") {
								invalidateAll();
							}
							applyAction(result);
						};
					}}
				>
					<button type="submit" class="flex w-full gap-4 px-2 py-3 rounded-md text-text-100 bg-primary-700 hover:bg-primary-600">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="24"
							height="24"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							class="icon icon-tabler icons-tabler-outline icon-tabler-logout"
							><path stroke="none" d="M0 0h24v24H0z" fill="none" /><path
								d="M14 8v-2a2 2 0 0 0 -2 -2h-7a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2 -2v-2"
							/><path d="M9 12h12l-3 -3" /><path d="M18 15l3 -3" /></svg
						>
						Odhlásiť sa
					</button>
				</form>
			{:else}
				<button
					type="button"
					on:click={openLoginPopup}
					class="flex w-full gap-4 px-2 py-3 rounded-md text-text-100 bg-primary-700 hover:bg-primary-600"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="24"
						height="24"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						class="icon icon-tabler icons-tabler-outline icon-tabler-login"
						><path stroke="none" d="M0 0h24v24H0z" fill="none" /><path
							d="M15 8v-2a2 2 0 0 0 -2 -2h-7a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2 -2v-2"
						/><path d="M21 12h-13l3 -3" /><path d="M11 15l-3 -3" /></svg
					>
					Prihlásiť sa
				</button>
			{/if}
		</div>
	</div>
</header>
<!-- HORIZONTAL NAVBAR
<header
	class="fixed top-0 left-0 z-30 w-screen px-2 py-1 border-b bg-background-100 border-background-200"
>
	<div class="mx-auto max-w-7xl">
		<div class="flex flex-row items-center justify-between">
			<div class="flex flex-row gap-2 flex-nowrap">
				<a class="flex items-center gap-2 pr-4 border-r border-background-100" href="/">
					<img src="https://via.placeholder.com/150" alt="logo" class="w-10 h-10" />
					<p class="text-lg font-semibold text-text-600">Reduta</p>
				</a>
				<nav class="flex flex-row items-center gap-8 mx-4 flex-nowrap text-text-600">
					<a href="/#about" class="hover:text-text-400">Moje podujatia</a>
					<a href="/#services" class="hover:text-text-400">Služby</a>
					<a href="/#contact" class="hover:text-text-400">Kontakt</a>
				</nav>
			</div>
			<div class="flex flex-row items-center gap-2 flex-nowrap">
				{#if !user}
					<button
						type="button"
						on:click={openLoginPopup}
						class="px-4 py-2 rounded-md bg-background-700 hover:bg-primary-600 text-text-50"
						>Prihlásenie</button
					>
				{:else}
					<div class="relative group">
						<button
							type="button"
							class="flex flex-row items-center gap-2 py-1 pl-1 pr-4 rounded-md hover:bg-background-50 text-text-600"
						>
							{#if profilePic}
								<img
									class="w-8 overflow-hidden rounded-full"
									src={profilePic}
									alt="Profilový obrázok"
								/>
							{/if}
							<p>{user.name}</p>
						</button>
						<div
							class="absolute flex-col hidden gap-1 px-2 py-2 border group-focus-within:flex focus-within:flex focus:flex top-11 rounded-b-md bg-background-100 w-52 border-background-200"
						>
							<a
								href="/"
								class="w-full px-4 py-2 text-center rounded-md hover:bg-background-50 text-text-600"
							>
								Nastavenia
							</a>
							<form
								method="POST"
								action="/?/logout"
								class="flex w-full"
								use:enhance={async () => {
									return async ({ result }) => {
										if (result.type == 'success') {
											invalidateAll();
										}
										applyAction(result);
									};
								}}
							>
								<button
									type="submit"
									class="w-full px-4 py-2 rounded-md bg-background-700 hover:bg-primary-600 text-text-50"
								>
									Odhlásiť sa
								</button>
							</form>
						</div>
					</div>
				{/if}
			</div>
		</div>
	</div>
</header> -->

{#if !user}
	<Popup bind:openPopup={openLoginPopup} bind:closePopup={closeLoginPopup}>
		<h2 class="mb-4 text-xl text-text-700">Prihlásenie</h2>
		<form
			action="/?/login"
			method="POST"
			class="flex flex-col"
			use:enhance={async () => {
				loadingLogin = true;
				return async ({ result }) => {
					loadingLogin = false;
					emailLoginError = false;
					passwordLoginError = false;
					if (result.type == "failure") {
						switch (result.data?.type) {
							case "email":
								emailLoginError = true;
								break;
							case "password":
								passwordLoginError = true;
								break;
							case "auth":
								{
									emailLoginError = true;
									passwordLoginError = true;
								}
								break;
						}
						errorLoginMessage = typeof result.data?.message == "string" ? result.data.message : "";
					}
					if (result.type == "success") {
						closeLoginPopup();
						onAuth?.();
						await invalidateAll();
					}
					await applyAction(result);
				};
			}}
		>
			<p class="max-w-xs mb-2 text-red-500">{errorLoginMessage}</p>
			<Turnstile on:turnstile-error={turnstileLoginError} siteKey={PUBLIC_TURNSTILE_TOKEN} appearance="execute" />
			<fieldset class="relative text-input">
				<input
					on:change={() => (emailLoginError = false)}
					placeholder=""
					type="text"
					required={true}
					id="email"
					name="email"
					class="w-80 appearance-none bg-background-100 text-text-600 text-left rounded-md pb-0.5 pt-5 px-2 peer border {emailLoginError
						? 'border-red-500'
						: ''}"
				/>
				<label
					for="email"
					class="absolute top-0.5 left-1 {emailLoginError
						? 'text-red-500'
						: 'text-text-400'} text-sm peer-focus:top-0.5 peer-focus:left-1 peer-focus:text-text-400 peer-focus:text-sm peer-placeholder-shown:top-3 peer-placeholder-shown:left-1 peer-placeholder-shown:text-text-500 peer-placeholder-shown:text-base pointer-events-none ml-1 duration-75"
					>Prihlasovací e-mail</label
				>
			</fieldset>
			<fieldset class="relative mt-2 text-input">
				<input
					on:change={() => (passwordLoginError = false)}
					placeholder=""
					type="password"
					required={true}
					id="password"
					name="password"
					class="w-80 appearance-none bg-background-100 text-text-600 text-left rounded-md pb-0.5 pt-5 px-2 peer border {passwordLoginError
						? 'border-red-500'
						: ''}"
				/>
				<label
					for="password"
					class="absolute top-0.5 left-1 {passwordLoginError
						? 'text-red-500'
						: 'text-text-400'} text-sm peer-focus:top-0.5 peer-focus:left-1 peer-focus:text-text-400 peer-focus:text-sm peer-placeholder-shown:top-3 peer-placeholder-shown:left-1 peer-placeholder-shown:text-text-500 peer-placeholder-shown:text-base pointer-events-none ml-1 duration-75"
					>Heslo</label
				>
			</fieldset>
			<p class="my-2 text-text-700">
				Nemáte účet? <button
					type="button"
					class="text-text-600 hover:text-text-400"
					on:click={() => {
						closeLoginPopup();
						openRegisterPopup();
					}}>Vytvorte si nový účet.</button
				>
			</p>
			<div class="flex flex-row items-center gap-2 mt-3 ml-auto flex-nowrap">
				<button type="reset" on:click={closeLoginPopup} class="px-4 py-2 rounded-md bg-background-100 hover:bg-background-200 text-text-900"
					>Zrušiť</button
				>
				<button type="submit" class="px-4 py-2 bg-background-700 hover:bg-primary-600 rounded-md text-text-50 w-[120px]">
					{#if loadingLogin}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="w-6 h-6 mx-auto stroke-2 icon animate-spin icon-tabler icon-tabler-loader-2 stroke-text-50"
							stroke="currentColor"
							fill="none"
							stroke-linecap="round"
							stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M12 3a9 9 0 1 0 9 9" /></svg
						>
					{:else}
						Prihlásiť sa
					{/if}
				</button>
			</div>
		</form>
	</Popup>

	<Popup bind:openPopup={openRegisterPopup} bind:closePopup={closeRegisterPopup}>
		<h2 class="mb-4 text-xl text-text-700">Registrácia</h2>
		<form
			action="/?/register"
			method="POST"
			class="flex flex-col"
			use:enhance={async () => {
				loadingRegister = true;
				return async ({ result }) => {
					loadingRegister = false;
					console.log(result);
					emailRegisterError = false;
					passwordRegisterError = false;
					nameRegisterError = false;
					if (result.type == "failure") {
						switch (result.data?.type) {
							case "name":
								nameRegisterError = true;
								break;
							case "email":
								emailRegisterError = true;
								break;
							case "password":
								passwordRegisterError = true;
								break;
						}
						errorRegisterMessage = typeof result.data?.message == "string" ? result.data.message : "";
					}
					if (result.type == "success") {
						closeRegisterPopup();
						onAuth?.();
						await invalidateAll();
					}
					await applyAction(result);
				};
			}}
		>
			<p class="max-w-xs mb-2 text-red-500">{errorRegisterMessage}</p>
			<Turnstile siteKey={PUBLIC_TURNSTILE_TOKEN} appearance="execute" />
			<fieldset class="relative text-input">
				<input
					on:change={() => (nameRegisterError = false)}
					placeholder=""
					type="text"
					required={true}
					id="name"
					name="name"
					class="w-80 appearance-none bg-background-100 text-text-600 text-left rounded-md pb-0.5 pt-5 px-2 peer border {nameRegisterError
						? 'border-red-500'
						: ''}"
				/>
				<label
					for="name"
					class="absolute top-0.5 left-1 {nameRegisterError
						? 'text-red-500'
						: 'text-text-400'} text-sm peer-focus:top-0.5 peer-focus:left-1 peer-focus:text-text-400 peer-focus:text-sm peer-placeholder-shown:top-3 peer-placeholder-shown:left-1 peer-placeholder-shown:text-text-500 peer-placeholder-shown:text-base pointer-events-none ml-1 duration-75"
					>Celé meno</label
				>
			</fieldset>
			<fieldset class="relative mt-2 text-input">
				<input
					on:change={() => (emailRegisterError = false)}
					placeholder=""
					type="text"
					required={true}
					id="email"
					name="email"
					class="w-80 appearance-none bg-background-100 text-text-600 text-left rounded-md pb-0.5 pt-5 px-2 peer border {emailRegisterError
						? 'border-red-500'
						: ''}"
				/>
				<label
					for="email"
					class="absolute top-0.5 left-1 {emailRegisterError
						? 'text-red-500'
						: 'text-text-400'} text-sm peer-focus:top-0.5 peer-focus:left-1 peer-focus:text-text-400 peer-focus:text-sm peer-placeholder-shown:top-3 peer-placeholder-shown:left-1 peer-placeholder-shown:text-text-500 peer-placeholder-shown:text-base pointer-events-none ml-1 duration-75"
					>Prihlasovací e-mail</label
				>
			</fieldset>
			<fieldset class="relative mt-2 text-input">
				<input
					on:change={() => (passwordRegisterError = false)}
					placeholder=""
					type="password"
					required={true}
					id="password"
					name="password"
					class="w-80 appearance-none bg-background-100 text-text-600 text-left rounded-md pb-0.5 pt-5 px-2 peer border {passwordRegisterError
						? 'border-red-500'
						: ''}"
				/>
				<label
					for="password"
					class="absolute top-0.5 left-1 {passwordRegisterError
						? 'text-red-500'
						: 'text-text-400'} text-sm peer-focus:top-0.5 peer-focus:left-1 peer-focus:text-text-400 peer-focus:text-sm peer-placeholder-shown:top-3 peer-placeholder-shown:left-1 peer-placeholder-shown:text-text-500 peer-placeholder-shown:text-base pointer-events-none ml-1 duration-75"
					>Heslo</label
				>
			</fieldset>
			<p class="my-2 text-text-700">
				Nemáte účet? <button
					type="button"
					class="text-text-600 hover:text-text-400"
					on:click={() => {
						closeRegisterPopup();
						openLoginPopup();
					}}>Vytvorte si nový účet.</button
				>
			</p>
			<div class="flex flex-row items-center gap-2 mt-3 ml-auto flex-nowrap">
				<button
					type="reset"
					on:click={() => {
						closeRegisterPopup();
					}}
					class="px-4 py-2 rounded-md bg-background-100 hover:bg-background-200 text-text-900">Zrušiť</button
				>
				<button type="submit" class="px-4 py-2 bg-background-700 hover:bg-primary-600 rounded-md text-text-50 w-[120px]">
					{#if loadingRegister}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="w-6 h-6 mx-auto stroke-2 icon animate-spin icon-tabler icon-tabler-loader-2 stroke-text-50"
							stroke="currentColor"
							fill="none"
							stroke-linecap="round"
							stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M12 3a9 9 0 1 0 9 9" /></svg
						>
					{:else}
						Prihlásenie
					{/if}
				</button>
			</div>
		</form>
	</Popup>
{/if}
