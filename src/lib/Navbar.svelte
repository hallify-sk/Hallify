<script lang="ts">
	import { applyAction, enhance } from "$app/forms";
    import Popup from "./Popup.svelte";
    let openLoginPopup: () => void;
    let closeLoginPopup: () => void;
    let openRegisterPopup: () => void;
    let closeRegisterPopup: () => void;
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
				<button on:click={openLoginPopup} class="px-4 py-2 bg-background-700 hover:bg-primary-600 rounded-md text-text-50"
					>Prihlásenie</button
				>
			</div>
		</div>
	</div>
</header>

<Popup bind:openPopup={openLoginPopup} bind:closePopup={closeLoginPopup}>
    <h2 class="text-text-700 text-xl mb-4">Prihlásenie</h2>
	<form
		action="/login"
		class="flex flex-col"
		use:enhance={async ({ formData }) => {
			return async ({ result }) => {
				await applyAction(result);
			};
		}}
		method="POST"
	>
		<fieldset class="relative text-input">
			<input
				placeholder=""
				type="text"
				required={true}
				id="name"
				name="name"
				class="w-80 appearance-none bg-background-100 text-text-600 text-left rounded-md pb-0.5 pt-5 px-2 peer"
			/>
			<label
				for="name"
				class="absolute top-0.5 left-1 text-text-400 text-sm peer-focus:top-0.5 peer-focus:left-1 peer-focus:text-text-400 peer-focus:text-sm peer-placeholder-shown:top-3 peer-placeholder-shown:left-1 peer-placeholder-shown:text-text-500 peer-placeholder-shown:text-base pointer-events-none ml-1 duration-75"
				>Prihlasovací e-mail</label
			>
		</fieldset>
        <fieldset class="relative text-input mt-2">
			<input
				placeholder=""
				type="password"
				required={true}
				id="name"
				name="name"
				class="w-80 appearance-none bg-background-100 text-text-600 text-left rounded-md pb-0.5 pt-5 px-2 peer"
			/>
			<label
				for="name"
				class="absolute top-0.5 left-1 text-text-400 text-sm peer-focus:top-0.5 peer-focus:left-1 peer-focus:text-text-400 peer-focus:text-sm peer-placeholder-shown:top-3 peer-placeholder-shown:left-1 peer-placeholder-shown:text-text-500 peer-placeholder-shown:text-base pointer-events-none ml-1 duration-75"
				>Heslo</label
			>
		</fieldset>
		<div class="ml-auto">
			<button
				type="reset"
				on:click={closeLoginPopup}
				class="px-4 py-2 bg-background-100 hover:bg-background-200 rounded-md text-text-900 mt-3"
				>Zrušiť</button
			>
			<button
				type="submit"
				on:click={closeLoginPopup}
			class="px-4 py-2 bg-background-700 hover:bg-primary-600 rounded-md text-text-50 mt-3"
				>Uložiť</button
			>
		</div>
	</form>
</Popup>

<Popup bind:openPopup={openRegisterPopup} bind:closePopup={closeRegisterPopup}>
	<h1 class="text-2xl">Welcome to the registry editor!</h1>
	<p class="text-lg">This is where you can create and edit stages.</p>
    <button on:click={()=>{
        closeRegisterPopup();
        openLoginPopup();
    }} class="px-4 py-2 bg-background-700 hover:bg-primary-600 rounded-md text-text-50"
					>Prihlásenie</button
	>
</Popup>