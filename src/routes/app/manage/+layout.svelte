<script lang="ts">
	import BillingNotice from '$lib/components/BillingNotice.svelte';
	const { data, children } = $props();
</script>

<BillingNotice org={data.currentOrg} />
{@render children()}
