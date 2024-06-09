<script lang="ts">
    import Navbar from '$lib/Navbar.svelte';
    import ImagePreview from '$lib/ImagePreview.svelte';
    import type { RecordModel } from 'pocketbase';

    export let data: any;

    /**
     * Handles opening an image preview and storing reservation data.
     * @param src The image source
     * @param alt The alternative text for the image
     * @param template The reservation template data
     */
    function openImage(src: string, alt: string, template: RecordModel) {
        imageSrc = src;
        imageAlt = alt;
        openImagePreview = true;
        console.log(template);
        reservationData = template;
    }

    let openImagePreview: boolean = false;
    let imageSrc: string = '';
    let imageAlt: string = '';
    let reservationData: RecordModel;
</script>

<Navbar user={data.user} />
<div class="mt-3 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 col-span-2 ml-80 p-8">
    {#each data.templates as template}
        <button
            type="button"
            on:click={() => {
                openImage(
                    `${data.apiUrl}/files/${template.collectionId}/${template.id}/${template.image}`,
                    template.id,
                    template
                );
            }}
            class="mt-1 flex flex-row items-center gap-2 hover:brightness-90"
        >
            <img
                src="{data.apiUrl}/files/{template.collectionId}/{template.id}/{template.image}"
                alt="Stage template"
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
