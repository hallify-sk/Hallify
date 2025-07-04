<script lang="ts">
  let {
    id = "",
    name = "",
    checked = $bindable(false)
  }: {
    id: string;
    name: string;
    checked?: boolean;
  } = $props();
</script>

<input bind:checked class="hidden peer" {id} {name} type="checkbox">
<label for={id} class="block mt-1 px-4 py-2 rounded-full {checked ? "bg-primary border-primary-4" : "bg-background-main border-gray-300"} border cursor-pointer relative duration-150">
    <div class="absolute {checked ? "left-4" : "left-0"} top-0 h-4 w-4 bg-white rounded-full duration-150"></div>
</label>