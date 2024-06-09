<script lang="ts">
	import AdminNav from "$lib/AdminNav.svelte";
	import { goto } from "$app/navigation";
	import { enhance, applyAction } from "$app/forms";
	import type { RecordModel } from "pocketbase";

	export let data;

	let nameError: boolean = false;
	let emailError: boolean = false;
	let createdError: boolean = false;
	let updatedError: boolean = false;

	let error: string = "";
</script>

<AdminNav />
<div class="flex flex-row flex-nowrap relative ml-80">
	<div class="min-h-screen pt-24 px-14 w-full xl:w-3/4">
		<div class="flex flex-row flex-nowrap items-center justify-between">
			<h1 class="text-2xl font-bold text-text-600">Detaily používateľa</h1>
		</div>
		<form
			method="post"
			action="/admin/users/{data.slug}/?/updateUser"
			use:enhance={() => {
				return ({ result }) => {
					console.log(result);
					if (result.type == "success") {
						goto(`/admin/users/`);
					} else if (result.type == "failure") {
						switch (result.data?.type) {
							case "name":
								nameError = true;
								break;
							case "email":
								emailError = true;
								break;
							case "created":
								createdError = true;
								break;
							case "updated":
								updatedError = true;
								break;
						}
						error = `${result.data?.message}` || "";
					}
					applyAction(result);
				};
			}}
			class="grid grid-cols-1 lg:grid-cols-2 mt-7 gap-3 w-full"
		>
			{#if error}
				<p class="text-red-500 col-span-1 lg:col-span-2">{error}</p>
			{/if}
			<fieldset class="relative text-input">
				<!-- svelte-ignore missing-declaration -->
				<input
					on:change={() => (nameError = false)}
					placeholder=""
					value={data.user.name || "Bez mena"}
					type="text"
					required={true}
					id="name"
					name="name"
					class="appearance-none w-full bg-background-100 text-text-600 text-left rounded-md pb-0.5 pt-5 px-2 peer border {nameError
						? 'border-red-500'
						: ''}"
				/>
				<label
					for="name"
					class="absolute top-0.5 left-1 {nameError
						? 'text-red-500'
						: 'text-text-400'} text-sm peer-focus:top-0.5 peer-focus:left-1 peer-focus:text-text-400 peer-focus:text-sm peer-placeholder-shown:top-3 peer-placeholder-shown:left-1 peer-placeholder-shown:text-text-500 peer-placeholder-shown:text-base pointer-events-none ml-1 duration-75"
					>Meno používateľa</label
				>
			</fieldset>
			<fieldset class="relative text-input">
				<!-- svelte-ignore missing-declaration -->
				<input
					on:change={() => (nameError = false)}
					placeholder=""
					value={data.user.email || "Bez emailu"}
					type="text"
					required={true}
					id="email"
					name="email"
					class="appearance-none w-full bg-background-100 text-text-600 text-left rounded-md pb-0.5 pt-5 px-2 peer border {emailError
						? 'border-red-500'
						: ''}"
				/>
				<label
					for="email"
					class="absolute top-0.5 left-1 {emailError
						? 'text-red-500'
						: 'text-text-400'} text-sm peer-focus:top-0.5 peer-focus:left-1 peer-focus:text-text-400 peer-focus:text-sm peer-placeholder-shown:top-3 peer-placeholder-shown:left-1 peer-placeholder-shown:text-text-500 peer-placeholder-shown:text-base pointer-events-none ml-1 duration-75"
					>E-Mail používateľa</label
				>
			</fieldset>
			<fieldset class="relative text-input">
				<input
					on:change={() => (createdError = false)}
					placeholder=""
					disabled={true}
					value={new Date(data.user.created).toLocaleDateString("sk")}
					type="text"
					required={true}
					id="datumVytvorenia"
					name="datumVytvorenia"
					class="appearance-none w-full bg-background-100 text-text-600 text-left rounded-md pb-0.5 pt-5 px-2 peer border mt-0.5 {createdError
						? 'border-red-500'
						: ''}"
				/>
				<label
					for="datumUdalosti"
					class="absolute top-0.5 left-1 {createdError
						? 'text-red-500'
						: 'text-text-400'} text-sm peer-focus:top-0.5 peer-focus:left-1 peer-focus:text-text-400 peer-focus:text-sm peer-placeholder-shown:top-3 peer-placeholder-shown:left-1 peer-placeholder-shown:text-text-500 peer-placeholder-shown:text-base pointer-events-none ml-1 duration-75"
					>Vytvorený</label
				>
			</fieldset>
			<fieldset class="relative text-input">
				<input
					on:change={() => (updatedError = false)}
					placeholder=""
					disabled={true}
					value={new Date(data.user.updated).toLocaleDateString("sk")}
					type="text"
					required={true}
					id="datumVytvorenia"
					name="datumVytvorenia"
					class="appearance-none w-full bg-background-100 text-text-600 text-left rounded-md pb-0.5 pt-5 px-2 peer border mt-0.5 {updatedError
						? 'border-red-500'
						: ''}"
				/>
				<label
					for="datumUdalosti"
					class="absolute top-0.5 left-1 {updatedError
						? 'text-red-500'
						: 'text-text-400'} text-sm peer-focus:top-0.5 peer-focus:left-1 peer-focus:text-text-400 peer-focus:text-sm peer-placeholder-shown:top-3 peer-placeholder-shown:left-1 peer-placeholder-shown:text-text-500 peer-placeholder-shown:text-base pointer-events-none ml-1 duration-75"
					>Naposledy zmenený</label
				>
			</fieldset>
			<textarea
				placeholder="Komentár admina (neviditeľné pre používateľa) [max. 600 znakov]"
				maxlength="600"
				class="bg-background-100 resize-none rounded-md col-span-1 lg:col-span-2 min-h-40 p-2"
				name="adminComment"
				id="adminComment">{data.user.adminNotes || ""}</textarea
			>
			<div class="ml-auto mt-3 items-center flex flex-row flex-nowrap gap-2 col-span-1 lg:col-span-2">
				<button
					type="reset"
					on:click={() => {
						goto(`/admin/users`);
					}}
					class="px-4 py-2 bg-background-100 hover:bg-background-200 rounded-md text-text-900">Späť</button
				>
				<button type="submit" class="px-4 py-2 bg-background-700 hover:bg-primary-600 rounded-md text-text-50 w-[120px]"> Zmeniť </button>
			</div>
		</form>
	</div>
</div>

<style lang="postcss">
	input[type="number"] {
		-moz-appearance: textfield;
		appearance: textfield;
		@apply m-0;
	}
	input[type="number"]::-webkit-inner-spin-button,
	input[type="number"]::-webkit-outer-spin-button {
		@apply appearance-none m-0;
	}
</style>
