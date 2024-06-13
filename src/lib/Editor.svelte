<script lang="ts">
    import {Stage, Rect, Layer} from "svelte-konva";
    import {stage} from "$lib/editor";
</script>

<Stage config={{
    draggable: true,
    width: $stage.width,
    height: $stage.height
}}>
    <Layer>
        {#each Array(Math.floor($stage.width / 30 / 2)+1) as x, i}
            {#each Array(Math.floor($stage.height / 30 / 2)+1) as y, o}
                <p>{$stage.width - i * $stage.grid.size}</p>
                <Rect config={{
                    x: i * 30,
                    y: o * 30,
                    width: $stage.width - i * $stage.grid.size * 2,
                    height: $stage.width - o * $stage.grid.size * 2,
                    fill: "white",
                    stroke: $stage.grid.color,
                    strokeWidth: 1,
                    draggable: false,
                    opacity: 1
                }} />
            {/each}
        {/each}
    </Layer>
    <Layer>
        <Rect config={{
            x: 0,
            y: 0,
            width: 800,
            height: 800,
            fill: "red",
            draggable: false,
            opacity: 0
        }} />
    </Layer>
</Stage>