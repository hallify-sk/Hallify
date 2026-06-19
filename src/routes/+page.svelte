<script lang="ts">
  import { onMount } from 'svelte';
  import { t, getLocale, chooseLocale } from '$lib/i18n.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  // Locale is driven by the global i18n state (set by the root layout from the
  // server-resolved locale: ?lang > cookie > 'sk'). The SK/EN pill flips + persists it.
  function toggleLocale() {
    chooseLocale(getLocale() === 'sk' ? 'en' : 'sk');
  }

  let loaded = $state(false);
  let navScrolled = $state(false);
  let heroTab = $state<'editor' | 'reservations' | 'messages'>('editor');
  let autoplay = $state(true);

  const tabOrder = ['editor', 'reservations', 'messages'] as const;

  // ─── Editor state ─────────────────────────────────────────────
  let selectedTable = $state(5);

  const tableData: { id: number; x: number; y: number; label: string; seats: number; occupied: number | null }[] = [
    { id: 1, x: 80,  y: 100, label: 'T1', seats: 8, occupied: 8  },
    { id: 2, x: 180, y: 100, label: 'T2', seats: 8, occupied: 7  },
    { id: 3, x: 280, y: 100, label: 'T3', seats: 8, occupied: null },
    { id: 4, x: 80,  y: 185, label: 'T4', seats: 8, occupied: 6  },
    { id: 5, x: 180, y: 185, label: 'T5', seats: 8, occupied: 8  },
    { id: 6, x: 280, y: 185, label: 'T6', seats: 8, occupied: null },
  ];

  const chairOffsets: [number, number][] = [
    [0, -22], [15.5, -15.5], [22, 0], [15.5, 15.5],
    [0, 22], [-15.5, 15.5], [-22, 0], [-15.5, -15.5]
  ];

  const selectedTableData = $derived(tableData.find(t => t.id === selectedTable) ?? tableData[4]);
  const seatedCount = $derived(tableData.filter(t => t.occupied !== null).length);
  const openCount = $derived(tableData.filter(t => t.occupied === null).length);

  // ─── Reservations state ────────────────────────────────────────
  let selectedRes = $state<number | null>(null);

  const reservations = [
    { id: 1, name: 'Smith Wedding',     hall: 'Grand Ballroom', guests: 120, date: 'Jun 14', status: 'Approved', statusKey: 'approved', color: '#22c55e', contact: 'Maria N. · +421 900 123 456' },
    { id: 2, name: 'Johnson Corp Gala', hall: 'Main Hall',      guests: 80,  date: 'Jun 18', status: 'Planning', statusKey: 'planning', color: '#818cf8', contact: 'Alex C. · alex@johnsoncorp.com' },
    { id: 3, name: 'City Awards Night', hall: 'Ballroom B',     guests: 200, date: 'Jun 22', status: 'Pending',  statusKey: 'pending',  color: '#f59e0b', contact: 'City Events · events@city.sk' },
  ];

  // ─── Messages state ────────────────────────────────────────────
  interface Msg { author: string; time: string; text: string; av: string; avColor: string; isYou?: boolean; }

  let messages = $state<Msg[]>([
    { author: 'Maria N.', time: '2h ago',   text: 'Hi, can you confirm the table assignments for the head table?', av: 'M', avColor: '#f59e0b' },
    { author: 'Alex C.',  time: '1h ago',   text: 'Tables 1 to 4 are set. Head table seats 10, confirmed with the client.', av: 'A', avColor: '#3b82f6' },
    { author: 'You',      time: 'Just now', text: 'Perfect. Can you also double-check table 5 capacity?', av: 'Y', avColor: '#4f6ef7', isYou: true },
  ]);

  let replyText = $state('');
  let msgsBodyEl: HTMLElement | null = null;

  // ─── Pricing ───────────────────────────────────────────────────
  const pricingPlans = $derived([
    { ...t.landing.pricing.free,         href: '/app/register',           id: 'free',         featured: false },
    { ...t.landing.pricing.starter,      href: '/app/register',           id: 'starter',      featured: true  },
    { ...t.landing.pricing.professional, href: '/app/register',           id: 'professional', featured: false },
    { ...t.landing.pricing.enterprise,   href: 'mailto:sales@hallify.sk', id: 'enterprise',   featured: false },
  ]);

  function stopAutoplay() { autoplay = false; }
  function selectTab(t: typeof tabOrder[number]) { heroTab = t; stopAutoplay(); }

  function sendReply() {
    const text = replyText.trim();
    if (!text) return;
    messages = [...messages, { author: 'You', time: 'Just now', text, av: 'Y', avColor: '#4f6ef7', isYou: true }];
    replyText = '';
    stopAutoplay();
  }

  $effect(() => {
    if (messages.length > 0 && msgsBodyEl) msgsBodyEl.scrollTop = msgsBodyEl.scrollHeight;
  });

  onMount(() => {
    requestAnimationFrame(() => { loaded = true; });

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Auto-cycle the hero demo through its tabs until the visitor takes over.
    let cycle: ReturnType<typeof setInterval> | undefined;
    if (!reduce) {
      cycle = setInterval(() => {
        if (!autoplay) { if (cycle) clearInterval(cycle); return; }
        const i = tabOrder.indexOf(heroTab);
        heroTab = tabOrder[(i + 1) % tabOrder.length];
      }, 3800);
    }

    // Nav gains a solid background once the hero scrolls away.
    const sentinel = document.getElementById('top-sentinel');
    let navIo: IntersectionObserver | undefined;
    if (sentinel) {
      navIo = new IntersectionObserver(([e]) => { navScrolled = !e.isIntersecting; }, { threshold: 0 });
      navIo.observe(sentinel);
    }

    const io = new IntersectionObserver(
      (entries) => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('in-view'); }),
      { threshold: 0.10, rootMargin: '0px 0px -48px 0px' }
    );
    document.querySelectorAll('.reveal').forEach(el => io.observe(el));

    document.querySelectorAll<HTMLElement>('.spot').forEach(card => {
      card.addEventListener('mousemove', (e: MouseEvent) => {
        const r = card.getBoundingClientRect();
        card.style.setProperty('--mx', `${e.clientX - r.left}px`);
        card.style.setProperty('--my', `${e.clientY - r.top}px`);
      });
    });

    return () => { io.disconnect(); navIo?.disconnect(); if (cycle) clearInterval(cycle); };
  });
</script>

<svelte:head>
  <title>{t.landing.head}</title>
  <meta name="description" content={t.landing.metaDesc} />
  <link rel="canonical" href={getLocale() === 'en' ? data.canonicalEn : data.canonicalSk} />
  <link rel="alternate" hreflang="sk" href={data.canonicalSk} />
  <link rel="alternate" hreflang="en" href={data.canonicalEn} />
  <link rel="alternate" hreflang="x-default" href={data.canonicalSk} />
</svelte:head>

<div class="page" class:loaded>
  <span id="top-sentinel" aria-hidden="true"></span>

  <!-- ─── NAV ───────────────────────────────────────────────── -->
  <header class="nav" class:nav-solid={navScrolled}>
    <div class="nav-inner">
      <a href="/" class="nav-brand">
        <img src="/Hallify.svg" alt="" class="nav-logo" />
        <span class="nav-name">Hallify</span>
      </a>
      <nav class="nav-links">
        <a href="#features">{t.landing.nav.features}</a>
        <a href="#white-label">{t.landing.nav.whiteLabel}</a>
        <a href="#pricing">{t.landing.nav.pricing}</a>
      </nav>
      <div class="nav-actions">
        <button class="lang-toggle" onclick={toggleLocale} type="button" aria-label="Switch language">
          <span class:active-lang={getLocale() === 'sk'}>SK</span>
          <span class="lang-sep">/</span>
          <span class:active-lang={getLocale() === 'en'}>EN</span>
        </button>
        <a href="/app/login" class="nav-signin">{t.landing.nav.signIn}</a>
        <a href="/app/register" class="btn-primary btn-sm">{t.landing.nav.getStarted}</a>
      </div>
    </div>
  </header>

  <!-- ─── HERO ──────────────────────────────────────────────── -->
  <section class="hero">
    <div class="hero-bg" aria-hidden="true">
      <div class="grid-layer"></div>
      <div class="orb orb-1"></div>
      <div class="orb orb-2"></div>
      <div class="orb orb-3"></div>
    </div>

    <div class="hero-inner">
      <div class="hero-text">
        <h1 class="hero-h1">
          <span>{t.landing.hero.line1}</span>
          <span><em class="accent-word">{t.landing.hero.accent}</em> {t.landing.hero.line2}</span>
        </h1>
        <p class="hero-sub">{t.landing.hero.sub}</p>
        <div class="hero-cta">
          <a href="/app/register" class="btn-primary">{t.landing.hero.cta}</a>
          <a href="/app/login" class="btn-ghost">{t.landing.nav.signIn}</a>
        </div>
        <p class="hero-note">{t.landing.hero.note}</p>
      </div>

      <!-- ─── Interactive product demo ─── -->
      <div
        class="hero-demo"
        role="presentation"
        onmouseenter={stopAutoplay}
      >
        <div class="hero-card">
          <!-- Window chrome -->
          <div class="card-chrome">
            <div class="chrome-dots"><span></span><span></span><span></span></div>
            <span class="chrome-title">
              {heroTab === 'editor'
                ? `Grand Ballroom · Table ${selectedTable}`
                : heroTab === 'reservations'
                ? 'Reservations · 3 active'
                : 'Messages · Smith Wedding'}
            </span>
            <div class="chrome-actions">
              <div class="chrome-live">
                <span class="chrome-live-dot"></span>
                <span>live</span>
              </div>
              <div class="chrome-avatars">
                <span class="chrome-avatar" style="background:#f59e0b" title="Alex"></span>
                <span class="chrome-avatar" style="background:#22c55e" title="Maria"></span>
              </div>
            </div>
          </div>

          <!-- Tab bar -->
          <div class="card-tabs">
            <button class="card-tab" class:tab-active={heroTab === 'editor'} onclick={() => selectTab('editor')} type="button">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
              Editor
            </button>
            <button class="card-tab" class:tab-active={heroTab === 'reservations'} onclick={() => selectTab('reservations')} type="button">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              Reservations
            </button>
            <button class="card-tab" class:tab-active={heroTab === 'messages'} onclick={() => selectTab('messages')} type="button">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              Messages
              <span class="tab-unread">3</span>
            </button>
            <span class="card-autoplay" class:on={autoplay} aria-hidden="true">
              {autoplay ? 'tour' : 'you'}
            </span>
          </div>

          {#if heroTab === 'editor'}
          <div class="card-body">
            <!-- Left panel: table list -->
            <div class="card-panel">
              <div class="panel-header">
                <span class="panel-title">Tables</span>
                <span class="panel-count">{tableData.length}</span>
              </div>
              <div class="panel-rows">
                {#each tableData as t}
                  <div
                    class="panel-row"
                    class:panel-row-selected={t.id === selectedTable}
                    onclick={() => { selectedTable = t.id; stopAutoplay(); }}
                    role="button"
                    tabindex="0"
                    onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { selectedTable = t.id; stopAutoplay(); } }}
                  >
                    <span class="row-dot"
                      class:occupied={t.occupied !== null && t.id !== selectedTable}
                      class:open={t.occupied === null && t.id !== selectedTable}
                      class:selected={t.id === selectedTable}
                    ></span>
                    <span class="row-name">Table {t.id}</span>
                    {#if t.occupied !== null}
                      <span class="row-seats">{t.occupied}<span class="row-cap">/{t.seats}</span></span>
                    {:else}
                      <span class="row-seats row-open">Open</span>
                    {/if}
                  </div>
                {/each}
              </div>
              <div class="panel-footer">
                <span class="pf-stat"><span class="pf-num">{seatedCount}</span> seated</span>
                <span class="pf-sep">·</span>
                <span class="pf-stat"><span class="pf-num">{openCount}</span> open</span>
              </div>
            </div>

            <!-- Right: floor plan canvas -->
            <div class="card-canvas">
              <svg class="fp-svg" viewBox="0 0 360 260" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <defs>
                  <pattern id="fpm" width="36" height="36" patternUnits="userSpaceOnUse">
                    <path d="M36 0L0 0 0 36" fill="none" stroke="rgba(0,0,0,0.045)" stroke-width="0.5"/>
                  </pattern>
                  <pattern id="fpM" width="180" height="180" patternUnits="userSpaceOnUse">
                    <path d="M180 0L0 0 0 180" fill="none" stroke="rgba(0,0,0,0.10)" stroke-width="1"/>
                  </pattern>
                </defs>
                <rect width="360" height="260" fill="#f8f9fc"/>
                <rect width="360" height="260" fill="url(#fpm)"/>
                <rect width="360" height="260" fill="url(#fpM)"/>

                <!-- Stage -->
                <rect x="54" y="10" width="252" height="32" rx="4" fill="#e2e8f0" stroke="#cbd5e1" stroke-width="1"/>
                <text x="180" y="29" text-anchor="middle" dominant-baseline="middle" fill="#64748b" font-family="system-ui,sans-serif" font-size="9" font-weight="600" letter-spacing="2">STAGE</text>

                {#each tableData as t}
                  {@const sel = t.id === selectedTable}
                  <g transform="translate({t.x},{t.y})" onclick={() => { selectedTable = t.id; stopAutoplay(); }} style="cursor:pointer">
                    {#if sel}
                      <rect x="-28" y="-28" width="56" height="56" rx="5"
                        fill="rgba(79,110,247,0.06)" stroke="rgba(79,110,247,0.45)"
                        stroke-width="1" stroke-dasharray="4 3" class="sel-ring"/>
                    {/if}
                    {#each chairOffsets as [cx, cy]}
                      <circle
                        cx={cx} cy={cy} r="3"
                        fill={sel ? 'rgba(79,110,247,0.55)' : '#94a3b8'}
                        stroke={sel ? 'rgba(79,110,247,0.8)' : 'none'}
                        stroke-width={sel ? 0.5 : 0}
                      />
                    {/each}
                    <circle cx="0" cy="0" r="14"
                      fill={sel ? 'rgba(79,110,247,0.15)' : '#e2e8f0'}
                      stroke={sel ? 'rgba(79,110,247,0.7)' : '#94a3b8'}
                      stroke-width={sel ? 1.5 : 1}
                      class={sel ? 'sel-table' : ''}
                    />
                    <text x="0" y="1" text-anchor="middle" dominant-baseline="middle"
                      fill={sel ? '#4f6ef7' : '#475569'}
                      font-family="system-ui,sans-serif" font-size="7" font-weight="700">
                      {t.label}
                    </text>
                  </g>
                {/each}

                <!-- Banquet -->
                <g transform="translate(180,237)">
                  <circle cx="-72" cy="-16" r="3" fill="#94a3b8"/>
                  <circle cx="-36" cy="-16" r="3" fill="#94a3b8"/>
                  <circle cx="0"   cy="-16" r="3" fill="#94a3b8"/>
                  <circle cx="36"  cy="-16" r="3" fill="#94a3b8"/>
                  <circle cx="72"  cy="-16" r="3" fill="#94a3b8"/>
                  <circle cx="-72" cy="16" r="3" fill="#94a3b8"/>
                  <circle cx="-36" cy="16" r="3" fill="#94a3b8"/>
                  <circle cx="0"   cy="16" r="3" fill="#94a3b8"/>
                  <circle cx="36"  cy="16" r="3" fill="#94a3b8"/>
                  <circle cx="72"  cy="16" r="3" fill="#94a3b8"/>
                  <rect x="-88" y="-10" width="176" height="20" rx="4" fill="#e2e8f0" stroke="#94a3b8" stroke-width="1"/>
                  <text x="0" y="1" text-anchor="middle" dominant-baseline="middle" fill="#475569" font-family="system-ui,sans-serif" font-size="7" font-weight="600">Banquet</text>
                </g>
              </svg>

              <div class="canvas-label">
                <div class="label-dot"></div>
                <span>Table {selectedTable} · {selectedTableData.seats} seats</span>
              </div>
            </div>
          </div>
          {/if}

          {#if heroTab === 'reservations'}
          <div class="tab-panel tab-res">
            <div class="res-toolbar">
              <span class="res-toolbar-title">Upcoming reservations</span>
              <span class="res-chip">3 active</span>
            </div>
            <div class="res-list">
              {#each reservations as r}
                <div
                  class="res-row"
                  class:res-row-active={r.id === selectedRes}
                  onclick={() => { selectedRes = selectedRes === r.id ? null : r.id; stopAutoplay(); }}
                >
                  <span class="res-dot" style="background:{r.color}"></span>
                  <div class="res-info">
                    <span class="res-name">{r.name}</span>
                    <span class="res-meta">{r.hall} · {r.guests} guests</span>
                  </div>
                  <span class="res-date">{r.date}</span>
                  <span class="res-status"
                    class:res-approved={r.statusKey === 'approved'}
                    class:res-planning={r.statusKey === 'planning'}
                    class:res-pending={r.statusKey === 'pending'}
                  >{r.status}</span>
                </div>
                {#if selectedRes === r.id}
                  <div class="res-detail">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;opacity:.4"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    <span class="res-detail-contact">{r.contact}</span>
                    <button class="res-detail-btn" type="button">View event →</button>
                  </div>
                {/if}
              {/each}
            </div>
          </div>
          {/if}

          {#if heroTab === 'messages'}
          <div class="tab-panel tab-msgs">
            <div class="msgs-header">
              <span class="msgs-title">Smith Wedding</span>
              <span class="msgs-sub">3 unread</span>
            </div>
            <div class="msgs-body" bind:this={msgsBodyEl}>
              {#each messages as msg}
                <div class="msg-item" class:msg-item-you={msg.isYou}>
                  <div class="msg-av" style="background:{msg.avColor}">{msg.av}</div>
                  <div class="msg-content">
                    <div class="msg-meta">
                      <span class="msg-author">{msg.author}</span>
                      <span class="msg-time">{msg.time}</span>
                    </div>
                    <p class="msg-text">{msg.text}</p>
                  </div>
                </div>
              {/each}
            </div>
            <div class="msgs-compose">
              <input
                class="msgs-input"
                type="text"
                placeholder="Reply to thread…"
                bind:value={replyText}
                onkeydown={(e: KeyboardEvent) => { if (e.key === 'Enter') sendReply(); }}
              />
              <button class="msgs-send" type="button" onclick={sendReply} aria-label="Send reply">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </button>
            </div>
          </div>
          {/if}
        </div>
      </div>
    </div>
  </section>


  <!-- ─── FEATURES (bento) ────────────────────────────────────── -->
  <section class="section" id="features">
    <div class="section-inner">
      <div class="section-header reveal">
        <h2>{t.landing.features.heading}</h2>
        <p>{t.landing.features.sub}</p>
      </div>

      <div class="bento">
        <!-- Floor plan: wide visual cell -->
        <article class="bento-cell spot cell-floor reveal" data-delay="0">
          <div class="cell-text">
            <div class="cell-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
            </div>
            <h3>{t.landing.features.floorPlan.title}</h3>
            <p>{t.landing.features.floorPlan.desc}</p>
          </div>
          <div class="cell-visual cell-visual-floor" aria-hidden="true">
            <svg viewBox="0 0 240 150" preserveAspectRatio="xMidYMid slice">
              <rect width="240" height="150" fill="#0e1422"/>
              <g opacity="0.5">
                {#each [40, 80, 120, 160, 200] as gx}<line x1={gx} y1="0" x2={gx} y2="150" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>{/each}
                {#each [38, 76, 114] as gy}<line x1="0" y1={gy} x2="240" y2={gy} stroke="rgba(255,255,255,0.05)" stroke-width="1"/>{/each}
              </g>
              <rect x="70" y="14" width="100" height="14" rx="3" fill="rgba(255,255,255,0.08)"/>
              {#each [[60,72],[120,72],[180,72],[60,118],[120,118],[180,118]] as [cx, cy], i}
                <g transform="translate({cx},{cy})">
                  {#each chairOffsets as [ox, oy]}<circle cx={ox * 0.5} cy={oy * 0.5} r="1.6" fill="rgba(129,140,248,0.45)"/>{/each}
                  <circle r="9" fill={i === 4 ? 'rgba(79,110,247,0.3)' : 'rgba(255,255,255,0.07)'} stroke={i === 4 ? '#818cf8' : 'rgba(255,255,255,0.15)'} stroke-width="1"/>
                </g>
              {/each}
            </svg>
          </div>
        </article>

        <!-- Guest seating: tall visual cell -->
        <article class="bento-cell spot cell-rsvp reveal" data-delay="1">
          <div class="cell-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="5" cy="7" r="2"/><circle cx="12" cy="7" r="2"/><circle cx="19" cy="7" r="2"/><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/><circle cx="5" cy="17" r="2"/><circle cx="12" cy="17" r="2"/><circle cx="19" cy="17" r="2"/></svg>
          </div>
          <h3>{t.landing.features.rsvp.title}</h3>
          <p>{t.landing.features.rsvp.desc}</p>
          <div class="cell-visual cell-visual-seat" aria-hidden="true">
            <div class="seat-preview">
              <div class="seat-preview-hdr">
                <span class="seat-preview-label">Table T2</span>
                <span class="seat-preview-count">6 / 8 assigned</span>
              </div>
              <div class="seat-grid">
                <span class="sdot sdot-filled">A</span>
                <span class="sdot sdot-filled">M</span>
                <span class="sdot sdot-filled">J</span>
                <span class="sdot sdot-filled">K</span>
                <span class="sdot sdot-empty"></span>
                <span class="sdot sdot-filled">R</span>
                <span class="sdot sdot-filled">C</span>
                <span class="sdot sdot-empty"></span>
              </div>
              <div class="seat-preview-legend">
                <span class="seat-legend-dot filled"></span><span>Assigned</span>
                <span class="seat-legend-dot"></span><span>Open</span>
              </div>
            </div>
          </div>
        </article>

        <!-- Reservations -->
        <article class="bento-cell spot reveal" data-delay="0">
          <div class="cell-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          </div>
          <h3>{t.landing.features.reservations.title}</h3>
          <p>{t.landing.features.reservations.desc}</p>
        </article>

        <!-- Messaging -->
        <article class="bento-cell spot reveal" data-delay="1">
          <div class="cell-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          </div>
          <h3>{t.landing.features.messaging.title}</h3>
          <p>{t.landing.features.messaging.desc}</p>
        </article>

        <!-- Branding: wide visual cell -->
        <article class="bento-cell spot cell-brand reveal" data-delay="0">
          <div class="cell-text">
            <div class="cell-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="13.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="10.5" r="2.5"/><circle cx="8.5" cy="7.5" r="2.5"/><circle cx="6.5" cy="12.5" r="2.5"/><path d="M12 2a10 10 0 0 0 0 20 2.5 2.5 0 0 0 2-4 2.5 2.5 0 0 1 2-4h2a4 4 0 0 0 4-4 10 10 0 0 0-10-8z"/></svg>
            </div>
            <h3>{t.landing.features.whiteLabel.title}</h3>
            <p>{t.landing.features.whiteLabel.desc}</p>
          </div>
          <div class="cell-visual cell-visual-brand" aria-hidden="true">
            <div class="brand-mini">
              <div class="brand-mini-bar">
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                <span>riverside.hallify.sk</span>
              </div>
              <div class="brand-mini-header">
                <span class="brand-mini-logo"></span>
                <span class="brand-mini-name">Riverside Venue</span>
              </div>
              <div class="brand-mini-accent"></div>
              <div class="brand-mini-body">
                <span class="brand-mini-line"></span>
                <span class="brand-mini-line short"></span>
              </div>
            </div>
          </div>
        </article>

        <!-- Plans -->
        <article class="bento-cell spot reveal" data-delay="1">
          <div class="cell-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
          </div>
          <h3>{t.landing.features.plans.title}</h3>
          <p>{t.landing.features.plans.desc}</p>
        </article>
      </div>
    </div>
  </section>

  <!-- ─── WHITE-LABEL / MULTI-TENANT ──────────────────────────── -->
  <section class="section wl-section" id="white-label">
    <div class="section-inner wl-grid">
      <div class="wl-text reveal">
        <h2>{t.landing.wl.heading}</h2>
        <p class="wl-lead">{t.landing.wl.lead}</p>
        <ul class="wl-list">
          {#each t.landing.wl.items as item}
            <li>
              <span class="wl-check"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg></span>
              <div><strong>{item.title}</strong> {item.desc}</div>
            </li>
          {/each}
        </ul>
      </div>

      <div class="wl-visual reveal" data-delay="1" aria-hidden="true">
        <div class="browser">
          <div class="browser-bar">
            <span class="browser-dots"><span></span><span></span><span></span></span>
            <span class="browser-url">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              bookings.yourvenue.com
            </span>
          </div>
          <div class="browser-page">
            <div class="bp-header">
              <span class="bp-logo">YV</span>
              <span class="bp-name">Your Venue</span>
              <span class="bp-cta">Book now</span>
            </div>
            <div class="bp-hero">
              <span class="bp-hero-title">The Riverside Ballroom</span>
              <span class="bp-hero-sub">Up to 220 guests · Available this autumn</span>
            </div>
            <div class="bp-cards">
              <div class="bp-hall-card">
                <div class="bp-hc-accent" style="background:#4f6ef7"></div>
                <div class="bp-hc-body">
                  <span class="bp-hc-name">Riverside Suite</span>
                  <span class="bp-hc-cap">80 guests</span>
                  <span class="bp-hc-avail avail-open">Available</span>
                </div>
              </div>
              <div class="bp-hall-card active">
                <div class="bp-hc-accent" style="background:#4f6ef7"></div>
                <div class="bp-hc-body">
                  <span class="bp-hc-name">Grand Ballroom</span>
                  <span class="bp-hc-cap">220 guests</span>
                  <span class="bp-hc-avail avail-sel">Selected</span>
                </div>
              </div>
              <div class="bp-hall-card">
                <div class="bp-hc-accent" style="background:#94a3b8"></div>
                <div class="bp-hc-body">
                  <span class="bp-hc-name">Garden Terrace</span>
                  <span class="bp-hc-cap">50 guests</span>
                  <span class="bp-hc-avail avail-book">Booked</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="wl-badge">
          <span class="wl-badge-dot"></span>
          {t.landing.wl.badge}
        </div>
      </div>
    </div>
  </section>

  <!-- ─── HOW IT WORKS ──────────────────────────────────────────── -->
  <section class="section how-section">
    <div class="section-inner">
      <div class="section-header reveal">
        <h2>{t.landing.how.heading}</h2>
        <p>{t.landing.how.sub}</p>
      </div>

      <div class="steps">
        <div class="step reveal" data-delay="0">
          <div class="step-marker">
            <span class="step-badge">01</span>
          </div>
          <div class="step-icon-wrap" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          </div>
          <div class="step-content">
            <h3>{t.landing.how.steps[0].title}</h3>
            <p>{t.landing.how.steps[0].desc}</p>
          </div>
        </div>
        <div class="step reveal" data-delay="1">
          <div class="step-marker">
            <span class="step-badge">02</span>
          </div>
          <div class="step-icon-wrap" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="12" y1="14" x2="12" y2="18"/><line x1="10" y1="16" x2="14" y2="16"/></svg>
          </div>
          <div class="step-content">
            <h3>{t.landing.how.steps[1].title}</h3>
            <p>{t.landing.how.steps[1].desc}</p>
          </div>
        </div>
        <div class="step reveal" data-delay="2">
          <div class="step-marker">
            <span class="step-badge">03</span>
          </div>
          <div class="step-icon-wrap" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          </div>
          <div class="step-content">
            <h3>{t.landing.how.steps[2].title}</h3>
            <p>{t.landing.how.steps[2].desc}</p>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- ─── PRICING ───────────────────────────────────────────────── -->
  <section class="section pricing-section" id="pricing">
    <div class="section-inner">
      <div class="section-header reveal">
        <h2>{t.landing.pricing.heading}</h2>
        <p>{t.landing.pricing.sub}</p>
      </div>

      <div class="pricing-grid">
        {#each pricingPlans as p}
          <div class="price-card spot reveal" class:price-featured={p.featured}>
            {#if p.featured}<span class="price-badge">{t.landing.pricing.mostPopular}</span>{/if}
            <span class="price-name">{p.name}</span>
            <div class="price-amount">
              <span class="price-value">{p.price}</span>
              {#if p.cadence}<span class="price-cadence">{p.cadence}</span>{/if}
            </div>
            <p class="price-blurb">{p.blurb}</p>
            <a href={p.href} class={p.featured ? 'btn-primary price-cta' : 'btn-ghost price-cta'}>{p.cta}</a>
            <ul class="price-features">
              {#each p.features as f}
                <li>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  {f}
                </li>
              {/each}
            </ul>
          </div>
        {/each}
      </div>
    </div>
  </section>

  <!-- ─── PROOF BAND ────────────────────────────────────────────── -->
  <section class="proof-section reveal">
    <div class="proof-inner">
      {#each t.landing.proof as item, i}
        {#if i > 0}<div class="proof-divider"></div>{/if}
        <div class="proof-item">
          <span class="proof-num">{item.num}</span>
          <span class="proof-label">{item.label}</span>
        </div>
      {/each}
    </div>
  </section>

  <!-- ─── FINAL CTA ─────────────────────────────────────────────── -->
  <section class="cta-section">
    <div class="cta-bg" aria-hidden="true">
      <div class="orb orb-cta-1"></div>
      <div class="orb orb-cta-2"></div>
      <div class="grid-layer"></div>
    </div>
    <div class="cta-inner reveal">
      <h2>{t.landing.cta.heading}</h2>
      <p>{t.landing.cta.sub}</p>
      <div class="cta-actions">
        <a href="/app/register" class="btn-primary btn-large">{t.landing.cta.getStarted}</a>
        <a href="/app/login" class="btn-ghost btn-large">{t.landing.cta.signIn}</a>
      </div>
    </div>
  </section>

  <!-- ─── FOOTER ─────────────────────────────────────────────────── -->
  <footer class="footer">
    <div class="footer-inner">
      <div class="footer-col footer-brand-col">
        <a href="/" class="footer-brand">
          <img src="/Hallify.svg" alt="" class="footer-logo" />
          <span class="footer-name">Hallify</span>
        </a>
        <p class="footer-tag">{t.landing.footer.tagline}</p>
      </div>
      <div class="footer-col">
        <span class="footer-heading">{t.landing.footer.product}</span>
        <a href="#features">{t.landing.nav.features}</a>
        <a href="#white-label">{t.landing.nav.whiteLabel}</a>
        <a href="#pricing">{t.landing.nav.pricing}</a>
      </div>
      <div class="footer-col">
        <span class="footer-heading">{t.landing.footer.account}</span>
        <a href="/app/register">{t.landing.nav.getStarted}</a>
        <a href="/app/login">{t.landing.nav.signIn}</a>
      </div>
    </div>
    <div class="footer-bottom">
      <p class="footer-copy">{t.landing.footer.copyright}</p>
    </div>
  </footer>
</div>

<style>
  :global(html) {
    scroll-behavior: smooth;
    scroll-padding-top: 72px;
  }

  /* ─── Tokens / base ──────────────────────────────────────── */
  .page {
    --bg:        #0b0e15;
    --bg-2:      #0a0d13;
    --panel:     #111726;
    --border:    rgba(255,255,255,.08);
    --border-2:  rgba(255,255,255,.06);
    --accent:    #4f6ef7;
    --accent-2:  #818cf8;
    --txt:       rgba(255,255,255,.94);
    --txt-muted: rgba(255,255,255,.56);
    --txt-faint: rgba(255,255,255,.4);

    background: var(--bg);
    color: var(--txt);
    min-height: 100vh;
    font-family: system-ui, -apple-system, sans-serif;
    overflow-x: hidden;
  }

  #top-sentinel { position: absolute; top: 0; height: 1px; width: 1px; }

  /* ─── Nav ────────────────────────────────────────────────── */
  .nav {
    position: sticky;
    top: 0;
    z-index: 50;
    transition: background .25s ease, border-color .25s ease, backdrop-filter .25s ease;
    border-bottom: 1px solid transparent;
  }
  .nav-solid {
    background: rgba(11,14,21,.78);
    backdrop-filter: blur(14px) saturate(160%);
    -webkit-backdrop-filter: blur(14px) saturate(160%);
    border-bottom-color: var(--border-2);
  }
  .nav-inner {
    max-width: 1200px;
    margin: 0 auto;
    height: 64px;
    padding: 0 32px;
    display: flex;
    align-items: center;
    gap: 32px;
  }
  .nav-brand { display: inline-flex; align-items: center; gap: 9px; text-decoration: none; }
  .nav-logo {
    width: 24px; height: 24px;
    filter: brightness(0) invert(0.7) sepia(1) hue-rotate(200deg) saturate(2);
  }
  .nav-name {
    font-family: 'Poppins', sans-serif;
    font-weight: 900; font-style: italic; font-size: 18px;
    color: var(--txt); letter-spacing: -0.01em;
  }
  .nav-links {
    display: flex;
    gap: 28px;
    margin-left: 12px;
    margin-right: auto;
  }
  .nav-links a {
    font-size: 14px; font-weight: 500;
    color: var(--txt-muted);
    text-decoration: none;
    transition: color .15s;
  }
  .nav-links a:hover { color: var(--txt); }
  .nav-actions { display: flex; align-items: center; gap: 16px; }
  .nav-signin {
    font-size: 14px; font-weight: 500;
    color: var(--txt-muted); text-decoration: none;
    transition: color .15s;
  }
  .nav-signin:hover { color: var(--txt); }

  /* ─── Buttons ────────────────────────────────────────────── */
  .btn-primary {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 12px 22px;
    border-radius: 10px;
    background: var(--accent);
    color: #fff;
    font-size: 14px; font-weight: 600;
    text-decoration: none;
    white-space: nowrap;
    transition: background .15s, transform .15s, box-shadow .15s;
    box-shadow: 0 4px 20px rgba(79,110,247,.32);
  }
  .btn-primary:hover { background: #3d5ce8; transform: translateY(-1px); box-shadow: 0 6px 28px rgba(79,110,247,.45); }
  .btn-primary:active { transform: translateY(0) scale(.99); }

  .btn-ghost {
    display: inline-flex; align-items: center; justify-content: center;
    padding: 12px 22px;
    border-radius: 10px;
    border: 1px solid rgba(255,255,255,.15);
    color: rgba(255,255,255,.78);
    font-size: 14px; font-weight: 500;
    text-decoration: none;
    white-space: nowrap;
    transition: border-color .15s, color .15s, background .15s;
  }
  .btn-ghost:hover { border-color: rgba(255,255,255,.35); color: #fff; background: rgba(255,255,255,.05); }

  .btn-sm { padding: 9px 16px; font-size: 13px; }
  .btn-large { padding: 15px 32px; font-size: 16px; }

  /* ─── Shared section ─────────────────────────────────────── */
  .section { padding: 110px 0; }
  .section-inner { max-width: 1200px; margin: 0 auto; padding: 0 32px; }
  .section-header { max-width: 600px; margin: 0 auto 60px; text-align: center; }
  .section-header h2 {
    font-size: clamp(28px, 4vw, 42px);
    font-weight: 700; letter-spacing: -0.025em;
    margin: 0 0 14px; color: #fff;
  }
  .section-header p {
    font-size: 16px; color: var(--txt-muted);
    line-height: 1.6; margin: 0;
  }

  /* ─── Scroll reveal ──────────────────────────────────────── */
  :global(.reveal) {
    opacity: 0; transform: translateY(28px);
    transition: opacity .7s ease, transform .7s ease;
  }
  :global(.reveal.in-view) { opacity: 1; transform: none; }
  :global(.reveal[data-delay="1"]) { transition-delay: .1s; }
  :global(.reveal[data-delay="2"]) { transition-delay: .2s; }
  :global(.reveal[data-delay="3"]) { transition-delay: .3s; }

  /* ─── Spotlight cards (shared) ───────────────────────────── */
  .spot {
    --mx: 50%; --my: 50%;
    position: relative;
    overflow: hidden;
    transition: transform .25s, box-shadow .25s, border-color .25s;
  }
  .spot::before {
    content: ''; position: absolute; inset: 0; border-radius: inherit;
    background: radial-gradient(280px circle at var(--mx) var(--my), rgba(99,102,241,.11) 0%, transparent 65%);
    opacity: 0; transition: opacity .35s; pointer-events: none;
  }
  .spot::after {
    content: ''; position: absolute; inset: 0; border-radius: inherit; padding: 1px;
    background: radial-gradient(180px circle at var(--mx) var(--my), rgba(99,102,241,.7) 0%, transparent 65%);
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor; mask-composite: exclude;
    opacity: 0; transition: opacity .35s; pointer-events: none;
  }
  .spot:hover { transform: translateY(-2px); box-shadow: 0 16px 48px rgba(0,0,0,.35); }
  .spot:hover::before { opacity: 1; }
  .spot:hover::after { opacity: 1; }

  /* ─── HERO ───────────────────────────────────────────────── */
  .hero { position: relative; overflow: hidden; }
  .hero-bg { position: absolute; inset: 0; pointer-events: none; }
  .grid-layer {
    position: absolute; inset: 0;
    background-image:
      linear-gradient(rgba(255,255,255,.06) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,.06) 1px, transparent 1px),
      linear-gradient(rgba(255,255,255,.025) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,.025) 1px, transparent 1px);
    background-size: 180px 180px, 180px 180px, 36px 36px, 36px 36px;
    mask-image: radial-gradient(ellipse 90% 70% at 50% 30%, #000 40%, transparent 100%);
    -webkit-mask-image: radial-gradient(ellipse 90% 70% at 50% 30%, #000 40%, transparent 100%);
  }
  .orb { position: absolute; border-radius: 50%; filter: blur(1px); pointer-events: none; }
  .orb-1 {
    width: 680px; height: 680px;
    background: radial-gradient(circle, rgba(79,110,247,.2) 0%, transparent 65%);
    top: -240px; right: -160px;
    animation: orbDrift 11s ease-in-out infinite;
  }
  .orb-2 {
    width: 500px; height: 500px;
    background: radial-gradient(circle, rgba(139,92,246,.13) 0%, transparent 65%);
    top: 120px; left: -160px;
    animation: orbDrift 14s ease-in-out 2s infinite reverse;
  }
  .orb-3 {
    width: 340px; height: 340px;
    background: radial-gradient(circle, rgba(20,184,166,.07) 0%, transparent 65%);
    top: 50%; left: 44%;
    animation: orbDrift 9s ease-in-out 5s infinite;
  }
  @keyframes orbDrift {
    0%,100% { transform: translate(0,0); }
    33% { transform: translate(24px,-18px); }
    66% { transform: translate(-12px,20px); }
  }

  .hero-inner {
    position: relative; z-index: 1;
    max-width: 1200px; margin: 0 auto;
    padding: 84px 32px 96px;
    display: grid;
    grid-template-columns: minmax(0, 0.86fr) minmax(0, 1.14fr);
    align-items: center;
    gap: 56px;
  }

  .hero-text { max-width: 520px; }
  .hero-h1 {
    font-size: clamp(40px, 5vw, 62px);
    font-weight: 800; line-height: 1.04; letter-spacing: -0.035em;
    color: #fff; margin: 0 0 22px;
    display: flex; flex-direction: column;
  }
  .hero-h1 span {
    display: block;
    opacity: 0; transform: translateY(24px);
    transition: opacity .7s ease, transform .7s ease;
  }
  .hero-h1 span:nth-child(1) { transition-delay: .08s; }
  .hero-h1 span:nth-child(2) { transition-delay: .18s; }
  .loaded .hero-h1 span { opacity: 1; transform: none; }
  .accent-word {
    font-style: italic;
    color: var(--accent-2);
    padding-bottom: 1px;
  }

  .hero-sub {
    font-size: 18px; line-height: 1.65; color: var(--txt-muted);
    margin: 0 0 32px; max-width: 460px;
    opacity: 0; transform: translateY(16px);
    transition: opacity .7s .42s ease, transform .7s .42s ease;
  }
  .loaded .hero-sub { opacity: 1; transform: none; }

  .hero-cta {
    display: flex; gap: 12px; align-items: center; flex-wrap: wrap;
    opacity: 0; transform: translateY(16px);
    transition: opacity .7s .54s ease, transform .7s .54s ease;
  }
  .loaded .hero-cta { opacity: 1; transform: none; }

  .hero-note {
    font-size: 13px; color: var(--txt-faint); margin: 16px 0 0;
    opacity: 0; transition: opacity .6s .72s ease;
  }
  .loaded .hero-note { opacity: 1; }

  /* ─── Hero demo card ─────────────────────────────────────── */
  .hero-demo {
    opacity: 0; transform: translateY(22px) scale(.99);
    transition: opacity .9s .3s ease, transform .9s .3s ease;
  }
  .loaded .hero-demo { opacity: 1; transform: none; }

  .hero-card {
    height: 470px;
    display: flex; flex-direction: column; min-height: 0;
    border-radius: 14px; overflow: hidden;
    border: 1px solid rgba(255,255,255,.1);
    background: #0f1419;
    box-shadow: 0 0 0 1px rgba(79,110,247,.12), 0 40px 90px rgba(0,0,0,.55), 0 8px 24px rgba(0,0,0,.35);
  }

  .card-chrome {
    display: flex; align-items: center; gap: 10px;
    padding: 9px 14px;
    background: #161b22;
    border-bottom: 1px solid rgba(255,255,255,.07);
  }
  .chrome-dots { display: flex; gap: 5px; }
  .chrome-dots span { width: 10px; height: 10px; border-radius: 50%; }
  .chrome-dots span:nth-child(1) { background: #ff5f57; }
  .chrome-dots span:nth-child(2) { background: #febc2e; }
  .chrome-dots span:nth-child(3) { background: #28c840; }
  .chrome-title {
    flex: 1; text-align: center;
    font-size: 11px; font-weight: 600;
    color: rgba(255,255,255,.4); letter-spacing: .02em;
  }
  .chrome-actions { display: flex; align-items: center; gap: 10px; color: rgba(255,255,255,.3); }
  .chrome-live {
    display: inline-flex; align-items: center; gap: 4px;
    font-size: 9px; font-weight: 600; text-transform: uppercase;
    letter-spacing: .07em; color: rgba(255,255,255,.22);
  }
  .chrome-live-dot { width: 5px; height: 5px; border-radius: 50%; background: #22c55e; animation: dotPulse 2s ease-in-out infinite; }
  .chrome-avatars { display: flex; }
  .chrome-avatar {
    width: 16px; height: 16px; border-radius: 50%;
    border: 1.5px solid #161b22; margin-left: -4px; display: inline-block;
  }
  .chrome-avatars .chrome-avatar:first-child { margin-left: 0; }

  .card-tabs {
    display: flex; gap: 0; align-items: center;
    background: #0f1419;
    border-bottom: 1px solid rgba(255,255,255,.07);
    padding: 0 8px;
  }
  .card-tab {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 9px 12px;
    font-size: 11px; font-weight: 500;
    color: rgba(255,255,255,.35);
    background: none; border: none; border-bottom: 2px solid transparent;
    cursor: pointer; font-family: inherit;
    transition: color .15s, border-color .15s;
    margin-bottom: -1px;
  }
  .card-tab:hover { color: rgba(255,255,255,.65); }
  .tab-active { color: rgba(255,255,255,.9); border-bottom-color: var(--accent); }
  .tab-unread {
    background: var(--accent); color: #fff;
    font-size: 9px; font-weight: 700; border-radius: 99px;
    padding: 1px 5px; line-height: 1.5;
  }
  .card-autoplay {
    margin-left: auto;
    font-size: 8.5px; font-weight: 700; text-transform: uppercase;
    letter-spacing: .1em;
    color: rgba(255,255,255,.25);
    border: 1px solid rgba(255,255,255,.1);
    border-radius: 5px; padding: 2px 6px;
  }
  .card-autoplay.on { color: var(--accent-2); border-color: rgba(129,140,248,.35); }

  .card-body { flex: 1; display: flex; min-height: 0; }

  .card-panel {
    width: 132px; flex-shrink: 0;
    background: #f1f5f9; border-right: 1px solid #e2e8f0;
    display: flex; flex-direction: column; overflow: hidden;
  }
  .panel-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 12px 8px; border-bottom: 1px solid #e2e8f0;
  }
  .panel-title { font-size: 10px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: .06em; }
  .panel-count { font-size: 10px; font-weight: 700; color: #94a3b8; background: #e2e8f0; border-radius: 9px; padding: 1px 6px; }
  .panel-rows { flex: 1; overflow-y: auto; padding: 4px 0; }
  .panel-row { display: flex; align-items: center; gap: 6px; padding: 5px 12px; cursor: pointer; }
  .panel-row:hover:not(.panel-row-selected) { background: rgba(79,110,247,.05); }
  .panel-row-selected { background: rgba(79,110,247,.08); border-left: 2px solid var(--accent); padding-left: 10px; }
  .row-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
  .row-dot.occupied { background: #22c55e; }
  .row-dot.open { background: #94a3b8; }
  .row-dot.selected { background: var(--accent); }
  .row-name { flex: 1; font-size: 11px; font-weight: 500; color: #334155; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .panel-row-selected .row-name { color: var(--accent); font-weight: 600; }
  .row-seats { font-size: 10px; font-weight: 600; color: #334155; }
  .row-cap { color: #94a3b8; font-weight: 400; }
  .row-open { color: #94a3b8; font-weight: 500; }
  .panel-footer { display: flex; align-items: center; gap: 6px; padding: 8px 12px; border-top: 1px solid #e2e8f0; background: #f8fafc; }
  .pf-stat { font-size: 10px; color: #64748b; white-space: nowrap; }
  .pf-num { font-weight: 700; color: #334155; }
  .pf-sep { color: #cbd5e1; font-size: 10px; }

  .card-canvas { flex: 1; position: relative; background: #f8f9fc; overflow: hidden; }
  .fp-svg { width: 100%; height: 100%; display: block; object-fit: cover; }
  :global(.sel-ring), :global(.sel-table) { animation: selPulse 2.5s ease-in-out 1s infinite; }
  @keyframes selPulse { 0%,100% { opacity: .9; } 50% { opacity: .45; } }

  .canvas-label {
    position: absolute; bottom: 10px; left: 50%; transform: translateX(-50%);
    display: flex; align-items: center; gap: 6px;
    background: rgba(15,17,23,.9); backdrop-filter: blur(8px);
    border: 1px solid rgba(79,110,247,.3); border-radius: 100px;
    padding: 5px 12px; font-size: 11px; font-weight: 600;
    color: rgba(255,255,255,.7); white-space: nowrap;
    opacity: 0; animation: labelIn .5s ease-out 1.6s forwards;
  }
  @keyframes labelIn { from { opacity: 0; transform: translateX(-50%) translateY(8px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
  .label-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); animation: dotPulse 1.8s ease-in-out infinite; }
  @keyframes dotPulse { 0%,100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.6); opacity: .6; } }

  .tab-panel { flex: 1; overflow: hidden; min-height: 0; display: flex; flex-direction: column; }
  .tab-res { background: #f8f9fc; }
  .res-toolbar { display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; border-bottom: 1px solid #e2e8f0; background: #f1f5f9; }
  .res-toolbar-title { font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: .05em; }
  .res-chip { font-size: 10px; font-weight: 600; color: var(--accent); background: rgba(79,110,247,.1); border-radius: 99px; padding: 2px 8px; }
  .res-list { flex: 1; overflow-y: auto; }
  .res-row { display: flex; align-items: center; gap: 10px; padding: 11px 16px; border-bottom: 1px solid #f1f5f9; transition: background .12s; cursor: pointer; }
  .res-row:hover { background: #f1f5f9; }
  .res-row-active { background: rgba(79,110,247,.04); }
  .res-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
  .res-info { flex: 1; min-width: 0; }
  .res-name { display: block; font-size: 12px; font-weight: 600; color: #1e293b; }
  .res-meta { display: block; font-size: 10px; color: #94a3b8; margin-top: 1px; }
  .res-date { font-size: 11px; color: #64748b; white-space: nowrap; }
  .res-status { font-size: 10px; font-weight: 600; border-radius: 99px; padding: 2px 8px; white-space: nowrap; }
  .res-approved { background: rgba(34,197,94,.12); color: #16a34a; }
  .res-planning { background: rgba(79,110,247,.1); color: var(--accent); }
  .res-pending { background: rgba(245,158,11,.12); color: #d97706; }
  .res-detail { display: flex; align-items: center; gap: 8px; padding: 7px 16px 9px 43px; background: rgba(79,110,247,.04); border-bottom: 1px solid #edf0f9; animation: detailSlide .16s ease; }
  @keyframes detailSlide { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
  .res-detail-contact { font-size: 11px; flex: 1; color: #64748b; }
  .res-detail-btn { font-size: 10px; font-weight: 600; color: var(--accent); background: none; border: none; cursor: pointer; padding: 0; font-family: inherit; white-space: nowrap; }
  .res-detail-btn:hover { text-decoration: underline; }

  .tab-msgs { background: #0d1117; }
  .msgs-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; border-bottom: 1px solid rgba(255,255,255,.07); background: #0f1419; }
  .msgs-title { font-size: 12px; font-weight: 700; color: rgba(255,255,255,.82); }
  .msgs-sub { font-size: 10px; font-weight: 600; color: var(--accent-2); background: rgba(79,110,247,.15); border-radius: 99px; padding: 1px 7px; }
  .msgs-body { flex: 1; overflow-y: auto; padding: 10px 0; }
  .msg-item { display: flex; gap: 10px; padding: 7px 14px; }
  .msg-item-you .msg-content p { color: rgba(255,255,255,.55); }
  .msg-av { width: 24px; height: 24px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 700; color: #fff; }
  .msg-content { flex: 1; min-width: 0; }
  .msg-meta { display: flex; gap: 6px; align-items: baseline; margin-bottom: 3px; }
  .msg-author { font-size: 11px; font-weight: 600; color: rgba(255,255,255,.65); }
  .msg-time { font-size: 10px; color: rgba(255,255,255,.22); }
  .msg-text { font-size: 11px; color: rgba(255,255,255,.38); line-height: 1.55; margin: 0; }
  .msgs-compose { display: flex; align-items: center; gap: 10px; padding: 8px 14px; border-top: 1px solid rgba(255,255,255,.07); background: #0f1419; }
  .msgs-input { flex: 1; min-width: 0; background: none; border: none; outline: none; font-size: 11px; color: rgba(255,255,255,.8); font-family: inherit; caret-color: var(--accent); }
  .msgs-input::placeholder { color: rgba(255,255,255,.28); }
  .msgs-send { width: 24px; height: 24px; border-radius: 50%; background: var(--accent); color: #fff; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background .15s; }
  .msgs-send:hover { background: #3d5ce8; }

  /* ─── Trust strip ────────────────────────────────────────── */
  .trust-strip {
    max-width: 1200px; margin: 0 auto;
    border-top: 1px solid var(--border-2);
    border-bottom: 1px solid var(--border-2);
    padding: 22px 32px;
    display: flex; align-items: center; gap: 40px;
    flex-wrap: wrap;
  }
  .trust-label {
    font-size: 11px; font-weight: 600; letter-spacing: .07em; text-transform: uppercase;
    color: rgba(255,255,255,.28); white-space: nowrap; flex-shrink: 0;
  }
  .trust-logos { display: flex; gap: 34px; flex-wrap: wrap; align-items: center; }
  .trust-mark {
    position: relative; display: inline-flex; align-items: center; justify-content: center;
    width: 30px; height: 30px; color: rgba(255,255,255,.3);
    transition: color .2s;
  }
  .trust-mark:hover { color: rgba(255,255,255,.55); }
  .trust-mark svg { position: absolute; inset: 0; margin: auto; width: 30px; height: 30px; }
  .trust-mono { font-size: 10px; font-weight: 800; letter-spacing: .02em; }

  /* ─── Features section ambient glow ─────────────────────── */
  section#features { position: relative; overflow: hidden; }
  section#features::before {
    content: '';
    position: absolute;
    inset: 0; margin: auto;
    width: 860px; height: 560px;
    background: radial-gradient(ellipse, rgba(79,110,247,.065) 0%, transparent 62%);
    animation: featAmbient 18s ease-in-out infinite alternate;
    pointer-events: none;
    z-index: 0;
  }
  section#features .section-inner { position: relative; z-index: 1; }
  @keyframes featAmbient {
    0%   { transform: translate(0, 0)          scale(1);    filter: hue-rotate(0deg);  }
    35%  { transform: translate(22px, -16px)   scale(1.04); filter: hue-rotate(9deg);  }
    70%  { transform: translate(-18px, 14px)   scale(.97);  filter: hue-rotate(14deg); }
    100% { transform: translate(10px, -8px)    scale(1.02); filter: hue-rotate(4deg);  }
  }
  @media (prefers-reduced-motion: reduce) {
    section#features::before { animation: none; }
  }

  /* ─── Bento ──────────────────────────────────────────────── */
  .bento {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    grid-auto-rows: minmax(180px, auto);
    grid-template-areas:
      "floor floor rsvp"
      "resv  msg   rsvp"
      "brand brand plans";
    gap: 18px;
  }
  .bento-cell {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 26px;
    display: flex; flex-direction: column;
  }
  .bento-cell h3 { font-size: 16px; font-weight: 700; color: #fff; margin: 0 0 8px; }
  .bento-cell p { font-size: 13.5px; color: var(--txt-muted); line-height: 1.6; margin: 0; }
  .cell-icon {
    width: 42px; height: 42px; border-radius: 11px;
    background: rgba(79,110,247,.1); border: 1px solid rgba(79,110,247,.2);
    display: flex; align-items: center; justify-content: center;
    color: var(--accent-2); margin-bottom: 16px; flex-shrink: 0;
  }
  .cell-floor { grid-area: floor; flex-direction: row; align-items: center; gap: 26px; }
  .cell-floor .cell-text { flex: 1; min-width: 0; }
  .cell-rsvp { grid-area: rsvp; }
  .cell-brand { grid-area: brand; flex-direction: row; align-items: center; gap: 26px; }
  .cell-brand .cell-text { flex: 1; min-width: 0; }
  .bento-cell:nth-of-type(3) { grid-area: resv; }
  .bento-cell:nth-of-type(4) { grid-area: msg; }
  .bento-cell:nth-of-type(6) { grid-area: plans; }

  .cell-visual { position: relative; border-radius: 11px; overflow: hidden; }
  .cell-visual-floor {
    width: 250px; flex-shrink: 0; align-self: stretch;
    border: 1px solid var(--border-2);
  }
  .cell-visual-floor svg { width: 100%; height: 100%; display: block; min-height: 140px; }
  /* Guest seating visual */
  .cell-visual-seat { margin-top: 18px; flex: 1; }
  .seat-preview {
    background: #0e1422; border: 1px solid var(--border-2);
    border-radius: 10px; padding: 13px;
  }
  .seat-preview-hdr { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
  .seat-preview-label { font-size: 10px; font-weight: 600; color: rgba(255,255,255,.45); letter-spacing: .02em; }
  .seat-preview-count { font-size: 10px; font-weight: 600; color: rgba(99,120,248,.85); }
  .seat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
  .sdot {
    aspect-ratio: 1; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 9px; font-weight: 700; line-height: 1;
  }
  .sdot-filled { background: rgba(79,110,247,.18); border: 1.5px solid rgba(79,110,247,.45); color: rgba(129,140,248,.9); }
  .sdot-empty  { background: rgba(255,255,255,.04); border: 1.5px solid var(--border-2); }
  .seat-preview-legend {
    display: flex; align-items: center; gap: 10px;
    margin-top: 10px; font-size: 9.5px; color: rgba(255,255,255,.32);
  }
  .seat-legend-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; border: 1.5px solid var(--border-2); background: rgba(255,255,255,.04); }
  .seat-legend-dot.filled { background: rgba(79,110,247,.4); border-color: rgba(79,110,247,.6); }

  /* White-label brand mini preview */
  .cell-visual-brand { flex-shrink: 0; }
  .brand-mini {
    width: 152px; border-radius: 9px; overflow: hidden;
    background: #0e1422; border: 1px solid var(--border-2);
  }
  .brand-mini-bar {
    display: flex; align-items: center; gap: 5px;
    padding: 6px 9px;
    background: rgba(255,255,255,.025);
    border-bottom: 1px solid var(--border-2);
    font-size: 9.5px; color: rgba(255,255,255,.3);
  }
  .brand-mini-header {
    display: flex; align-items: center; gap: 7px;
    padding: 9px 10px;
    border-bottom: 1px solid var(--border-2);
  }
  .brand-mini-logo {
    width: 18px; height: 18px; border-radius: 50%;
    background: var(--accent); opacity: .65; flex-shrink: 0;
  }
  .brand-mini-name { font-size: 10px; font-weight: 600; color: rgba(255,255,255,.65); }
  .brand-mini-accent { height: 2px; background: linear-gradient(90deg, var(--accent) 0%, transparent 80%); opacity: .7; }
  .brand-mini-body { padding: 9px 10px; display: flex; flex-direction: column; gap: 5px; }
  .brand-mini-line { display: block; height: 6px; border-radius: 3px; background: rgba(255,255,255,.07); }
  .brand-mini-line.short { width: 60%; }

  /* ─── White-label section ────────────────────────────────── */
  .wl-section { background: var(--bg-2); border-top: 1px solid var(--border-2); border-bottom: 1px solid var(--border-2); }
  .wl-grid { display: grid; grid-template-columns: 1fr 1.05fr; align-items: center; gap: 64px; }
  .wl-text h2 { font-size: clamp(28px, 3.6vw, 40px); font-weight: 700; letter-spacing: -0.025em; color: #fff; margin: 0 0 18px; }
  .wl-lead { font-size: 16px; line-height: 1.65; color: var(--txt-muted); margin: 0 0 28px; max-width: 460px; }
  .wl-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 16px; }
  .wl-list li { display: flex; gap: 12px; align-items: flex-start; }
  .wl-list li div { font-size: 14px; color: var(--txt-muted); line-height: 1.55; }
  .wl-list strong { color: #fff; font-weight: 600; }
  .wl-check {
    flex-shrink: 0; width: 22px; height: 22px; border-radius: 7px;
    background: rgba(79,110,247,.15); color: var(--accent-2);
    display: flex; align-items: center; justify-content: center; margin-top: 1px;
  }

  .wl-visual { position: relative; }
  .browser {
    border-radius: 13px; overflow: hidden;
    border: 1px solid rgba(255,255,255,.12);
    background: #0f1419;
    box-shadow: 0 30px 70px rgba(0,0,0,.5);
  }
  .browser-bar { display: flex; align-items: center; gap: 12px; padding: 9px 13px; background: #161b22; border-bottom: 1px solid rgba(255,255,255,.07); }
  .browser-dots { display: flex; gap: 5px; }
  .browser-dots span { width: 9px; height: 9px; border-radius: 50%; background: rgba(255,255,255,.16); }
  .browser-url {
    display: inline-flex; align-items: center; gap: 6px;
    font-size: 11px; color: rgba(255,255,255,.55);
    background: rgba(255,255,255,.05); border-radius: 6px;
    padding: 4px 12px; flex: 1; max-width: 300px;
  }
  .browser-url svg { color: #22c55e; flex-shrink: 0; }
  .browser-page { background: #fbfcfe; padding: 16px; min-height: 240px; }
  .bp-header { display: flex; align-items: center; gap: 9px; padding-bottom: 14px; border-bottom: 1px solid #eef1f6; }
  .bp-logo { width: 26px; height: 26px; border-radius: 7px; background: linear-gradient(135deg, var(--accent), var(--accent-2)); color: #fff; font-size: 10px; font-weight: 800; display: flex; align-items: center; justify-content: center; }
  .bp-name { font-size: 13px; font-weight: 700; color: #1e293b; }
  .bp-cta { margin-left: auto; font-size: 10px; font-weight: 700; color: #fff; background: var(--accent); border-radius: 6px; padding: 5px 11px; }
  .bp-hero { padding: 22px 0 18px; }
  .bp-hero-title { display: block; font-size: 19px; font-weight: 800; color: #0f172a; letter-spacing: -0.02em; }
  .bp-hero-sub { display: block; font-size: 12px; color: #64748b; margin-top: 5px; }
  /* ─── Hall cards (bp redesign) ──────────────────────────── */
  .bp-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; margin-top: 4px; }
  .bp-hall-card {
    border-radius: 7px; background: #f1f5f9;
    border: 1px solid #e2e8f0; overflow: hidden;
    display: flex; flex-direction: column;
  }
  .bp-hall-card.active { background: #eff2fd; border-color: #c7d2fb; }
  .bp-hc-accent { height: 3px; flex-shrink: 0; }
  .bp-hc-body { padding: 7px 8px; display: flex; flex-direction: column; gap: 3px; }
  .bp-hc-name { font-size: 10px; font-weight: 700; color: #1e293b; line-height: 1.2; }
  .bp-hc-cap { font-size: 9px; color: #64748b; }
  .bp-hc-avail {
    font-size: 8px; font-weight: 700; border-radius: 3px;
    padding: 2px 5px; align-self: flex-start; margin-top: 1px;
  }
  .avail-open { background: rgba(34,197,94,.12); color: #16a34a; }
  .avail-sel  { background: rgba(79,110,247,.12); color: #4f6ef7; }
  .avail-book { background: rgba(248,113,113,.1);  color: #dc2626; }

  /* ─── Lang toggle ────────────────────────────────────────── */
  .lang-toggle {
    display: inline-flex; align-items: center; gap: 3px;
    background: none; border: 1px solid rgba(255,255,255,.12); border-radius: 7px;
    padding: 5px 10px; cursor: pointer;
    font-size: 11.5px; font-weight: 700; letter-spacing: .04em;
    color: rgba(255,255,255,.35); font-family: inherit;
    transition: border-color .15s, color .15s;
  }
  .lang-toggle:hover { border-color: rgba(255,255,255,.25); }
  .lang-sep { color: rgba(255,255,255,.18); font-weight: 400; }
  .active-lang { color: var(--txt); }

  .wl-badge {
    position: absolute; bottom: -14px; right: 20px;
    display: inline-flex; align-items: center; gap: 7px;
    background: rgba(15,20,25,.92); backdrop-filter: blur(8px);
    border: 1px solid rgba(255,255,255,.12); border-radius: 99px;
    padding: 7px 14px; font-size: 11px; font-weight: 600; color: rgba(255,255,255,.75);
  }
  .wl-badge-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent-2); }

  /* ─── How it works (editorial redesign) ─────────────────── */
  .how-section {
    background: var(--bg);
    position: relative;
    overflow: hidden;
  }
  /* Ambient glow behind the steps */
  .how-section::before {
    content: '';
    position: absolute;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    width: 800px; height: 360px;
    background: radial-gradient(ellipse, rgba(79,110,247,.04) 0%, transparent 70%);
    pointer-events: none;
    z-index: 0;
  }
  .how-section .section-inner { position: relative; z-index: 1; }

  .steps {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    position: relative;
    gap: 0;
  }
  /* Horizontal connector base line */
  .steps::before {
    content: '';
    position: absolute;
    top: 29px;
    left: calc(100% / 6);
    right: calc(100% / 6);
    height: 1px;
    background: linear-gradient(90deg, transparent 0%, rgba(79,110,247,.35) 20%, rgba(79,110,247,.35) 80%, transparent 100%);
    pointer-events: none;
    z-index: 0;
  }
  /* Traveling light bead along the connector — comet shape: long dim tail, sharp head */
  .steps::after {
    content: '';
    position: absolute;
    top: 26px;
    left: calc(100% / 6);
    right: calc(100% / 6);
    height: 5px;
    border-radius: 9px;
    background: linear-gradient(90deg,
      transparent      0%,
      rgba(129,140,248,.03) 22%,
      rgba(129,140,248,.28) 46%,
      rgba(129,140,248,.44) 50%,
      rgba(129,140,248,.06) 58%,
      transparent      65%,
      transparent      100%
    );
    background-size: 200% 100%;
    background-position: 100% 0;
    filter: blur(2px);
    animation: lineBeam 2.8s linear 0.6s infinite;
    pointer-events: none;
    z-index: 0;
  }
  @keyframes lineBeam {
    0%   { background-position: 100% 0; opacity: 0; }
    8%   { opacity: 1; }
    92%  { opacity: 1; }
    100% { background-position: 0% 0; opacity: 0; }
  }

  .step {
    display: flex; flex-direction: column; align-items: center; text-align: center;
    padding: 0 28px; cursor: default;
    background: none; border: none; border-radius: 0;
    position: relative; z-index: 1;
    transition: transform .25s ease;
  }
  .step:hover { transform: translateY(-3px); }
  .step-marker {
    position: relative; z-index: 1;
    width: 58px; height: 58px; border-radius: 50%;
    background: var(--bg);
    border: 1px solid rgba(79,110,247,.45);
    display: flex; align-items: center; justify-content: center;
    margin-bottom: 22px;
    transition: border-color .25s, box-shadow .25s;
  }
  /* Staggered pulsing glow per marker */
  .step-marker {
    box-shadow: 0 0 0 6px var(--bg), 0 0 0 7px rgba(79,110,247,0), 0 0 16px rgba(79,110,247,0);
    animation: markerGlow 2.8s ease-in-out infinite;
  }
  .step:nth-child(1) .step-marker { animation-delay: 0s; }
  .step:nth-child(2) .step-marker { animation-delay: 0.93s; }
  .step:nth-child(3) .step-marker { animation-delay: 1.87s; }
  @keyframes markerGlow {
    0%, 100% {
      box-shadow: 0 0 0 6px var(--bg), 0 0 0 7px rgba(79,110,247,0), 0 0 10px rgba(79,110,247,0);
      border-color: rgba(79,110,247,.45);
    }
    45%, 55% {
      box-shadow: 0 0 0 6px var(--bg), 0 0 0 7px rgba(79,110,247,.1), 0 0 18px rgba(79,110,247,.2);
      border-color: rgba(99,120,248,.7);
    }
  }
  .step:hover .step-marker {
    border-color: rgba(99,120,248,.75) !important;
    box-shadow: 0 0 0 6px var(--bg), 0 0 0 8px rgba(79,110,247,.14), 0 0 22px rgba(79,110,247,.25) !important;
  }
  .step-badge {
    font-size: 17px; font-weight: 800; letter-spacing: -0.02em; line-height: 1;
    background: linear-gradient(135deg, var(--accent), var(--accent-2));
    -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
  }
  .step-icon-wrap {
    width: 42px; height: 42px; border-radius: 10px;
    background: rgba(79,110,247,.08); border: 1px solid rgba(79,110,247,.15);
    display: flex; align-items: center; justify-content: center;
    color: var(--accent-2); margin-bottom: 18px; flex-shrink: 0;
    transition: background .25s, border-color .25s, box-shadow .25s;
  }
  .step:hover .step-icon-wrap {
    background: rgba(79,110,247,.15);
    border-color: rgba(79,110,247,.35);
    box-shadow: 0 0 18px rgba(79,110,247,.2);
  }
  .step-content h3 { font-size: 17px; font-weight: 700; color: #fff; margin: 0 0 9px; transition: color .2s; }
  .step:hover .step-content h3 { color: var(--accent-2); }
  .step-content p { font-size: 13.5px; color: var(--txt-muted); line-height: 1.6; margin: 0; }

  /* ─── Pricing ────────────────────────────────────────────── */
  .pricing-section { background: var(--bg-2); border-top: 1px solid var(--border-2); }
  .pricing-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; align-items: start; }
  .price-card {
    background: var(--panel); border: 1px solid var(--border);
    border-radius: 16px; padding: 26px 22px;
    display: flex; flex-direction: column;
  }
  .price-featured {
    border-color: rgba(79,110,247,.5);
    box-shadow: 0 0 0 1px rgba(79,110,247,.3), 0 18px 50px rgba(79,110,247,.16);
    background: linear-gradient(180deg, rgba(79,110,247,.08), var(--panel) 60%);
  }
  .price-badge {
    align-self: flex-start;
    font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em;
    color: #fff; background: var(--accent); border-radius: 99px; padding: 3px 10px; margin-bottom: 14px;
  }
  .price-name { font-size: 14px; font-weight: 700; color: var(--txt); }
  .price-amount { display: flex; align-items: baseline; gap: 3px; margin: 10px 0 4px; }
  .price-value { font-size: 34px; font-weight: 800; letter-spacing: -0.03em; color: #fff; }
  .price-cadence { font-size: 13px; color: var(--txt-faint); }
  .price-blurb { font-size: 12.5px; color: var(--txt-muted); line-height: 1.5; margin: 0 0 18px; min-height: 38px; }
  .price-cta { width: 100%; justify-content: center; margin-bottom: 20px; }
  .price-features { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
  .price-features li { display: flex; align-items: flex-start; gap: 9px; font-size: 13px; color: var(--txt-muted); }
  .price-features svg { color: var(--accent-2); flex-shrink: 0; margin-top: 2px; }

  /* ─── Proof band ─────────────────────────────────────────── */
  .proof-section { background: var(--bg); border-top: 1px solid var(--border-2); border-bottom: 1px solid var(--border-2); padding: 56px 32px; }
  .proof-inner { max-width: 1000px; margin: 0 auto; display: flex; align-items: center; justify-content: center; }
  .proof-item { flex: 1; text-align: center; padding: 0 24px; }
  .proof-num {
    display: block; font-size: clamp(24px, 3vw, 34px); font-weight: 800; letter-spacing: -0.02em;
    background: linear-gradient(135deg, #fff, rgba(255,255,255,.62));
    -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
    margin-bottom: 7px; white-space: nowrap;
  }
  .proof-label { display: block; font-size: 13px; color: var(--txt-faint); font-weight: 500; }
  .proof-divider { width: 1px; height: 46px; background: var(--border); flex-shrink: 0; }

  /* ─── CTA ────────────────────────────────────────────────── */
  .cta-section { position: relative; overflow: hidden; padding: 120px 32px; text-align: center; }
  .cta-bg { position: absolute; inset: 0; pointer-events: none; }
  .orb-cta-1 { width: 500px; height: 500px; background: radial-gradient(circle, rgba(79,110,247,.2) 0%, transparent 65%); top: -120px; left: 50%; transform: translateX(-50%); animation: orbDrift 10s ease-in-out infinite; }
  .orb-cta-2 { width: 340px; height: 340px; background: radial-gradient(circle, rgba(139,92,246,.15) 0%, transparent 65%); bottom: -90px; right: 12%; animation: orbDrift 8s ease-in-out 3s infinite reverse; }
  .cta-inner { position: relative; z-index: 1; max-width: 620px; margin: 0 auto; }
  .cta-inner h2 { font-size: clamp(28px, 4.2vw, 46px); font-weight: 800; letter-spacing: -0.03em; color: #fff; margin: 0 0 16px; }
  .cta-inner p { font-size: 16px; color: var(--txt-muted); line-height: 1.6; margin: 0 0 32px; }
  .cta-actions { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }

  /* ─── Footer ─────────────────────────────────────────────── */
  .footer { border-top: 1px solid var(--border-2); }
  .footer-inner {
    max-width: 1200px; margin: 0 auto; padding: 56px 32px 36px;
    display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 40px;
  }
  .footer-brand { display: inline-flex; align-items: center; gap: 9px; text-decoration: none; }
  .footer-logo { width: 22px; height: 22px; filter: brightness(0) invert(0.5); }
  .footer-name { font-family: 'Poppins', sans-serif; font-weight: 900; font-style: italic; font-size: 16px; color: rgba(255,255,255,.7); letter-spacing: -0.01em; }
  .footer-tag { font-size: 13px; color: var(--txt-faint); margin: 14px 0 0; max-width: 240px; line-height: 1.5; }
  .footer-col { display: flex; flex-direction: column; gap: 12px; }
  .footer-heading { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: rgba(255,255,255,.32); margin-bottom: 2px; }
  .footer-col a { font-size: 13px; color: var(--txt-muted); text-decoration: none; transition: color .15s; }
  .footer-col a:hover { color: #fff; }
  .footer-bottom { border-top: 1px solid var(--border-2); }
  .footer-copy { max-width: 1200px; margin: 0 auto; padding: 20px 32px; font-size: 12px; color: rgba(255,255,255,.3); }

  /* ─── Responsive ─────────────────────────────────────────── */
  @media (max-width: 1024px) {
    .hero-inner { grid-template-columns: 1fr; gap: 44px; padding: 64px 28px 80px; }
    .hero-text { max-width: 600px; }
    .hero-h1 { font-size: clamp(38px, 7vw, 54px); }
    .hero-demo { max-width: 620px; }
    .wl-grid { gap: 44px; }
    .pricing-grid { grid-template-columns: repeat(2, 1fr); }
  }

  @media (max-width: 860px) {
    .nav-links { display: none; }
    .section { padding: 84px 0; }
    .bento {
      grid-template-columns: 1fr 1fr;
      grid-template-areas:
        "floor floor"
        "rsvp  resv"
        "rsvp  msg"
        "brand brand"
        "plans plans";
    }
    .cell-floor, .cell-brand { flex-direction: column; align-items: stretch; gap: 18px; }
    .cell-visual-floor { width: 100%; }
    .brand-mini { width: 100%; }
    .wl-grid { grid-template-columns: 1fr; }
    .steps { grid-template-columns: 1fr; gap: 40px; }
    .steps::before, .steps::after { display: none; }
    .step { align-items: flex-start; text-align: left; flex-direction: row; gap: 18px; padding: 0; }
    .step:hover { transform: none; }
    .step-marker { flex-shrink: 0; margin-bottom: 0; }
    .step-icon-wrap { display: none; }
    .proof-inner { flex-wrap: wrap; gap: 28px 0; }
    .proof-item { flex-basis: 50%; }
    .proof-divider { display: none; }
    .hero-card { height: 420px; }
  }

  @media (max-width: 560px) {
    .nav-inner { padding: 0 18px; gap: 12px; }
    .nav-signin { display: none; }
    .hero-inner { padding: 48px 18px 64px; }
    .section-inner { padding: 0 18px; }
    .bento { grid-template-columns: 1fr; grid-template-areas: "floor" "rsvp" "resv" "msg" "brand" "plans"; }
    .pricing-grid { grid-template-columns: 1fr; }
    .proof-item { flex-basis: 100%; }
    .trust-strip { padding: 20px 18px; gap: 18px; }
    .footer-inner { grid-template-columns: 1fr 1fr; }
    .footer-brand-col { grid-column: 1 / -1; }
    .hero-card { height: 400px; }
    .card-autoplay { display: none; }
  }

  /* ─── Reduced motion ─────────────────────────────────────── */
  @media (prefers-reduced-motion: reduce) {
    .orb, .orb-cta-1, .orb-cta-2,
    .chrome-live-dot, .label-dot,
    .step-marker, .steps::after,
    :global(.sel-ring), :global(.sel-table) { animation: none !important; }
    .step-marker { box-shadow: 0 0 0 6px var(--bg), 0 0 0 8px rgba(79,110,247,.25) !important; }
    :global(.reveal) { opacity: 1 !important; transform: none !important; transition: none !important; }
    .hero-h1 span, .hero-sub, .hero-cta, .hero-note, .hero-demo { opacity: 1 !important; transform: none !important; transition: none !important; }
    .canvas-label { animation: none; opacity: 1; }
  }
</style>
