<script lang="ts">
	import Checkbox from '$lib/Checkbox.svelte';
	import Select from '$lib/Select.svelte';
	import Navbar from '$lib/Navbar.svelte';
	import { getMinutesToDate } from '$lib/lib.js';
	import { goto } from '$app/navigation';
	import { enhance, applyAction } from '$app/forms';

	import { PUBLIC_API_URL } from '$env/static/public';
	import ImagePreview from '$lib/ImagePreview.svelte';
	import type { RecordModel } from 'pocketbase';

	export let data;
	console.log(data);

	let nameError: boolean = false;
	let categoryError: boolean = false;
	let dateError: boolean = false;
	let guestError: boolean = false;

	let openImagePreview: boolean = false;
	let imageSrc: string = '';
	let imageAlt: string = '';
	let reservationData: RecordModel;

	function openImage(src: string, alt: string, template: RecordModel) {
		imageSrc = src;
		imageAlt = alt;
		openImagePreview = true;
		reservationData = template;
	}
</script>

<Navbar user={data.user} />
<div class="mt-3 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 col-span-2 ml-80 p-8">
	{#each data.templates as template}
		<button
			type="button"
			on:click={() => {
				openImage(
					`${PUBLIC_API_URL}/files/${template.collectionId}/${template.id}/${template.image}`,
					template.id,
					template
				);
			}}
			class="mt-1 flex flex-row items-center gap-2 hover:brightness-90"
		>
			<img
				src="{PUBLIC_API_URL}/files/{template.collectionId}/{template.id}/{template.image}"
				alt=""
			/>
		</button>
	{/each}
</div>

<ImagePreview bind:isOpen={openImagePreview} bind:imageSrc bind:imageAlt bind:reservationData />

<style lang="postcss">
	input[type='number'] {
		-moz-appearance: textfield;
		appearance: textfield;
		@apply m-0;
	}
	input[type='number']::-webkit-inner-spin-button,
	input[type='number']::-webkit-outer-spin-button {
		@apply appearance-none m-0;
	}
</style>
