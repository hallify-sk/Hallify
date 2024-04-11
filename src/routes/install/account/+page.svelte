<script lang="ts">
	import { enhance, applyAction } from '$app/forms';
	import { page } from '$app/stores';
	import { redirect } from '@sveltejs/kit';

	let adminLogin = false;
	let adminPassword = false;

	let loadingAdmin = false;

	let errorMessage: string = "";
</script>

<div class="w-full h-screen grid place-items-center z-50 text-left">
	<div>
		<h2 class="text-text-700 text-xl mb-4">Step 2: Creating admin user</h2>
		<form
			action="/install?/createAdmin"
			method="POST"
			class="flex flex-col"
			use:enhance={async () => {
				loadingAdmin = true;
				return async ({ result }) => {
					loadingAdmin = false;
					adminLogin = false;
					adminPassword = false;
					errorMessage = "";
					if (result.type == 'failure') {
						switch (result.data?.type) {
							case 'adminLogin':
								adminLogin = true;
								break;
							case 'adminPassword':
								adminPassword = true;
								break;
						}
						errorMessage =
							typeof result.data?.message == 'string' ? result.data.message : '';
					}
					if (result.type == 'success') {
						throw redirect(300, "/install/account");
					}
					await applyAction(result);
				};
			}}
		>
			<div
				class="bg-secondary-100 border border-secondary-200 rounded-md p-4 text-text-600 flex flex-col flex-nowrap max-w-[30rem] gap-2"
			>
				<h3 class="flex flex-row gap-2 items-center">
					<svg
						data-slot="icon"
						aria-hidden="true"
						fill="none"
						class="w-6 h-6"
						stroke-width="1.5"
						stroke="currentColor"
						viewBox="0 0 24 24"
						xmlns="http://www.w3.org/2000/svg"
					>
						<path
							d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
							stroke-linecap="round"
							stroke-linejoin="round"
						></path>
					</svg>
					Important information
				</h3>
				<ul class="list-disc ml-6">
					<li>
						Clients will access your website from<br><code class="bg-secondary-200 p-1 rounded-md">{$page.url.host}</code>
					</li>
					<li>
						Admins will access the admin panel from<br><code class="bg-secondary-200 p-1 rounded-md">{$page.url.host}/admin</code>
					</li>
				</ul>
				<a href="/" class="text-text-600 hover:text-text-400 mt-2 font-semibold">View guide</a>
			</div>
			{#if errorMessage}
				<p class="text-red-500 mt-2 max-w-xs">{errorMessage}</p>
			{/if}
			<fieldset class="relative text-input mt-2">
				<input
					on:change={() => (adminLogin = false)}
					placeholder=""
					type="text"
					required={true}
					id="adminLogin"
					name="adminLogin"
					class="w-[30rem] appearance-none bg-background-100 text-text-600 text-left rounded-md pb-0.5 pt-5 px-2 peer border {adminLogin
						? 'border-red-500'
						: ''}"
				/>
				<label
					for="adminLogin"
					class="absolute top-0.5 left-1 {adminLogin
						? 'text-red-500'
						: 'text-text-400'} text-sm peer-focus:top-0.5 peer-focus:left-1 peer-focus:text-text-400 peer-focus:text-sm peer-placeholder-shown:top-3 peer-placeholder-shown:left-1 peer-placeholder-shown:text-text-500 peer-placeholder-shown:text-base pointer-events-none ml-1 duration-75"
					>Admin login</label
				>
			</fieldset>
			<fieldset class="relative text-input mt-2">
				<input
					on:change={() => (adminPassword = false)}
					placeholder=""
					type="text"
					required={true}
					id="adminPassword"
					name="adminPassword"
					class="w-[30rem] appearance-none bg-background-100 text-text-600 text-left rounded-md pb-0.5 pt-5 px-2 peer border {adminPassword
						? 'border-red-500'
						: ''}"
				/>
				<label
					for="adminPassword"
					class="absolute top-0.5 left-1 {adminPassword
						? 'text-red-500'
						: 'text-text-400'} text-sm peer-focus:top-0.5 peer-focus:left-1 peer-focus:text-text-400 peer-focus:text-sm peer-placeholder-shown:top-3 peer-placeholder-shown:left-1 peer-placeholder-shown:text-text-500 peer-placeholder-shown:text-base pointer-events-none ml-1 duration-75"
					>Admin password</label
				>
			</fieldset>
			<div class="ml-auto mt-3 items-center flex flex-row flex-nowrap gap-2">
				<button
					type="submit"
					class="px-4 py-2 bg-background-700 hover:bg-primary-600 rounded-md text-text-50 w-[120px]"
				>
					{#if loadingAdmin}
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
						Continue
					{/if}
				</button>
			</div>
		</form>
	</div>
</div>
