<script lang="ts">
	import { applyAction, enhance } from "$app/forms";
	import { invalidateAll } from "$app/navigation";
	import Icon from "$lib/icons/Icon.svelte";
	import Plus from "$lib/icons/Plus.svelte";
	import { userStore } from "./authStore";
	import Dialog from "./Dialog.svelte";
	import TextInput from "./inputs/TextInput.svelte";
    export let openLoginDialog: () => void = () => {};
	export let closeLoginDialog: () => void = () => {};
</script>
<Dialog title="Prihlásiť sa" bind:handleOpen={openLoginDialog} bind:handleClose={closeLoginDialog}>
    <form class="w-full flex flex-col" action="/api/auth" method="post"
    use:enhance={() => {
		return async ({ result }) => {
			// `result` is an `ActionResult` object
			if (result.type === "failure") {
                console.error(result);
			} else {
                await invalidateAll();
                userStore.set(null);
                closeLoginDialog();
				await applyAction(result);
			}
		};
	}}>
		<div class="p-4 flex flex-col">
			<label for="" class="text-sm text-slate-800">E-Mail</label>
			<TextInput name="email" id="email" />
			<label for="" class="text-sm text-slate-800 mt-4">Heslo</label>
			<TextInput type="password" name="password" id="password"/>
		</div>
		<div class="bg-slate-200 p-4 w-full border-t border-slate-400/30 flex justify-between">
			<button
                type="button"
				on:click={closeLoginDialog}
				class="flex flex-row gap-2 items-center hover:bg-slate-100/50 duration-150 text-slate-500 px-4 py-2 rounded text-sm"
			>
				<p>Zrušiť</p>
			</button>
			<button
                type="submit"
				class="flex flex-row gap-2 items-center bg-blue-500 hover:bg-blue-400 duration-150 text-slate-100 px-4 py-2 rounded border border-blue-600/30 text-sm"
			>
				<Icon scale="small">
					<Plus />
				</Icon>
				<p>Vytvoriť udalosť</p>
			</button>
		</div>
	</form>
</Dialog>