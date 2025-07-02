<script lang="ts">
  let {
    options,
    value = $bindable(''),
    placeholder,
    disabled,
    label,
    error,
    onchange
  }: {
    options: { value: string; label: string }[],
    value: string,
    placeholder?: string,
    disabled?: boolean,
    label?: string,
    error?: string,
    onchange?: (event: { value: string; label: string }) => void
  } = $props();
  
  let isOpen = $state(false);
  let selectElement: HTMLDivElement;
  
  function toggleDropdown() {
    if (!disabled) {
      isOpen = !isOpen;
    }
  }
  
  function selectOption(option: { value: any; label: any; }) {
    value = option.value;
    isOpen = false;
    onchange?.({ value: option.value, label: option.label });
  }
  
  function handleKeydown(event: { key: string; }) {
    if (event.key === 'Escape') {
      isOpen = false;
    }
  }
  
  function handleClickOutside(event: MouseEvent) {
    if (selectElement && event.target instanceof Node && !selectElement.contains(event.target)) {
      isOpen = false;
    }
  }
  
  function getSelectedLabel() {
    const selected = options.find(option => option.value === value);
    return selected ? selected.label : '';
  }

  let selectedLabel = $state(getSelectedLabel());
  
  $effect(() => {
    selectedLabel = getSelectedLabel();
  });
</script>

<svelte:window onclick={handleClickOutside} on:keydown={handleKeydown} />

<div class="relative w-full">
  {#if label}
    <label class="block mb-2 text-sm font-medium text-text-2" for="select">{label}</label>
  {/if}
  
  <div 
    bind:this={selectElement}
    class="relative w-full"
    class:disabled
    class:error
    class:open={isOpen}
  >
    <button
      id="select"
      type="button"
      class="w-full p-2 text-sm border rounded shadow-sm bg-background-1 border-border-main/30 text-text-2 focus:text-text-4 flex items-center justify-between"
      class:placeholder={!selectedLabel}
      onclick={toggleDropdown}
      {disabled}
      aria-haspopup="listbox"
      aria-expanded={isOpen}
    >
      <span class="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left">
        {selectedLabel || placeholder}
      </span>
      <svg 
        class="ml-2 transition-transform duration-200 text-text-2" 
        class:rotate-180={isOpen}
        width="12" 
        height="12" 
        viewBox="0 0 12 12"
      >
        <path d="M2 4l4 4 4-4" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
    
    {#if isOpen}
      <div class="absolute left-0 z-30 flex flex-col w-full pt-1 overflow-y-auto text-sm border rounded top-10 border-border-main/30 bg-background-1 max-h-40">
        <ul class="list-none m-0 p-0" role="listbox">
          {#each options as option}
            <li 
              class="w-full p-2 cursor-pointer hover:bg-background-4 text-text-main"
              class:selected={option.value === value}
              role="option"
              aria-selected={option.value === value}
              onclick={() => selectOption(option)}
              onkeydown={(e) => e.key === 'Enter' && selectOption(option)}
              tabindex="0"
            >
              {option.label}
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  </div>
  
  {#if error}
    <span class="block mt-2 text-sm text-danger">{error}</span>
  {/if}
</div>

<style>
  .placeholder {
    color: rgb(156 163 175); /* gray-400 equivalent */
  }
  
  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .disabled button {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .error button {
    border-color: var(--danger, #ef4444);
  }
  
  .selected {
    background-color: var(--background-4, #f3f4f6);
    font-weight: 500;
  }
</style>