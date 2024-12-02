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
	import type { Permission } from '$lib/server/models';

	//Components
	import Collapsible from './NavCollapsible.svelte';
	import NavCollapsibleNoButton from './NavCollapsibleNoButton.svelte';
	import Adjustments from '$lib/icons/Adjustments.svelte';

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

<div class="bg-slate-50 w-full sticky -top-[61px] left-0 z-30">
	<div class="border-b border-slate-400/30 w-full py-3 px-4 md:px-24">
		<div class="max-w-7xl mx-auto flex justify-between">
			<a href="/admin" class="flex items-center gap-2">
				<img src="/Hallify.svg" alt="logo" class="h-8 w-auto" />
				<p class="font-bold text-slate-700 poppins-black-italic">Hallify</p>
			</a>
			<div class="flex items-center">
				<NavCollapsibleNoButton bind:open={openUserDropdown} id="user">
					<button
						onclick={() => {
							openUserDropdown = !openUserDropdown;
						}}
						class="flex flex-row flex-nowrap gap-2 items-center"
					>
						<img src={avatar} alt="avatar" class="h-8 w-8 rounded border border-slate-500/30" />
						<div class="flex flex-col flex-nowrap text-left justify-center">
							<p
								class="text-slate-700 poppins-regular text-sm max-w-32 overflow-ellipsis overflow-hidden whitespace-nowrap text-nowrap"
							>
								{user.first_name}
								{user.last_name}
							</p>
							<p class="text-slate-500 poppins-light text-xs">
								{permission.name}
							</p>
						</div>
					</button>
					{#if $collapsibleOpen == 'user'}
						<div
							class="flex flex-col absolute top-[48px] right-0 bg-slate-50 border border-slate-400/30 rounded-b overflow-hidden py-1"
						>
							{#if checkPathPermission('/profile', permission)}
								<a
									href="/profile"
									class="py-2 px-3 text-sm flex items-center gap-2 w-44 hover:bg-slate-100"
								>
									<Icon scale="small">
										<UserIcon />
									</Icon>
									<p class="text-slate-600">Zobraziť profil</p>
								</a>
							{/if}
							{#if checkPathPermission('/', permission)}
								<a
									href="/"
									class="py-2 px-3 text-sm flex items-center gap-2 w-44 hover:bg-slate-100"
								>
									<Icon scale="small">
										<ArrowRight />
									</Icon>
									<p class="text-slate-600">Používateľský režím</p>
								</a>
							{/if}
							{#if checkPathPermission('/api/auth/signout', permission)}
								<form
									class="w-full flex flex-col"
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
										class="py-2 px-3 text-sm flex items-center gap-2 w-44 hover:bg-slate-100"
									>
										<Icon scale="small">
											<Logout />
										</Icon>
										<p class="text-slate-600">Odhlásiť sa</p>
									</button>
								</form>
							{/if}
						</div>
					{/if}
				</NavCollapsibleNoButton>
			</div>
		</div>
	</div>
	<div class="border-b border-slate-400/30 w-full px-4 md:px-24">
		<div class="max-w-7xl mx-auto flex text-sm text-slate-400">
			{#if checkPathPermission("/admin", permission)}
			<a
				href="/admin"
				class="py-3 px-3 text-sm border-b-2 border-b-transparent hover:border-b-blue-500 flex items-center gap-2"
			>
				<Icon scale="small">
					<Home />
				</Icon>
				<p class="text-slate-600">Domov</p>
			</a>
			{/if}
			{#if checkPathPermission('/admin/events', permission) || checkPathPermission('/admin/events/create', permission)}
				<Collapsible id="event">
					<Icon scale="small">
						<Calendar />
					</Icon>
					<p class="text-slate-600">Udalosti</p>
					<Icon scale="tiny">
						{#if $collapsibleOpen == 'event'}
							<ChevronUp />
						{:else}
							<ChevronDown />
						{/if}
					</Icon>
					{#if $collapsibleOpen == 'event'}
						<div
							class="flex flex-col absolute top-[46px] left-0 bg-slate-50 border border-slate-400/30 rounded-b overflow-hidden py-1"
						>
							{#if checkPathPermission('/admin/events', permission)}
								<a
									href="/admin/events"
									class="py-2 px-3 text-sm flex items-center gap-2 w-44 hover:bg-slate-100"
								>
									<Icon scale="small">
										<BulletList />
									</Icon>
									<p class="text-slate-600">Zobraziť udalosti</p>
								</a>
							{/if}
							{#if checkPathPermission('/admin/events/create', permission)}
								<a
									href="/admin/events/create"
									class="py-2 px-3 text-sm flex items-center gap-2 w-44 hover:bg-slate-100"
								>
									<Icon scale="small">
										<Plus />
									</Icon>
									<p class="text-slate-600">Vytvoriť udalosť</p>
								</a>
							{/if}
						</div>
					{/if}
				</Collapsible>
			{/if}
			{#if checkPathPermission('/admin/halls', permission)}
				<a
					href="/admin/halls"
					class="py-3 px-3 text-sm border-b-2 border-b-transparent hover:border-b-blue-500 flex items-center gap-2"
				>
					<Icon scale="small">
						<Adjustments/>
					</Icon>
					<p class="text-slate-600">Spravovať sály</p>
				</a>
			{/if}
		</div>
	</div>
</div>
