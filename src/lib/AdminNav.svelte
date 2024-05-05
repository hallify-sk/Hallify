<script lang="ts">
	import { applyAction, enhance } from '$app/forms';
	import type { AuthModel } from 'pocketbase';
	import { invalidateAll } from '$app/navigation';
	export let openLoginPopup: () => void = () => {};
</script>

<header
	class="w-60 md:w-80 h-screen bg-background-100 border-r border-background-200 fixed top-0 left-0 z-50"
>
	<div class="px-4 gap-1 flex flex-col justify-between h-full">
		<div class="flex flex-col gap-2 pb-2 border-b border-b-background-200 h-full">
			<a href="/admin" class="flex items-center gap-4 py-2 mb-10">
				<img src="https://via.placeholder.com/150" alt="logo" class="h-10 w-10" />
				<p class="text-lg font-semibold text-text-600">Reduta</p>
			</a>
			<a
				class="flex py-3 px-2 rounded-md text-text-500 hover:text-text-700 hover:bg-background-200 gap-4"
				href="/admin"
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
					class="icon icon-tabler icons-tabler-outline icon-tabler-pin"
					><path stroke="none" d="M0 0h24v24H0z" fill="none" /><path
						d="M15 4.5l-4 4l-4 1.5l-1.5 1.5l7 7l1.5 -1.5l1.5 -4l4 -4"
					/><path d="M9 15l-4.5 4.5" /><path d="M14.5 4l5.5 5.5" /></svg
				>
				Nástenka
			</a>
			<a
				class="flex py-3 px-2 rounded-md text-text-500 hover:text-text-700 hover:bg-background-200 gap-4"
				href="/admin/reservations"
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
					class="icon icon-tabler icons-tabler-outline icon-tabler-calendar"
					><path stroke="none" d="M0 0h24v24H0z" fill="none" /><path
						d="M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12z"
					/><path d="M16 3v4" /><path d="M8 3v4" /><path d="M4 11h16" /><path d="M11 15h1" /><path
						d="M12 15v3"
					/></svg
				>
				Zoznam rezervácií
			</a>
			<a
				class="flex py-3 px-2 rounded-md text-text-500 hover:text-text-700 hover:bg-background-200 gap-4"
				href="/admin/users"
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
					class="icon icon-tabler icons-tabler-outline icon-tabler-users"
					><path stroke="none" d="M0 0h24v24H0z" fill="none" /><path
						d="M9 7m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0"
					/><path d="M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" /><path
						d="M16 3.13a4 4 0 0 1 0 7.75"
					/><path d="M21 21v-2a4 4 0 0 0 -3 -3.85" /></svg
				>
				Používatelia
			</a>
		</div>
		<div class="flex flex-col gap-2 py-2">
			<div class="pl-1 pr-4 py-1 rounded-md text-text-700 flex flex-row gap-3 items-center">
				<!--
					{#if profilePic}
						<img
							class="rounded-full overflow-hidden w-8"
							src={profilePic}
							alt="Profilový obrázok"
						/>
					{/if}
					<p>{user?.name}</p>
					-->
			</div>
			<a
				class="flex py-3 px-2 rounded-md text-text-500 hover:text-text-700 hover:bg-background-200 gap-4"
				href="/admin/settings"
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
						if (result.type == 'success') {
							invalidateAll();
						}
						applyAction(result);
					};
				}}
			>
				<button
					type="submit"
					class="flex py-3 px-2 rounded-md text-text-100 gap-4 w-full bg-primary-700 hover:bg-primary-600"
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
						class="icon icon-tabler icons-tabler-outline icon-tabler-logout"
						><path stroke="none" d="M0 0h24v24H0z" fill="none" /><path
							d="M14 8v-2a2 2 0 0 0 -2 -2h-7a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2 -2v-2"
						/><path d="M9 12h12l-3 -3" /><path d="M18 15l3 -3" /></svg
					>
					Odhlásiť sa
				</button>
			</form>
		</div>
	</div>
</header>
