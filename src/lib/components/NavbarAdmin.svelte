<script lang="ts">
	//Icons
	import Icon from '$lib/icons/Icon.svelte';
	import Calendar from '$lib/icons/CalendarIcon.svelte';
	import Home from '$lib/icons/Home.svelte';
	import ChevronUp from '$lib/icons/ChevronUp.svelte';
	import ChevronDown from '$lib/icons/ChevronDown.svelte';
	import BulletList from '$lib/icons/BulletList.svelte';
	import Plus from '$lib/icons/Plus.svelte';
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
	import type { Permission } from '$lib/server/models';

	//Components
	import Collapsible from './NavCollapsible.svelte';
	import NavCollapsibleNoButton from './NavCollapsibleNoButton.svelte';
	import Adjustments from '$lib/icons/Adjustments.svelte';
	import Grid from '$lib/icons/Grid.svelte';
	import Square2Stack from '$lib/icons/Square2Stack.svelte';
	import Clock from '$lib/icons/Clock.svelte';

	onMount(() => {
		document.addEventListener('click', (e) => {
			if (!(e.target as HTMLDivElement).closest('.dropdown')) {
				collapsibleOpen.set('');
			}
		});
	});

	let {
		user,
		permission
	}: {
		user: UserSanitized;
		permission: Permission;
	} = $props();

	let openUserDropdown: boolean = $state(false);

	let avatar: string = $state(
		createAvatar(initials, {
			seed: `${user.first_name} ${user.last_name}`
		}).toDataUri()
	);
</script>

<div class="bg-background-1 w-full sticky -top-[61px] left-0 z-30">
	<div class="w-full px-4 py-3 border-b border-border-main/30 md:px-24">
		<div class="flex justify-between mx-auto max-w-7xl">
			<a href="/admin" class="flex items-center gap-2">
				<img src="/Hallify.svg" alt="logo" class="w-auto h-8" />
				<p class="font-bold text-text-main poppins-black-italic">Hallify</p>
			</a>
			<div class="flex items-center">
				<NavCollapsibleNoButton bind:open={openUserDropdown} id="user">
					<button
						onclick={() => {
							openUserDropdown = !openUserDropdown;
						}}
						class="flex flex-row items-center gap-2 flex-nowrap"
					>
						<img src={avatar} alt="avatar" class="w-8 h-8 border rounded border-border-main/30" />
						<div class="flex flex-col justify-center text-left flex-nowrap">
							<p
								class="overflow-hidden text-sm text-text-main poppins-regular max-w-32 overflow-ellipsis whitespace-nowrap text-nowrap"
							>
								{user.first_name}
								{user.last_name}
							</p>
							<p class="text-xs text-text-1 poppins-light">
								{permission.name}
							</p>
						</div>
					</button>
					{#if $collapsibleOpen == 'user'}
						<div
							class="flex flex-col absolute top-[48px] right-0 bg-background-1 border border-border-main/30 rounded-b overflow-hidden py-1"
						>
							{#if checkPathPermission('/profile', permission)}
								<a
									href="/profile"
									class="flex items-center gap-2 px-3 py-2 text-sm w-44 hover:bg-background-4 text-text-4"
								>
									<Icon scale="small">
										<UserIcon />
									</Icon>
									<p>Zobraziť profil</p>
								</a>
							{/if}
							{#if checkPathPermission('/', permission)}
								<a
									href="/"
									class="flex items-center gap-2 px-3 py-2 text-sm w-44 hover:bg-background-4 text-text-4"
								>
									<Icon scale="small">
										<ArrowRight />
									</Icon>
									<p class="text-text-4">Používateľský režím</p>
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
										<p class="text-text-4">Odhlásiť sa</p>
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
			{#if checkPathPermission('/admin', permission)}
				<a
					href="/admin"
					class="flex items-center gap-2 px-3 py-3 text-sm border-b-2 text-text-4 border-b-transparent hover:border-b-blue-500"
				>
					<Icon scale="small">
						<Home />
					</Icon>
					<p>Domov</p>
				</a>
			{/if}
			{#if checkPathPermission('/admin/events', permission) || checkPathPermission('/admin/events/create', permission)}
				<Collapsible id="event">
					<Icon scale="small">
						<Calendar />
					</Icon>
					<p class="text-text-4">Udalosti</p>
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
							{#if checkPathPermission('/admin/events', permission)}
								<a
									href="/admin/events"
									class="flex items-center gap-2 px-3 py-2 text-sm w-44 hover:bg-background-4"
								>
									<Icon scale="small">
										<BulletList />
									</Icon>
									<p class="text-text-4">Zobraziť udalosti</p>
								</a>
							{/if}
							{#if checkPathPermission('/admin/events/create', permission)}
								<a
									href="/admin/events/create"
									class="flex items-center gap-2 px-3 py-2 text-sm w-44 hover:bg-background-4"
								>
									<Icon scale="small">
										<Plus />
									</Icon>
									<p class="text-text-4">Vytvoriť udalosť</p>
								</a>
							{/if}
							{#if checkPathPermission('/admin/events', permission)}
							<a
								href="/admin/event-blocks"
								class="flex items-center gap-2 px-3 py-2 text-sm w-44 hover:bg-background-4"
							>
								<Icon scale="small">
									<Clock />
								</Icon>
								<p class="text-text-4">Časové výluky</p>
							</a>
						{/if}
						</div>
					{/if}
				</Collapsible>
			{/if}
			{#if checkPathPermission('/admin/halls', permission) || checkPathPermission('/admin/plans', permission)}
				<Collapsible id="halls">
					<Icon scale="small">
						<Grid />
					</Icon>
					<p class="text-text-4">Sály</p>
					<Icon scale="tiny">
						{#if $collapsibleOpen == 'halls'}
							<ChevronUp />
						{:else}
							<ChevronDown />
						{/if}
					</Icon>
					{#if $collapsibleOpen == 'halls'}
						<div
							class="flex flex-col absolute top-[46px] left-0 bg-background-1 border border-border-main/30 rounded-b overflow-hidden py-1"
						>
							{#if checkPathPermission('/admin/halls', permission)}
								<a
									href="/admin/halls"
									class="flex items-center gap-2 px-3 py-2 text-sm w-44 hover:bg-background-4"
								>
									<Icon scale="small">
										<Adjustments />
									</Icon>
									<p class="text-text-4">Spravovať sály</p>
								</a>
							{/if}
							{#if checkPathPermission('/admin/plans', permission)}
							<a
							href="/admin/plans"
							class="flex items-center gap-2 px-3 py-2 text-sm w-44 hover:bg-background-4"
						>
							<Icon scale="small">
								<Square2Stack />
							</Icon>
							<p class="text-text-4">Spravovať plány</p>
						</a>
							{/if}
						</div>
					{/if}
				</Collapsible>
			{/if}
			{#if checkPathPermission('/admin/halls', permission)}
				<a
					href="/admin/halls"
					class="flex items-center gap-2 px-3 py-3 text-sm border-b-2 border-b-transparent hover:border-b-primary"
				>
					<Icon scale="small">
						<Adjustments />
					</Icon>
					<p class="text-text-4">Spravovať sály</p>
				</a>
			{/if}
		</div>
	</div>
</div>
