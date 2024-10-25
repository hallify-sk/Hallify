<script lang="ts">
	import Icon from "$lib/icons/Icon.svelte";
	import Question from "$lib/icons/Question.svelte";
</script>


    <div class="relative">
        <Icon scale="small" isPeer={true}>
            <Question/>
        </Icon>
        <div class="hidden peer-hover:block hover:block bottom-5 left-0 p-2 rounded border border-slate-400/30 bg-slate-100 absolute min-w-60">
            <slot/>
        </div>
    </div>