<script lang="ts">
	import { applyAction, enhance } from "$app/forms";
	import { invalidateAll } from "$app/navigation";

	export let pageName = "Site name";
</script>

<header class="fixed top-0 left-0 w-full bg-background-100 flex flex-row flex-nowrap justify-between items-center pl-64 pr-2 py-6 z-50">
	<h1 class="text-xl text-text-600 ml-8 font-semibold">{pageName}</h1>
	<form
		method="POST"
		action="/?/logout"
		class="flex"
		use:enhance={async () => {
			return async ({ result }) => {
				if (result.type == "success") {
					invalidateAll();
				}
				applyAction(result);
			};
		}}
	>
		<button type="submit" class="flex flex-row flex-nowrap justify-between items-center w-52 group py-1 px-3">
			<div class="flex flex-col">
				<p class="text-text-600 text-left leading-4">Administrator</p>
				<p class="text-text-400 text-sm text-left group-hover:text-red-500">Kliknutím sa odhlasíte</p>
			</div>
		</button>
	</form>
</header>
<aside class="w-60 h-screen bg-background-800 fixed top-0 left-0 z-50 overflow-clip duration-200 ease-in-out">
	<div class="gap-1 flex flex-col justify-between h-full">
		<div class="flex flex-col gap-2 pb-2 h-full">
			<a href="/admin" class="flex items-center gap-4 py-2 mb-4 bg-background-800 shadow-lg px-4">
				<img src="/Hallify.svg" alt="logo" class="h-10 w-10" />
				<p class="text-lg font-semibold text-text-100">Hallify</p>
			</a>
			<div class="pl-4 mb-8">
				<p class="uppercase text-text-500 font-semibold px-2 text-sm mb-2 pointer-events-none select-none">hlavné</p>
				<a class="nav-link" href="/admin">
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
						><path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M15 4.5l-4 4l-4 1.5l-1.5 1.5l7 7l1.5 -1.5l1.5 -4l4 -4" /><path
							d="M9 15l-4.5 4.5"
						/><path d="M14.5 4l5.5 5.5" /></svg
					>
					<p>Nástenka</p>
				</a>
				<a class="nav-link" href="/admin/reservations">
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
						/><path d="M16 3v4" /><path d="M8 3v4" /><path d="M4 11h16" /><path d="M11 15h1" /><path d="M12 15v3" /></svg
					>
					Rezervácie
				</a>
				<a class="nav-link" href="/admin/users">
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
						><path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M9 7m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0" /><path
							d="M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2"
						/><path d="M16 3.13a4 4 0 0 1 0 7.75" /><path d="M21 21v-2a4 4 0 0 0 -3 -3.85" /></svg
					>
					Používatelia
				</a>
			</div>
			<div class="pl-4 mb-8">
				<p class="uppercase text-text-500 font-semibold px-2 text-sm mb-2 pointer-events-none select-none">nastavenia</p>
				<a class="nav-link" href="/admin/halls">
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
						class="icon icon-tabler icons-tabler-outline icon-tabler-grid-3x3"
						><path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M3 8h18" /><path d="M3 16h18" /><path d="M8 3v18" /><path
							d="M16 3v18"
						/></svg
					>
					<p>Sály</p>
				</a>
			</div>
		</div>
	</div>
</aside>

<style lang="postcss">
	.nav-link {
		@apply flex py-2 px-2 rounded-md text-text-200 hover:text-text-50 gap-4 items-center w-full;
	}
	.nav-link svg {
		@apply w-5 h-5;
	}
</style>
