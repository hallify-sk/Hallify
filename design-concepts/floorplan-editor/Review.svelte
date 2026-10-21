<script>
  import { onMount, tick } from 'svelte';
  import MapEditor from './baseline/MapEditor.svelte';
  import { setLocale } from '$lib/i18n.svelte';
  import { IconPointer, IconWall, IconPolygon, IconTable, IconArmchair, IconEraser, IconBorderOuter, IconRulerMeasure, IconArrowBackUp, IconArrowForwardUp, IconLayoutSidebarRight, IconHelp, IconChevronRight, IconCheck, IconX, IconLayoutGrid, IconHandStop } from '@tabler/icons-svelte';
  import { fixture, tableTypes } from './fixture.js';
  setLocale('en');
  const concepts = [
    { id:'studio', name:'01 Studio', title:'Everything has a place.', detail:'A labeled tool library, a stable canvas, and properties exactly where you expect them.', best:'Best for everyday venue and event planning', tradeoff:'More permanent controls take space from the canvas.' },
    { id:'guided', name:'02 Guided', title:'One task at a time.', detail:'Move between room setup, arranging furniture, seating guests, and reviewing the plan.', best:'Best for occasional and first-time planners', tradeoff:'Switching tasks adds a click for frequent users.' },
    { id:'canvas', name:'03 Canvas', title:'Make room for the plan.', detail:'A compact dock keeps common actions close. Open the full tool library or inspector when needed.', best:'Best for experienced planners and larger layouts', tradeoff:'Secondary tools are one click deeper.' },
    { id:'current', name:'Current editor', title:'The current implementation.', detail:'The unmodified MapEditor component, using the same sample room as the concepts.', best:'Baseline for comparison', tradeoff:'Includes existing interaction and sizing limitations.' },
  ];
  let concept = $state(new URLSearchParams(location.search).get('concept') || 'studio');
  if (!concepts.some(c => c.id === concept)) concept = 'studio';
  let mode = $state('event');
  let initial = $state(fixture('event'));
  let latest = $state(JSON.stringify(fixture('event')));
  let editorKey = $state(0);
  let host;
  let tool = $state('select');
  let step = $state('arrange');
  let drawer = $state(false);
  let inspector = $state(true);
  let help = $state(false);
  let review = $state(false);
  let templates = $state(false);
  let templateSearch = $state('');
  let selectedTemplate = $state('');
  let confirmReset = $state(false);
  let title = $state('Novák celebration');
  let saved = $state(false);
  let undoDisabled = $state(true);
  let redoDisabled = $state(true);
  let drawing = $state(false);
  let points = $state(0);
  let activeFloor = $state('Main hall');
  let floorMenu = $state(false);
  let floorName = $state('Main hall');
  const tools = [
    {id:'select', native:'Grab', name:'Select & move', desc:'Select an object. Drag to move it.', hint:'Click an object to edit it. Drag to move. Click a chair to assign a guest in event mode.', icon:IconPointer, group:'Navigate'},
    {id:'bounds', native:'Bounds', name:'Room boundary', desc:'Set the usable area of the room.', hint:'Click two opposite corners to define a rectangular room boundary. Outside space is excluded.', icon:IconBorderOuter, group:'Build the room'},
    {id:'wall', native:'Wall painter', name:'Draw wall', desc:'Outline a solid wall or column.', hint:'Click around the wall footprint. Add at least 3 corners, then Finish shape. This draws a filled area.', icon:IconWall, group:'Build the room'},
    {id:'zone', native:'Zone painter', name:'Draw zone', desc:'Mark a stage, dance floor, or area.', hint:'Click around an area, then Finish shape. Give it a name and colour in Properties.', icon:IconPolygon, group:'Arrange'},
    {id:'table', native:'Place table', name:'Place table', desc:'Choose a table, then place it.', hint:'Choose an inventory table in Properties, then click an open space. Red preview means the position is blocked.', icon:IconTable, group:'Arrange'},
    {id:'chair', native:'Add chair', name:'Place chair', desc:'Add an individual, movable seat.', hint:'Click an open space to place a standalone chair. Select it to move it or assign a guest.', icon:IconArmchair, group:'Arrange'},
    {id:'measure', native:'Measure', name:'Measure distance', desc:'Check distance between two points.', hint:'Click a start point, then an end point. The distance is shown in metres. Escape clears it.', icon:IconRulerMeasure, group:'Refine'},
    {id:'eraser', native:'Eraser', name:'Remove objects', desc:'Click an editable object to delete it.', hint:'Click a table, chair, or editable shape to remove it. Locked venue geometry stays protected.', icon:IconEraser, group:'Refine'},
  ];
  const meta = $derived(concepts.find(c=>c.id===concept));
  const locked = $derived(mode==='event'||mode==='template');
  const hiddenTools = $derived(mode==='venue' ? ['table','chair'] : locked ? ['wall','bounds'] : []);
  const available = $derived(tools.filter(t=>!hiddenTools.includes(t.id)));
  const active = $derived(tools.find(t=>t.id===tool) || tools[0]);
  const state = $derived(JSON.parse(latest));
  const counts = $derived.by(()=>{
    const floors=state.floors || [];
    const tables=floors.flatMap(f=>f.tables);
    const chairs=floors.flatMap(f=>f.seats||[]);
    const assignments=[...tables.flatMap(t=>t.assignments),...chairs.map(s=>s.assignment)].filter(Boolean);
    return {tables:tables.length,seats:tables.reduce((n,t)=>n+(t.shape==='round'?t.chairs:t.chairsTop+t.chairsBottom+t.chairsLeft+t.chairsRight),0)+chairs.length,assigned:new Set(assignments).size,guests:state.guests.length};
  });
  function nativeButton(label) { return [...(host?.querySelectorAll('.toolbar .tool-btn')||[])].find(b=>b.textContent.trim()===label); }
  function chooseTool(id) {
    const t=tools.find(t=>t.id===id); nativeButton(t.native)?.click();
    tool=id; review=false; inspector=true; drawer=false;
    if (id!=='select') host?.querySelector('.tabs .tab')?.click();
  }
  function historyAction(action) { nativeButton(action)?.click(); }
  async function chooseStep(id) {
    step=id; review=id==='review'; inspector=true; chooseTool('select'); review=id==='review';
    await tick();
    const tabs=host?.querySelectorAll('.tabs .tab');
    if (id==='guests') tabs?.[1]?.click(); else tabs?.[0]?.click();
  }
  function switchConcept(id) {
    concept=id; drawer=false; review=false; inspector=true;
    const url=new URL(location.href); url.searchParams.set('concept',id); history.replaceState(null,'',url);
    host?.querySelector('.tabs .tab')?.click();
  }
  function resetSample() {
    initial=fixture(mode); latest=JSON.stringify(initial); editorKey++; tool='select'; saved=false; confirmReset=false;
    step=mode==='venue'?'room':'arrange'; review=false;
  }
  function changeMode() { resetSample(); title=mode==='venue'?'Main hall':mode==='template'?'Banquet layout':'Novák celebration'; }
  function saveLocal() { try { localStorage.setItem('hallify-floorplan-concept',latest); saved=true; } catch { saved=false; } }
  function applyTemplate() {
    const next=fixture('event'); next.guests=state.guests;
    for(const f of next.floors) for(const t of f.tables) t.assignments.fill(null);
    if(selectedTemplate==='Open reception') next.floors[0].tables=next.floors[0].tables.slice(0,2);
    initial=next; latest=JSON.stringify(next); editorKey++; templates=false; saved=false;
  }
  function renameFloor() {
    const next=JSON.parse(latest); const f=next.floors.find(f=>f.name===activeFloor); if(f&&floorName.trim())f.name=floorName.trim();
    initial=next; editorKey++; floorMenu=false;
  }
  function focusDialog(node) {
    const previous=document.activeElement;
    node.focus();
    function keydown(e) {
      if(e.key==='Escape'){e.stopPropagation();help=false;templates=false;confirmReset=false;floorMenu=false;}
      if(e.key==='Tab') {
        const items=[...node.querySelectorAll('button:not(:disabled),a,input,select,[tabindex="0"]')];
        const first=items[0],last=items.at(-1);
        if(e.shiftKey&&(document.activeElement===first||document.activeElement===node)){e.preventDefault();last?.focus();}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
      }
    }
    node.addEventListener('keydown',keydown);
    return {destroy(){node.removeEventListener('keydown',keydown);previous?.focus();}};
  }
  onMount(()=>{
    let seenSvg;
    const sync=()=>{
      if(!host)return;
      const svg=host.querySelector('.map-svg');
      if(svg&&svg!==seenSvg&&concept!=='current') {
        seenSvg=svg;
        requestAnimationFrame(()=>{
          const rect=svg.getBoundingClientRect(); const zoom=host.querySelector('#zoom-sl');
          if(zoom){zoom.value=String(Math.max(15,Math.min(48,Math.floor((rect.height-80)/8),Math.floor((rect.width-80)/12))));zoom.dispatchEvent(new Event('input',{bubbles:true}));}
        });
      }
      const button=host.querySelector('.toolbar .tool-btn.active');
      const found=tools.find(t=>t.native===button?.textContent.trim()); if(found)tool=found.id;
      undoDisabled=nativeButton('Undo')?.disabled??true; redoDisabled=nativeButton('Redo')?.disabled??true;
      drawing=!!nativeButton('Close shape');
      const status=host.querySelector('.status-bar')?.textContent||''; points=Number(status.match(/(\d+)\s+pts/)?.[1]||0);
      activeFloor=host.querySelector('.floor-tab.active')?.textContent.trim()||'Main hall';
    };
    const observer=new MutationObserver(sync); observer.observe(host,{subtree:true,childList:true,attributes:true,attributeFilter:['class','disabled'],characterData:true}); sync();
    return ()=>observer.disconnect();
  });
</script>

<svelte:head><title>Hallify · {meta.name} floorplan concept</title></svelte:head>

{#snippet toolButton(t,compact=false)}
  <button class="concept-tool" class:selected={tool===t.id} class:compact aria-pressed={tool===t.id} title={t.desc} onclick={()=>chooseTool(t.id)}>
    <t.icon size={19} stroke={1.7}/><span><strong>{t.name}</strong>{#if !compact}<small>{t.desc}</small>{/if}</span>
  </button>
{/snippet}

<div class="concept-review" class:baseline={concept==='current'} data-concept={concept}>
  <div class="review-nav">
    <a class="review-brand" href="?concept=studio">hallify<span>Design review</span></a>
    <nav aria-label="Compare concepts">{#each concepts as c}<button class:chosen={concept===c.id} aria-pressed={concept===c.id} onclick={()=>switchConcept(c.id)}>{c.name}</button>{/each}</nav>
    <button class="audit-link" onclick={()=>help=true}>Audit · 6/10 <IconChevronRight size={15}/></button>
  </div>
  <div class="concept-intro">
    <div><h1>{meta.title}</h1><p>{meta.detail}</p></div>
    <div class="concept-fit"><strong>{meta.best}</strong><span>{meta.tradeoff}</span></div>
  </div>
  <div class="prototype-label"><span>Interactive concept · sample data · audited editor snapshot</span><span>Try: select Table 01 → change chairs → place a chair → seat a guest</span></div>
  <div class="workspace" class:inspector-closed={!inspector}>
    <div class="document-bar">
      <div class="document-title"><span class="hall-icon"><IconLayoutGrid size={21}/></span><div><strong>{title}</strong><small>Main hall · {mode==='venue'?'Venue floorplan':mode==='template'?'Reusable template':'Event seating plan'}</small></div></div>
      <div class="document-actions">
        <label class="mode-label">Context<select aria-label="Editor context" bind:value={mode} onchange={changeMode}><option value="event">Event seating</option><option value="venue">Venue setup</option><option value="template">Template</option><option value="full">All capabilities</option></select></label>
        {#if mode==='event'}<button class="plain-btn" onclick={()=>templates=true}>Templates</button>{/if}
        <button class="plain-btn" onclick={()=>confirmReset=true}>Reset sample</button>
        <button class="save-btn" onclick={saveLocal}>{#if saved}<IconCheck size={16}/> Saved locally{:else}Save locally{/if}</button>
      </div>
    </div>
    {#if concept!=='current'}
      <div class="action-bar">
        <div class="history-actions"><button aria-label="Undo" title="Undo · ⌘/Ctrl Z" disabled={undoDisabled} onclick={()=>historyAction('Undo')}><IconArrowBackUp size={18}/><span>Undo</span></button><button aria-label="Redo" title="Redo · ⌘/Ctrl Shift Z" disabled={redoDisabled} onclick={()=>historyAction('Redo')}><IconArrowForwardUp size={18}/><span>Redo</span></button></div>
        <div class="room-context">{#if locked}<span class="lock-badge">Room structure locked</span><span>Tables, chairs, and zones remain editable.</span>{:else}<span class="lock-badge">Room structure editable</span><span>Define walls and the usable room boundary.</span>{/if}</div>
        <button class="plain-btn" onclick={()=>{inspector=!inspector;review=false}} aria-pressed={inspector}><IconLayoutSidebarRight size={17}/> Inspector</button>
        <button class="help-button" aria-label="Editor help" onclick={()=>help=true}><IconHelp size={18}/></button>
      </div>
    {/if}
    <div class="editing-area">
      {#if concept==='studio'}
        <aside class="tool-library" aria-label="Tool library"><h2>Tools <span>{available.length}</span></h2>
          {#each ['Navigate','Build the room','Arrange','Refine'] as group}
            {#if available.some(t=>t.group===group)}<div class="tool-group"><h3>{group}</h3>{#each available.filter(t=>t.group===group) as t}{@render toolButton(t)}{/each}</div>{/if}
          {/each}
          <div class="library-note"><IconHandStop size={17}/><span>Pan the canvas with<br/><strong>Alt + drag</strong></span></div>
        </aside>
      {:else if concept==='guided'}
        <aside class="workflow" aria-label="Planning tasks"><h2>Your floorplan</h2><p>Jump between tasks at any time.</p>
          {#each [{id:'room',name:locked?'View the room':'Build the room',desc:locked?'Venue structure is protected':'Boundary, walls, and floors'},{id:'arrange',name:'Arrange the space',desc:'Tables, chairs, and zones'},{id:'guests',name:'Seat your guests',desc:'People, families, and notes'},{id:'review',name:'Review the plan',desc:'Capacity and seating summary'}].filter(s=>s.id!=='guests'||mode==='event') as s,i}
            <button class="workflow-step" class:current={step===s.id} onclick={()=>chooseStep(s.id)} aria-pressed={step===s.id}><span class="step-number">{i+1}</span><span><strong>{s.name}</strong><small>{s.desc}</small></span><IconChevronRight size={15}/></button>
          {/each}
          <div class="task-detail"><h3>{step==='room'?'Start with the space':step==='guests'?'Keep people together':step==='review'?'Before you finish':'Make it work for your event'}</h3><p>{step==='room'?(locked?'The venue owns walls, boundaries, and floors. Use Measure to check your available space.':'Set the boundary first. Then trace walls and columns as filled shapes.'):step==='guests'?'Add names and family groups, then click a chair to seat someone. Auto-seat uses groups and surnames.':step==='review'?'Check seat capacity and unseated guests. Walk through the room visually before saving.':'Choose a table from venue inventory. Place it on the plan, then adjust its chairs in Properties.'}</p></div>
          <button class="plain-btn all-tools" onclick={()=>drawer=!drawer}>Browse every available tool</button>
        </aside>
      {/if}
      <div class="canvas-column">
        {#if concept==='guided'}<div class="task-tools">{#each available.filter(t=>step==='room'?['select','bounds','wall','measure'].includes(t.id):step==='guests'||step==='review'?['select','measure'].includes(t.id):!['wall','bounds'].includes(t.id)) as t}{@render toolButton(t,true)}{/each}</div>{/if}
        {#if concept!=='current'}
          <div class="instruction-strip"><active.icon size={18}/><strong>{active.name}</strong><span>{active.hint}</span>
            {#if drawing}<button disabled={points<3} class="finish-btn" onclick={()=>nativeButton('Close shape')?.click()}>Finish shape</button><button class="plain-btn" onclick={()=>nativeButton('Cancel')?.click()}>Cancel</button>{/if}
          </div>
        {/if}
        <div class="engine-shell" bind:this={host}>
          {#key editorKey}<MapEditor initialState={initial} onchange={json=>{latest=json;saved=false}} tableTypes={mode==='full'?undefined:tableTypes} {hiddenTools} protectWallsZones={locked} allowZones={locked} lockFloors={locked} tablesFromTypesOnly={locked} allowGuests={mode==='event'}/>{/key}
        </div>
        {#if concept==='canvas'}<nav class="canvas-dock" aria-label="Quick tools">{#each available.filter(t=>['select','table','chair','zone','measure'].includes(t.id)) as t}{@render toolButton(t,true)}{/each}<button class="dock-more" class:selected={drawer} onclick={()=>drawer=!drawer}><IconLayoutGrid size={18}/>All tools</button></nav>{/if}
        {#if drawer&&concept!=='current'}<aside class="tool-drawer"><div class="drawer-heading"><h2>All available tools</h2><button aria-label="Close tool library" onclick={()=>drawer=false}><IconX size={18}/></button></div>{#each available as t}{@render toolButton(t)}{/each}</aside>{/if}
        {#if review&&concept==='guided'}<aside class="review-panel"><h2>Review your plan</h2><p>All floors combined</p><dl><div><dt>Tables</dt><dd>{counts.tables}</dd></div><div><dt>Available seats</dt><dd>{counts.seats}</dd></div>{#if mode==='event'}<div><dt>Guests seated</dt><dd>{counts.assigned} / {counts.guests}</dd></div><div><dt>Still to seat</dt><dd>{counts.guests-counts.assigned}</dd></div>{/if}</dl><div class="review-note">{counts.guests>counts.assigned?'Some guests still need a seat. Return to Seat your guests to finish.':'Check paths, entrances, and spacing visually before saving.'}</div><button class="save-btn" onclick={saveLocal}>Save locally</button></aside>{/if}
      </div>
    </div>
    {#if concept!=='current'}<footer class="workspace-footer"><div><strong>{activeFloor}</strong>{#if !locked}<button class="floor-options" onclick={()=>{floorName=activeFloor;floorMenu=true}}>Rename floor</button>{/if}<span>{counts.tables} tables · {counts.seats} seats{#if mode==='event'} · {counts.assigned}/{counts.guests} guests seated{/if}</span></div><span>Sample only · no changes to your venue</span></footer>{/if}
  </div>
</div>

{#if help||templates||confirmReset||floorMenu}
  <div class="review-overlay" role="presentation">
    <div class="review-dialog" role="dialog" aria-modal="true" aria-label={help?'Audit and concept guide':templates?'Choose template':floorMenu?'Rename floor':'Reset sample'} tabindex="-1" use:focusDialog>
      <button class="dialog-close" aria-label="Close dialog" onclick={()=>{help=false;templates=false;confirmReset=false;floorMenu=false}}><IconX size={22}/></button>
      {#if help}
        <span class="dialog-eyebrow">Current editor · expert review</span><h2>6 / 10</h2><p>A capable floorplan engine with an interface that asks users to learn too much by trial and error. This is a heuristic rating, not a usability-study score.</p>
        <div class="audit-grid"><div><strong>8/10</strong><span>Capability</span></div><div><strong>6/10</strong><span>Tool clarity</span></div><div><strong>6/10</strong><span>Workflow</span></div><div><strong>4/10</strong><span>Recovery</span></div><div><strong>4/10</strong><span>Adaptability</span></div></div>
        <h3>What the concepts improve</h3><ul><li>Plain-language tools and persistent instructions.</li><li>Clear ownership of locked room geometry.</li><li>A canvas that fits the available viewport.</li><li>Three different navigation models using the same real editor.</li></ul>
        <h3>Try the same tasks in each</h3><ol><li>Select Table 01 and change its chair distribution.</li><li>Place a standalone chair. Undo and redo the placement.</li><li>Open Guests, then click a chair and assign someone.</li><li>Switch Context to Venue setup and draw a wall.</li></ol>
        <p class="dialog-note">The existing engine's undo gaps, auto-seat limitations, and canvas keyboard access remain in these prototypes. Save stores a browser-only snapshot. Context changes reset the sample. See AUDIT.md for the full inventory, preservation matrix, and implementation requirements.</p>
        <a class="text-link" href="./AUDIT.md" target="_blank">Read the full audit and feature mapping</a>
      {:else if templates}
        <h2>Start from a template</h2><p>Demonstration of the existing template flow. Applying one replaces the sample furniture and clears seat assignments.</p>
        <label>Find a layout<input placeholder="Search templates" bind:value={templateSearch}/></label>
        {#each ['Banquet layout','Open reception'].filter(n=>n.toLowerCase().includes(templateSearch.toLowerCase())) as n}<button class="template-choice" class:selected={selectedTemplate===n} onclick={()=>selectedTemplate=n}><strong>{n}</strong><span>{n==='Banquet layout'?'26 seats · Celebration':'14 seats · Reception'}</span></button>{/each}
        <button class="save-btn" disabled={!selectedTemplate} onclick={applyTemplate}>Apply to sample</button>
      {:else if floorMenu}
        <h2>Rename floor</h2><p>This prototype updates the sample and returns to the first floor.</p><label>Floor name<input bind:value={floorName}/></label><button class="save-btn" disabled={!floorName.trim()} onclick={renameFloor}>Rename floor</button>
      {:else}
        <h2>Reset this sample?</h2><p>Your prototype edits will be replaced with the original sample. Your real venue is unaffected.</p><button class="save-btn" onclick={resetSample}>Reset sample</button>
      {/if}
    </div>
  </div>
{/if}
