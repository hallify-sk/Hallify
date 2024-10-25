<script lang="ts">
	import Calendar from '$lib/icons/CalendarIcon.svelte';
	import Home from '$lib/icons/Home.svelte';
	import { collapsibleOpen } from '$lib/util';
	import { onMount } from 'svelte';
	import Collapsible from './NavCollapsible.svelte';
	import Icon from '$lib/icons/Icon.svelte';
	import ChevronUp from '$lib/icons/ChevronUp.svelte';
	import ChevronDown from '$lib/icons/ChevronDown.svelte';
	import BulletList from '$lib/icons/BulletList.svelte';
	import Plus from '$lib/icons/Plus.svelte';
    import Chat from '$lib/icons/Chat.svelte';

	//If click outside of collapsible, close collapsible
	onMount(() => {
		document.addEventListener('click', (e) => {
			if (!(e.target as HTMLDivElement).closest('.dropdown')) {
				collapsibleOpen.set('');
			}
		});
	});

    import { createAvatar } from '@dicebear/core';
    import { initials } from '@dicebear/collection';
	import NavCollapsibleNoButton from './NavCollapsibleNoButton.svelte';
	import User from '$lib/icons/User.svelte';
	import Logout from '$lib/icons/Logout.svelte';
	import ArrowRight from '$lib/icons/ArrowRight.svelte';
	import Adjustments from '$lib/icons/Adjustments.svelte';

    const avatar = createAvatar(initials, {
        seed: 'Richard Marcinčák',
        // ... other options
    }).toDataUri();

let toggleUserDropdown: any;
</script>

<div class="bg-slate-50 w-full sticky -top-[61px] left-0 z-30">
	<div class="border-b border-slate-400/30 w-full py-3 px-4 md:px-24">
		<div class="max-w-7xl mx-auto flex justify-between">
			<a href="/" class="flex items-center gap-2">
				<img src="/Hallify.svg" alt="logo" class="h-8 w-auto" />
				<p class="font-bold text-slate-700 poppins-black-italic">Hallify</p>
			</a>
            <div class="flex items-center">
                <NavCollapsibleNoButton bind:toggleCollapsible={toggleUserDropdown} id="user">
                    <button on:click={toggleUserDropdown} class="flex flex-row flex-nowrap gap-2 items-center group">
                        <img src={avatar} alt="avatar" class="h-8 w-8 rounded border border-slate-500/30" />
                        <div class="flex flex-col flex-nowrap text-left justify-center">
                            <p class="text-slate-700 poppins-regular text-sm max-w-32 overflow-ellipsis overflow-hidden whitespace-nowrap text-nowrap">Richard Marcinčák</p>
                            <p class="text-slate-500 poppins-light text-xs group-hover:text-slate-700">Administrator</p>
                        </div>
                    </button>
                    {#if $collapsibleOpen == 'user'}
					<div
						class="flex flex-col absolute top-[48px] right-0 bg-slate-50 border border-slate-400/30 rounded-b overflow-hidden py-1"
					>
						<a href="#" class="py-2 px-3 text-sm flex items-center gap-2 w-44 hover:bg-slate-100">
							<Icon scale="small">
								<User/>
							</Icon>
							<p class="text-slate-600">Zobraziť profil</p>
						</a>
						<a href="/" class="py-2 px-3 text-sm flex items-center gap-2 w-44 hover:bg-slate-100">
							<Icon scale="small">
								<ArrowRight/>
							</Icon>
							<p class="text-slate-600">Uživateľský režím</p>
						</a>
						<a
							href="#"
							class="py-2 px-3 text-sm flex items-center gap-2 w-44 hover:bg-slate-100"
						>
							<Icon scale="small">
								<Logout />
							</Icon>
							<p class="text-slate-600">Odhlásiť sa</p>
						</a>
					</div>
				{/if}
                </NavCollapsibleNoButton>
            </div>
		</div>
	</div>
	<div class="border-b border-slate-400/30 w-full px-4 md:px-24">
		<div class="max-w-7xl mx-auto flex text-sm text-slate-400">
			<a
				href="#"
				class="py-3 px-3 text-sm border-b-2 border-b-transparent hover:border-b-blue-500 flex items-center gap-2"
			>
				<Icon scale="small">
					<Home />
				</Icon>
				<p class="text-slate-600">Domov</p>
			</a>
			<Collapsible id="event">
				<Icon scale="small">
					<Calendar />
				</Icon>
				<p class="text-slate-600">Manažment udalostí</p>
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
						<a href="#" class="py-2 px-3 text-sm flex items-center gap-2 w-44 hover:bg-slate-100">
							<Icon scale="small">
								<BulletList />
							</Icon>
							<p class="text-slate-600">Zobraziť udalosti</p>
						</a><a
							href="#"
							class="py-2 px-3 text-sm flex items-center gap-2 w-44 hover:bg-slate-100"
						>
							<Icon scale="small">
								<Plus />
							</Icon>
							<p class="text-slate-600">Vytvoriť udalosť</p>
						</a>
					</div>
				{/if}
			</Collapsible>
			<a
				href="/admin/halls"
				class="py-3 px-3 text-sm border-b-2 border-b-transparent hover:border-b-blue-500 flex items-center gap-2"
			>
				<Icon scale="small">
					<Adjustments />
				</Icon>
				<p class="text-slate-600">Manažment sál</p>
			</a>
            <a
				href="#"
				class="py-3 px-3 text-sm border-b-2 border-b-transparent hover:border-b-blue-500 flex items-center gap-2"
			>
				<Icon scale="small">
					<Chat/>
				</Icon>
				<p class="text-slate-600">Správy</p>
			</a>
		</div>
	</div>
</div>
