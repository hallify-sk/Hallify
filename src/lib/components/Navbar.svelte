<script lang="ts">
	//Icons
	import Icon from '$lib/icons/Icon.svelte';
	import Calendar from '$lib/icons/CalendarIcon.svelte';
	import Home from '$lib/icons/Home.svelte';
	import ChevronUp from '$lib/icons/ChevronUp.svelte';
	import ChevronDown from '$lib/icons/ChevronDown.svelte';
	import BulletList from '$lib/icons/BulletList.svelte';
	import Plus from '$lib/icons/Plus.svelte';
	import Chat from '$lib/icons/Chat.svelte';
	import UserIcon from '$lib/icons/User.svelte';
	import Logout from '$lib/icons/Logout.svelte';
	import ArrowRight from '$lib/icons/ArrowRight.svelte';

	//Svelte
	import { onMount } from 'svelte';
	import { applyAction, enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';

	//Dicebear
	import { createAvatar } from '@dicebear/core';
	import { initials } from '@dicebear/collection';

	//Utils
	import { checkPathPermission, collapsibleOpen } from '$lib/util';
	import type { UserSanitized } from '$lib/types/auth';
	import type { Permission } from '$lib/server/schema';

	//Components
	import Collapsible from './NavCollapsible.svelte';
	import NavCollapsibleNoButton from './NavCollapsibleNoButton.svelte';
	import AuthDialog from './AuthDialog.svelte';

	onMount(() => {
		document.addEventListener('click', (e) => {
			if (!(e.target as HTMLDivElement).closest('.dropdown')) {
				collapsibleOpen.set('');
			}
		});
	});

	let {
		user = undefined,
		permission
	}: {
		user?: UserSanitized;
		permission: Permission;
	} = $props();

	let openLogin = $state(false);
	let openRegister = $state(false);

	let openUserDropdown: boolean = $state(false);

	let avatar: string = $state(`/User.svg`);
	$effect(() => {
		if (user) {
			avatar = createAvatar(initials, {
				seed: `${user.first_name} ${user.last_name}`
			}).toDataUri();
		} else {
			avatar = `/User.svg`;
		}
	});
</script>

<div class="bg-background-1 w-full sticky -top-[61px] left-0 z-30">
	<div class="w-full px-4 py-3 border-b border-border-main/30 md:px-24">
		<div class="flex justify-between mx-auto max-w-7xl">
			<a href="/" class="flex items-center gap-2">
				<img src="/Hallify.svg" alt="logo" class="w-auto h-8" />
				<p class="font-bold text-text-main poppins-black-italic">Hallify</p>
			</a>
			<div class="flex items-center">
				<NavCollapsibleNoButton bind:open={openUserDropdown} id="user">
					<button
						onclick={user
							? () => {
									openUserDropdown = !openUserDropdown;
								}
							: () => {
									openLogin = true;
								}}
						class="flex flex-row items-center gap-2 flex-nowrap"
					>
						<img src={avatar} alt="avatar" class="w-8 h-8 border rounded border-border-main/30" />
						<div class="flex flex-col justify-center text-left flex-nowrap">
							<p
								class="overflow-hidden text-sm text-text-main poppins-regular max-w-32 overflow-ellipsis whitespace-nowrap text-nowrap"
							>
								{#if user}
									{user?.first_name} {user?.last_name}
								{:else}
									Neprihlásený používateľ
								{/if}
							</p>
							<p class="text-xs text-text-1 poppins-light">
								{#if user}
									{permission?.name}
								{:else}
									Prihlásiť sa
								{/if}
							</p>
						</div>
					</button>
					{#if $collapsibleOpen == 'user' && user}
						<div
							class="flex flex-col absolute top-[48px] right-0 bg-background-1 border border-border-main/30 rounded-b overflow-hidden py-1"
						>
							{#if checkPathPermission('/profile', permission)}
								<a
									href="/profile"
									class="flex items-center gap-2 px-3 py-2 text-sm w-44 text-text-4 hover:bg-background-4"
								>
									<Icon scale="small">
										<UserIcon />
									</Icon>
									<p>Zobraziť profil</p>
								</a>
							{/if}
							{#if checkPathPermission('/admin', permission)}
								<a
									href="/admin"
									class="flex items-center gap-2 px-3 py-2 text-sm w-44 hover:bg-background-4 text-text-4"
								>
									<Icon scale="small">
										<ArrowRight />
									</Icon>
									<p>Admin režím</p>
								</a>
							{/if}
							{#if checkPathPermission('/api/auth/signout', permission)}
								<form
									class="flex flex-col w-full"
									action="/api/auth/signout"
									method="post"
									use:enhance={() => {
										return async ({ result }) => {
											// `result` is an `ActionResult` object
											if (result.type === 'failure') {
												console.error(result);
											} else {
												await invalidateAll();
												openLogin = false;
												await applyAction(result);
											}
										};
									}}
								>
									<button
										type="submit"
										class="flex items-center gap-2 px-3 py-2 text-sm w-44 hover:bg-background-4 text-text-4"
									>
										<Icon scale="small">
											<Logout />
										</Icon>
										<p>Odhlásiť sa</p>
									</button>
								</form>
							{/if}
						</div>
					{/if}
				</NavCollapsibleNoButton>
			</div>
		</div>
	</div>
	<div class="w-full px-4 border-b border-border-main/30 md:px-24">
		<div class="flex mx-auto text-sm max-w-7xl text-text-4">
			<a
				href="/"
				class="flex items-center gap-2 px-3 py-3 text-sm border-b-2 border-b-transparent hover:border-b-primary"
			>
				<Icon scale="small">
					<Home />
				</Icon>
				<p class="text-text-4">Domov</p>
			</a>
			{#if checkPathPermission('/events', permission) || checkPathPermission('/events/create', permission)}
				<Collapsible id="event">
					<Icon scale="small">
						<Calendar />
					</Icon>
					<p class="text-text-4">Moje udalosti</p>
					<Icon scale="tiny">
						{#if $collapsibleOpen == 'event'}
							<ChevronUp />
						{:else}
							<ChevronDown />
						{/if}
					</Icon>
					{#if $collapsibleOpen == 'event'}
						<div
							class="flex flex-col absolute top-[46px] left-0 bg-background-1 border border-border-main/30 rounded-b overflow-hidden py-1"
						>
							{#if checkPathPermission('/events', permission)}
								<a
									href="/events"
									class="flex items-center gap-2 px-3 py-2 text-sm w-44 hover:bg-background-4"
								>
									<Icon scale="small">
										<BulletList />
									</Icon>
									<p class="text-text-4">Zobraziť udalosti</p>
								</a>
							{/if}
							{#if checkPathPermission('/events/create', permission)}
								<a
									href="/events/create"
									class="flex items-center gap-2 px-3 py-2 text-sm w-44 hover:bg-background-4"
								>
									<Icon scale="small">
										<Plus />
									</Icon>
									<p class="text-text-4">Vytvoriť udalosť</p>
								</a>
							{/if}
						</div>
					{/if}
				</Collapsible>
			{/if}
			{#if checkPathPermission('/contact', permission)}
				<a
					href="/contact"
					class="flex items-center gap-2 px-3 py-3 text-sm border-b-2 border-b-transparent hover:border-b-primary"
				>
					<Icon scale="small">
						<Chat />
					</Icon>
					<p class="text-text-4">Kontakt</p>
				</a>
			{/if}
		</div>
	</div>
</div>

<AuthDialog bind:openLogin bind:openRegister />
