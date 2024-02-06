<script lang="ts">
	import { applyAction, enhance } from '$app/forms';
	import { PUBLIC_TURNSTILE_TOKEN } from '$env/static/public';
	import Popup from './Popup.svelte';
	let openLoginPopup: () => void;
	let loadingLogin: boolean = false;
	let closeLoginPopup: () => void;

	let openRegisterPopup: () => void;
	let loadingRegister: boolean = false;
	let closeRegisterPopup: () => void;

	//Validation variables
	let emailLoginError: boolean = false;
	let passwordLoginError: boolean = false;
	let errorLoginMessage: string = '';

	let emailRegisterError: boolean = false;
	let passwordRegisterError: boolean = false;
	let nameRegisterError: boolean = false;
	let errorRegisterMessage: string = '';

	import { Turnstile } from 'svelte-turnstile';
</script>

<header class="fixed top-0 left-0 w-screen bg-background-50 py-1 px-2">
	<div class="max-w-7xl mx-auto">
		<div class="flex flex-row justify-between items-center">
			<div class="flex flex-row flex-nowrap gap-2">
				<a class="flex items-center gap-2 pr-4 border-r border-background-100" href="/">
					<img src="https://via.placeholder.com/150" alt="logo" class="h-10 w-10" />
					<p class="text-lg font-semibold text-text-600">Reduta</p>
				</a>
				<nav class="flex flex-row flex-nowrap gap-8 items-center mx-4 text-text-600">
					<a href="/#about" class="hover:text-text-400">Moje podujatia</a>
					<a href="/#services" class="hover:text-text-400">Služby</a>
					<a href="/#contact" class="hover:text-text-400">Kontakt</a>
				</nav>
			</div>
			<div class="flex flex-row flex-nowrap gap-2 items-center">
				<button
					on:click={openLoginPopup}
					class="px-4 py-2 bg-background-700 hover:bg-primary-600 rounded-md text-text-50"
					>Prihlásenie</button
				>
			</div>
		</div>
	</div>
</header>

<Popup bind:openPopup={openLoginPopup} bind:closePopup={closeLoginPopup}>
	<h2 class="text-text-700 text-xl mb-4">Prihlásenie</h2>
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
				if (result.type == 'failure') {
					switch(result.data?.type){
						case "email": emailLoginError = true; break;
						case "password": passwordLoginError = true; break;
						case "auth": {
							emailLoginError = true;
							passwordLoginError = true;
						}; break;
					}
					errorLoginMessage = typeof result.data?.message == "string" ? result.data.message : "";
				}
				if(result.type == "success") return closeLoginPopup();
				await applyAction(result);
			};
		}}
	>
	<p class="text-red-500 mb-2">{errorLoginMessage}</p>
		<Turnstile siteKey={PUBLIC_TURNSTILE_TOKEN} appearance="interaction-only" />
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
		<fieldset class="relative text-input mt-2">
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
		<p class="my-2 text-text-700">Nemáte účet? <button type="button" class="text-text-600 hover:text-text-400" on:click={()=>{
			closeLoginPopup();
			openRegisterPopup();
		}}>Vytvorte si nový účet.</button></p>
		<div class="ml-auto mt-3 items-center flex flex-row flex-nowrap gap-2">
			<button
				type="reset"
				on:click={closeLoginPopup}
				class="px-4 py-2 bg-background-100 hover:bg-background-200 rounded-md text-text-900"
				>Zrušiť</button
			>
			<button
				type="submit"
				class="px-4 py-2 bg-background-700 hover:bg-primary-600 rounded-md text-text-50 w-[120px]"
			>
				{#if loadingLogin}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="icon animate-spin icon-tabler icon-tabler-loader-2 mx-auto stroke-2 stroke-text-50 h-6 w-6"
						stroke="currentColor"
						fill="none"
						stroke-linecap="round"
						stroke-linejoin="round"
						><path stroke="none" d="M0 0h24v24H0z" fill="none" /><path
							d="M12 3a9 9 0 1 0 9 9"
						/></svg
					>
				{:else}
					Prihlásiť sa
				{/if}
			</button>
		</div>
	</form>
</Popup>

<Popup bind:openPopup={openRegisterPopup} bind:closePopup={closeRegisterPopup}>
	<h2 class="text-text-700 text-xl mb-4">Registrácia</h2>
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
				if (result.type == 'failure') {
					switch(result.data?.type){
						case "name": nameRegisterError = true; break;
						case "email": emailRegisterError = true; break;
						case "password": passwordRegisterError = true; break;
					}
					errorRegisterMessage = typeof result.data?.message == "string" ? result.data.message : "";
				}
				if(result.type == "success") return closeRegisterPopup();
				await applyAction(result);
			};
		}}
	>
	<p class="text-red-500 mb-2">{errorRegisterMessage}</p>
		<Turnstile siteKey={PUBLIC_TURNSTILE_TOKEN} appearance="interaction-only" />
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
		<fieldset class="relative text-input mt-2">
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
		<fieldset class="relative text-input mt-2">
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
		<p class="my-2 text-text-700">Nemáte účet? <button type="button" class="text-text-600 hover:text-text-400" on:click={()=>{
			closeRegisterPopup();
			openLoginPopup();
		}}>Vytvorte si nový účet.</button></p>
		<div class="ml-auto mt-3 items-center flex flex-row flex-nowrap gap-2">
			<button
				type="reset"
				on:click={closeRegisterPopup}
				class="px-4 py-2 bg-background-100 hover:bg-background-200 rounded-md text-text-900"
				>Zrušiť</button
			>
			<button
				type="submit"
				class="px-4 py-2 bg-background-700 hover:bg-primary-600 rounded-md text-text-50 w-[120px]"
			>
				{#if loadingRegister}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="icon animate-spin icon-tabler icon-tabler-loader-2 mx-auto stroke-2 stroke-text-50 h-6 w-6"
						stroke="currentColor"
						fill="none"
						stroke-linecap="round"
						stroke-linejoin="round"
						><path stroke="none" d="M0 0h24v24H0z" fill="none" /><path
							d="M12 3a9 9 0 1 0 9 9"
						/></svg
					>
				{:else}
					Prihlásenie
				{/if}
			</button>
		</div>
	</form>
</Popup>