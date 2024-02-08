<script lang="ts">
    const currentTime = Date.now();
    for(let week = 0; week < 7; week++){
        for(let i = 0; i < 7; i++){
            console.log(new Date(currentTime + 86400000 * (i+1) * (week+1)).toDateString());
        };
    };
</script>