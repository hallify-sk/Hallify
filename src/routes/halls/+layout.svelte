<script lang="ts">
  import { page } from '$app/stores';
  import SiteShell from '$lib/site/SiteShell.svelte';
  import VenueSiteMeta from '$lib/marketing/VenueSiteMeta.svelte';
  import type { LayoutData } from './$types';

  interface Props { data: LayoutData; children: import('svelte').Snippet; }
  const { data, children }: Props = $props();
</script>

<VenueSiteMeta orgName={data.domainOrg.name} />

<SiteShell
  org={data.domainOrg}
  templateStyle={data.site.templateStyle}
  template={data.site.template}
  user={data.user}
  unread={data.unreadMessages ?? 0}
  path={$page.url.pathname}
>
  {@render children()}
</SiteShell>
