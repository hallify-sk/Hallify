<script lang="ts">
  import { IconArrowRight, IconArrowLeft, IconSearch, IconChevronDown, IconMapPin, IconCurrentLocation, IconMaximize, IconPlus, IconMinus, IconCheck, IconMail, IconSend, IconMap, IconUsers, IconHandMove, IconLayersIntersect, IconX } from '@tabler/icons-svelte';
  let { name = 'next', size = 17 }: { name?: 'next' | 'back' | 'search' | 'chevron' | 'pin' | 'locate' | 'expand' | 'plus' | 'minus' | 'check' | 'mail' | 'send' | 'map' | 'users' | 'hand' | 'layers' | 'close'; size?: number } = $props();
  const icons = { next:IconArrowRight, back:IconArrowLeft, search:IconSearch, chevron:IconChevronDown, pin:IconMapPin, locate:IconCurrentLocation, expand:IconMaximize, plus:IconPlus, minus:IconMinus, check:IconCheck, mail:IconMail, send:IconSend, map:IconMap, users:IconUsers, hand:IconHandMove, layers:IconLayersIntersect, close:IconX };
  const Component = $derived(icons[name]);
</script>
<span class="ui-icon" aria-hidden="true"><Component {size} stroke={1.75} aria-hidden="true" focusable="false" /></span>
<style>.ui-icon{display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;flex-shrink:0;line-height:0}.ui-icon :global(svg){display:block}</style>
