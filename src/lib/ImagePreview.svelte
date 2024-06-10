<script lang="ts">
	import type { RecordModel } from "pocketbase";

	// hot fix pre Parameter 'i' implicitly has an 'any' type. (ts) v {reservationData?.expand?.categories.map((i) => i.name).join(", ")}
	interface Category {
		id: string;
		name: string;
	}

	interface ReservationData extends RecordModel {
		chairCount: number;
		expand?: {
			categories: Category[];
		};
	}
	//

	export let isOpen: boolean = false;
	export let imageSrc: string = "";
	export let imageAlt: string = "";
	export let reservationData: ReservationData;

	function closeImage() {
		isOpen = false;
	}

	console.log(reservationData);
</script>

<div class="w-screen h-screen fixed top-0 left-0 bg-black/50 z-50 place-items-center p-8 {isOpen ? 'grid' : 'hidden'}">
	<div class="overflow-auto bg-white p-8 rounded-md flex flex-col flex-nowrap gap-2">
		<div class="w-full text-left">
			<h2 class="text-xl font-bold text-text-500">Rozloženie sály</h2>
			<p class="text-text-400">Toto rozloženie viete ďalej upraviť, alebo ho priamo použiť</p>
		</div>
		<div class="grid grid-cols-5 w-[40rem] gap-2">
			<div class="col-span-3 aspect-square overflow-auto rounded-md">
				<img src={imageSrc} alt={imageAlt} class="h-full mx-auto" />
			</div>
			<div class="col-span-2">
				<!--Stage details-->
				<p>Použiteľné pre: {reservationData?.expand?.categories.map((i) => i.name).join(", ")}</p>
				<p>Počet stoličiek: {reservationData?.chairCount}</p>
			</div>
		</div>
		<!-- <div class="w-[40rem] h-[40rem] overflow-auto rounded-md">
            <img src={imageSrc} alt={imageAlt} class="w-full">
        </div> -->
		<div class="flex flex-row gap-2 justify-end">
			<button on:click={closeImage} class="px-4 py-2 bg-background-100 hover:bg-background-200 rounded-md text-text-900 mt-3">Zrušiť</button>
			<a href="/editor/{reservationData?.id}" class="px-4 py-2 bg-accent-700 hover:bg-accent-600 rounded-md text-text-50 mt-3"
				>Upraviť a použiť</a
			>
			<button class="px-4 py-2 bg-background-700 hover:bg-primary-600 rounded-md text-text-50 mt-3">Použiť</button>
		</div>
	</div>
</div>
