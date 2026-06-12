<script lang="ts">
  import { onMount } from 'svelte';

  let loaded = $state(false);
  let heroTab = $state<'editor' | 'reservations' | 'messages'>('editor');

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
    { author: 'Alex C.',  time: '1h ago',   text: 'Tables 1–4 are set. Head table seats 10, confirmed with client ✓', av: 'A', avColor: '#3b82f6' },
    { author: 'You',      time: 'Just now', text: 'Perfect! Can you also double-check table 5 capacity?', av: 'Y', avColor: '#4f6ef7', isYou: true },
  ]);

  let replyText = $state('');
  let msgsBodyEl: HTMLElement | null = null;

  function sendReply() {
    const text = replyText.trim();
    if (!text) return;
    messages = [...messages, { author: 'You', time: 'Just now', text, av: 'Y', avColor: '#4f6ef7', isYou: true }];
    replyText = '';
  }

  $effect(() => {
    if (messages.length > 0 && msgsBodyEl) msgsBodyEl.scrollTop = msgsBodyEl.scrollHeight;
  });

  onMount(() => {
    requestAnimationFrame(() => { loaded = true; });

    const io = new IntersectionObserver(
      (entries) => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('in-view'); }),
      { threshold: 0.10, rootMargin: '0px 0px -48px 0px' }
    );
    document.querySelectorAll('.reveal').forEach(el => io.observe(el));

    document.querySelectorAll<HTMLElement>('.feature-card, .step, .value-card').forEach(card => {
      card.addEventListener('mousemove', (e: MouseEvent) => {
        const r = card.getBoundingClientRect();
        card.style.setProperty('--mx', `${e.clientX - r.left}px`);
        card.style.setProperty('--my', `${e.clientY - r.top}px`);
      });
    });

    return () => io.disconnect();
  });
</script>

<svelte:head>
  <title>Hallify — Venue management for modern teams</title>
  <meta name="description" content="From floor plans to RSVPs, Hallify gives your team everything needed to run events flawlessly." />
</svelte:head>

<div class="page" class:loaded>

  <!-- ─── HERO ──────────────────────────────────────────────── -->
  <section class="hero">
    <div class="hero-bg">
      <div class="grid-layer"></div>
      <div class="orb orb-1"></div>
      <div class="orb orb-2"></div>
      <div class="orb orb-3"></div>
    </div>

    <div class="hero-inner">
      <div class="hero-text">
        <div class="hero-brand">
          <img src="/Hallify.svg" alt="Hallify" class="hero-brand-logo" />
          <span class="hero-brand-name">Hallify</span>
        </div>
        <h1 class="hero-h1">
          <span>Your venue,</span>
          <span class="accent-word">managed</span>
          <span>perfectly.</span>
        </h1>
        <p class="hero-sub">
          From visual floor plans to RSVP forms and guest seating, Hallify
          gives your team one place to run every event — without the chaos.
        </p>
        <div class="hero-cta">
          <a href="/app/register" class="btn-primary">Get started free</a>
          <a href="/app/login" class="btn-ghost">Sign in</a>
        </div>
        <p class="hero-note">No credit card required · Free plan available</p>
        <div class="hero-demo-cue">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          Try the interactive demo
        </div>
      </div>

      <div class="hero-card-wrap">
        <div class="hero-card">
          <!-- Window chrome -->
          <div class="card-chrome">
            <div class="chrome-dots">
              <span></span><span></span><span></span>
            </div>
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
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
            </div>
          </div>

          <!-- Tab bar -->
          <div class="card-tabs">
            <button class="card-tab" class:tab-active={heroTab === 'editor'} onclick={() => heroTab = 'editor'} type="button">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
              Editor
            </button>
            <button class="card-tab" class:tab-active={heroTab === 'reservations'} onclick={() => heroTab = 'reservations'} type="button">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              Reservations
            </button>
            <button class="card-tab" class:tab-active={heroTab === 'messages'} onclick={() => heroTab = 'messages'} type="button">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              Messages
              <span class="tab-unread">3</span>
            </button>
          </div>

          {#if heroTab === 'editor'}
          <!-- Split-view body -->
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
                    onclick={() => selectedTable = t.id}
                    role="button"
                    tabindex="0"
                    onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') selectedTable = t.id; }}
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

                <!-- Tables (dynamic — click to select) -->
                {#each tableData as t}
                  {@const sel = t.id === selectedTable}
                  <g transform="translate({t.x},{t.y})" onclick={() => selectedTable = t.id} style="cursor:pointer">
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

              <!-- Floating status label -->
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
                  onclick={() => selectedRes = selectedRes === r.id ? null : r.id}
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
              <button class="msgs-send" type="button" onclick={sendReply}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </button>
            </div>
          </div>
          {/if}

        </div>
      </div>
    </div>
  </section>

  <!-- ─── LOGOS / TRUST STRIP ─────────────────────────────────── -->
  <div class="trust-strip reveal">
    <span class="trust-label">Trusted by venues across Europe</span>
    <div class="trust-logos">
      <span>The Grand Hall</span>
      <span>Eventum</span>
      <span>Crystal Venue</span>
      <span>Monarch Events</span>
      <span>Atlas Spaces</span>
    </div>
  </div>

  <!-- ─── FEATURES ──────────────────────────────────────────────── -->
  <section class="section features-section">
    <div class="section-inner">
      <div class="section-header reveal">
        <span class="section-eyebrow">01 · Features</span>
        <h2>Everything your venue needs</h2>
        <p>One platform. Every workflow. No duct tape.</p>
      </div>

      <div class="features-grid">
        <div class="feature-card reveal" data-delay="0">
          <div class="feature-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <path d="M3 9h18M9 21V9"/>
            </svg>
          </div>
          <h3>Visual Floor Plan Editor</h3>
          <p>Drag and drop tables, chairs, and zones onto a live canvas. Design your hall exactly as it exists in real life.</p>
        </div>
        <div class="feature-card reveal" data-delay="1">
          <div class="feature-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="3" y="4" width="18" height="18" rx="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
          </div>
          <h3>Reservation Management</h3>
          <p>Full booking lifecycle — from inquiry to completion. Track status, assign halls, and manage every event detail.</p>
        </div>
        <div class="feature-card reveal" data-delay="2">
          <div class="feature-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </div>
          <h3>RSVP &amp; Guest Seating</h3>
          <p>Send digital RSVP forms, collect responses, and assign guests directly to seats on the floor plan.</p>
        </div>
        <div class="feature-card reveal" data-delay="3">
          <div class="feature-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <h3>Team Messaging</h3>
          <p>Keep all event communication in one place. Your team and clients can message directly within each reservation.</p>
        </div>
        <div class="feature-card reveal" data-delay="0">
          <div class="feature-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </div>
          <h3>Custom Branding</h3>
          <p>White-label the platform for your organization. Your logo, your colors, your name — fully yours.</p>
        </div>
        <div class="feature-card reveal" data-delay="1">
          <div class="feature-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="1" y="4" width="22" height="16" rx="2"/>
              <line x1="1" y1="10" x2="23" y2="10"/>
            </svg>
          </div>
          <h3>Flexible Plans</h3>
          <p>Start free and scale as you grow. Upgrade when you need more halls, more users, or advanced features.</p>
        </div>
      </div>
    </div>
  </section>

  <!-- ─── HOW IT WORKS ──────────────────────────────────────────── -->
  <section class="section how-section">
    <div class="section-inner">
      <div class="section-header reveal">
        <span class="section-eyebrow">02 · How it works</span>
        <h2>Up and running in minutes</h2>
        <p>No complex setup. No onboarding calls. Just open Hallify and start.</p>
      </div>

      <div class="steps">
        <div class="step reveal" data-delay="0">
          <div class="step-visual">
            <svg width="52" height="52" viewBox="0 0 52 52" fill="none">
              <rect x="6" y="6" width="40" height="40" rx="8" fill="rgba(79,110,247,0.12)" stroke="rgba(79,110,247,0.3)" stroke-width="1"/>
              <rect x="13" y="13" width="11" height="11" rx="2" fill="rgba(79,110,247,0.4)"/>
              <rect x="28" y="13" width="11" height="11" rx="2" fill="rgba(79,110,247,0.25)"/>
              <rect x="13" y="28" width="11" height="11" rx="2" fill="rgba(79,110,247,0.25)"/>
              <rect x="28" y="28" width="11" height="11" rx="2" fill="rgba(79,110,247,0.15)"/>
              <circle cx="39" cy="39" r="7" fill="#4f6ef7"/>
              <path d="M36 39l2 2 4-4" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div class="step-num">01</div>
          <div class="step-content">
            <h3>Create your venue</h3>
            <p>Set up your organization, add halls, and draw your floor plan using the visual editor. Position tables, chairs, and zones exactly as they are in real life.</p>
          </div>
        </div>

        <div class="step-connector" aria-hidden="true">
          <div class="connector-line"></div>
          <div class="connector-dot"></div>
        </div>

        <div class="step reveal" data-delay="1">
          <div class="step-visual">
            <svg width="52" height="52" viewBox="0 0 52 52" fill="none">
              <rect x="6" y="10" width="40" height="34" rx="6" fill="rgba(79,110,247,0.12)" stroke="rgba(79,110,247,0.3)" stroke-width="1"/>
              <rect x="6" y="16" width="40" height="1" fill="rgba(79,110,247,0.3)"/>
              <line x1="17" y1="10" x2="17" y2="7" stroke="rgba(79,110,247,0.6)" stroke-width="2" stroke-linecap="round"/>
              <line x1="35" y1="10" x2="35" y2="7" stroke="rgba(79,110,247,0.6)" stroke-width="2" stroke-linecap="round"/>
              <rect x="13" y="23" width="9" height="8" rx="2" fill="rgba(79,110,247,0.35)"/>
              <rect x="26" y="23" width="14" height="3" rx="1.5" fill="rgba(79,110,247,0.2)"/>
              <rect x="26" y="29" width="10" height="2" rx="1" fill="rgba(79,110,247,0.15)"/>
              <rect x="13" y="35" width="27" height="3" rx="1.5" fill="rgba(79,110,247,0.15)"/>
            </svg>
          </div>
          <div class="step-num">02</div>
          <div class="step-content">
            <h3>Set up an event</h3>
            <p>Create a reservation, pick a date and hall, choose a seating layout, and generate a custom RSVP form for your guests — all in one place.</p>
          </div>
        </div>

        <div class="step-connector" aria-hidden="true">
          <div class="connector-line"></div>
          <div class="connector-dot"></div>
        </div>

        <div class="step reveal" data-delay="2">
          <div class="step-visual">
            <svg width="52" height="52" viewBox="0 0 52 52" fill="none">
              <rect x="6" y="6" width="40" height="40" rx="8" fill="rgba(79,110,247,0.12)" stroke="rgba(79,110,247,0.3)" stroke-width="1"/>
              <circle cx="20" cy="19" r="5" fill="rgba(79,110,247,0.3)"/>
              <circle cx="32" cy="19" r="5" fill="rgba(79,110,247,0.2)"/>
              <path d="M14 35c0-4 2.7-6 6-6h12c3.3 0 6 2 6 6" stroke="rgba(79,110,247,0.5)" stroke-width="1.5" stroke-linecap="round"/>
              <circle cx="39" cy="37" r="7" fill="#22c55e"/>
              <path d="M36 37l2 2 4-4" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div class="step-num">03</div>
          <div class="step-content">
            <h3>Manage everything</h3>
            <p>Track RSVPs in real time, assign guests to seats on the floor plan, communicate with your team, and watch the event come together.</p>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- ─── STATS ─────────────────────────────────────────────────── -->
  <section class="stats-section reveal">
    <div class="stats-inner">
      <div class="stat">
        <span class="stat-num">12 000+</span>
        <span class="stat-label">Tables placed</span>
      </div>
      <div class="stat-divider"></div>
      <div class="stat">
        <span class="stat-num">4 800+</span>
        <span class="stat-label">Events managed</span>
      </div>
      <div class="stat-divider"></div>
      <div class="stat">
        <span class="stat-num">320+</span>
        <span class="stat-label">Venues onboarded</span>
      </div>
      <div class="stat-divider"></div>
      <div class="stat">
        <span class="stat-num">99.9%</span>
        <span class="stat-label">Uptime SLA</span>
      </div>
    </div>
  </section>

  <!-- ─── VALUES ────────────────────────────────────────────────── -->
  <section class="section values-section">
    <div class="section-inner">
      <div class="section-header reveal">
        <span class="section-eyebrow">03 · Why Hallify</span>
        <h2>Built for venues, not everyone</h2>
        <p>Generic event tools miss the nuance. Hallify is designed specifically for the way venue teams work.</p>
      </div>

      <div class="values-grid">
        <div class="value-card reveal" data-delay="0" data-accent="amber">
          <div class="value-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
            </svg>
          </div>
          <h3>Fast by design</h3>
          <p>Every interaction is optimized for speed. A booking that took 20 minutes of back-and-forth emails now takes 3.</p>
        </div>
        <div class="value-card reveal" data-delay="1" data-accent="teal">
          <div class="value-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
          <h3>Secure &amp; private</h3>
          <p>Your guest data and floor plans are yours. Role-based access, organization isolation, and encrypted storage.</p>
        </div>
        <div class="value-card reveal" data-delay="2" data-accent="purple">
          <div class="value-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="12" cy="12" r="10"/>
              <line x1="2" y1="12" x2="22" y2="12"/>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
            </svg>
          </div>
          <h3>Multi-org ready</h3>
          <p>Manage multiple venues under one account. Switch between organizations instantly, each with their own branding.</p>
        </div>
      </div>
    </div>
  </section>

  <!-- ─── FINAL CTA ─────────────────────────────────────────────── -->
  <section class="cta-section">
    <div class="cta-bg">
      <div class="orb orb-cta-1"></div>
      <div class="orb orb-cta-2"></div>
      <div class="grid-layer"></div>
    </div>
    <div class="cta-inner reveal">
      <h2>Ready to transform your venue?</h2>
      <p>Join hundreds of venue teams who run smarter events with Hallify. Free plan, no credit card needed.</p>
      <a href="/app/register" class="btn-primary btn-large">Get started free</a>
    </div>
  </section>

  <!-- ─── FOOTER ─────────────────────────────────────────────────── -->
  <footer class="footer">
    <div class="footer-inner">
      <div class="footer-brand">
        <img src="/Hallify.svg" alt="" class="footer-logo" />
        <span class="footer-name">Hallify</span>
      </div>
      <nav class="footer-nav">
        <a href="/app/login">Sign in</a>
        <a href="/app/register">Register</a>
      </nav>
      <p class="footer-copy">© 2026 Hallify. All rights reserved.</p>
    </div>
  </footer>

</div>

<style>
  /* ─── Page reset / base ──────────────────────────────────── */
  .page {
    background: #0d1117;
    color: #fff;
    min-height: 100vh;
    font-family: system-ui, -apple-system, sans-serif;
    overflow-x: hidden;
  }

  /* ─── Shared section wrapper ─────────────────────────────── */
  .section-inner {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 48px;
  }

  .section-header {
    text-align: center;
    margin-bottom: 64px;
  }

  .section-badge { display: none; }

  .section-eyebrow {
    display: block;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: rgba(255,255,255,.22);
    margin-bottom: 14px;
    font-variant-numeric: tabular-nums;
  }

  .section-header h2 {
    font-size: clamp(28px, 4vw, 42px);
    font-weight: 700;
    letter-spacing: -0.02em;
    margin-bottom: 14px;
    color: #fff;
  }

  .section-header p {
    font-size: 16px;
    color: rgba(255,255,255,0.5);
    max-width: 500px;
    margin: 0 auto;
    line-height: 1.6;
  }

  /* ─── Scroll reveal ──────────────────────────────────────── */
  :global(.reveal) {
    opacity: 0;
    transform: translateY(28px);
    transition: opacity 0.7s ease, transform 0.7s ease;
  }
  :global(.reveal.in-view) { opacity: 1; transform: none; }
  :global(.reveal[data-delay="1"]) { transition-delay: 0.12s; }
  :global(.reveal[data-delay="2"]) { transition-delay: 0.24s; }
  :global(.reveal[data-delay="3"]) { transition-delay: 0.36s; }

  /* ─── HERO ───────────────────────────────────────────────── */
  .hero {
    position: relative;
    min-height: 100vh;
    display: flex;
    align-items: stretch;
    overflow: hidden;
  }

  .hero-bg {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .grid-layer {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(255,255,255,.08) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,.08) 1px, transparent 1px),
      linear-gradient(rgba(255,255,255,.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,.03) 1px, transparent 1px);
    background-size: 180px 180px, 180px 180px, 36px 36px, 36px 36px;
  }

  .orb {
    position: absolute;
    border-radius: 50%;
    filter: blur(1px);
    pointer-events: none;
  }

  .orb-1 {
    width: 700px; height: 700px;
    background: radial-gradient(circle, rgba(79,110,247,.18) 0%, transparent 65%);
    top: -200px; right: -150px;
    animation: orbDrift 10s ease-in-out infinite;
  }
  .orb-2 {
    width: 500px; height: 500px;
    background: radial-gradient(circle, rgba(139,92,246,.13) 0%, transparent 65%);
    bottom: -100px; left: -100px;
    animation: orbDrift 14s ease-in-out 2s infinite reverse;
  }
  .orb-3 {
    width: 350px; height: 350px;
    background: radial-gradient(circle, rgba(20,184,166,.08) 0%, transparent 65%);
    top: 45%; left: 38%;
    animation: orbDrift 9s ease-in-out 5s infinite;
  }

  @keyframes orbDrift {
    0%,100% { transform: translate(0,0); }
    33%      { transform: translate(24px, -18px); }
    66%      { transform: translate(-12px, 20px); }
  }

  .hero-inner {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
    padding: 120px 48px 0;
    gap: 64px;
  }

  .hero-text {
    width: 100%;
    max-width: 640px;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
  }

  /* Hero text entrance (triggered by .loaded on parent) */
  /* Hero brand — replaces the pill badge */
  .hero-brand {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 28px;
    opacity: 0;
    transform: translateY(12px);
    transition: opacity 0.5s ease, transform 0.5s ease;
  }
  .loaded .hero-brand { opacity: 1; transform: none; }

  .hero-brand-logo {
    width: 24px;
    height: 24px;
    filter: brightness(0) invert(0.7) sepia(1) hue-rotate(200deg) saturate(2);
  }

  .hero-brand-name {
    font-family: 'Poppins', sans-serif;
    font-weight: 900;
    font-style: italic;
    font-size: 17px;
    color: rgba(255,255,255,.6);
    letter-spacing: -0.01em;
  }

  /* Demo cue in hero text column */
  .hero-demo-cue {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-top: 20px;
    font-size: 12px;
    font-weight: 500;
    color: rgba(255,255,255,.28);
    letter-spacing: 0.02em;
    opacity: 0;
    transition: opacity 0.5s 0.9s ease;
  }
  .loaded .hero-demo-cue { opacity: 1; }

  /* Chrome live indicator */
  .chrome-live {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: rgba(255,255,255,.22);
    margin-right: 4px;
  }
  .chrome-live-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: #22c55e;
    animation: dotPulse 2s ease-in-out infinite;
  }

  .hero-h1 {
    font-size: clamp(36px, 5.5vw, 64px);
    font-weight: 800;
    line-height: 1.08;
    letter-spacing: -0.03em;
    color: #fff;
    margin-bottom: 22px;
    display: flex;
    flex-direction: column;
  }

  .hero-h1 span {
    display: block;
    opacity: 0;
    transform: translateY(24px);
    transition: opacity 0.7s ease, transform 0.7s ease;
  }
  .hero-h1 span:nth-child(1) { transition-delay: 0.1s; }
  .hero-h1 span:nth-child(2) { transition-delay: 0.22s; }
  .hero-h1 span:nth-child(3) { transition-delay: 0.34s; }
  .loaded .hero-h1 span { opacity: 1; transform: none; }

  .accent-word { color: #818cf8; }

  .hero-sub {
    font-size: 18px;
    line-height: 1.7;
    color: rgba(255,255,255,.68);
    max-width: 520px;
    margin-bottom: 36px;
    opacity: 0;
    transform: translateY(16px);
    transition: opacity 0.7s 0.46s ease, transform 0.7s 0.46s ease;
  }
  .loaded .hero-sub { opacity: 1; transform: none; }

  .hero-cta {
    display: flex;
    gap: 12px;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    opacity: 0;
    transform: translateY(16px);
    transition: opacity 0.7s 0.58s ease, transform 0.7s 0.58s ease;
  }
  .loaded .hero-cta { opacity: 1; transform: none; }

  .hero-note {
    font-size: 12px;
    color: rgba(255,255,255,.3);
    margin-top: 14px;
    opacity: 0;
    transition: opacity 0.6s 0.75s ease;
  }
  .loaded .hero-note { opacity: 1; }

  /* ─── Buttons ─────────────────────────────────────────────── */
  .btn-primary {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 13px 26px;
    border-radius: 10px;
    background: #4f6ef7;
    color: #fff;
    font-size: 14px;
    font-weight: 600;
    text-decoration: none;
    transition: background .15s, transform .15s, box-shadow .15s;
    box-shadow: 0 4px 20px rgba(79,110,247,.35);
  }
  .btn-primary:hover { background: #3d5ce8; transform: translateY(-1px); box-shadow: 0 6px 28px rgba(79,110,247,.45); text-decoration: none; }

  .btn-ghost {
    display: inline-flex;
    align-items: center;
    padding: 13px 22px;
    border-radius: 10px;
    border: 1px solid rgba(255,255,255,.15);
    color: rgba(255,255,255,.7);
    font-size: 14px;
    font-weight: 500;
    text-decoration: none;
    transition: border-color .15s, color .15s, background .15s;
  }
  .btn-ghost:hover { border-color: rgba(255,255,255,.35); color: #fff; background: rgba(255,255,255,.05); text-decoration: none; }

  .btn-large { padding: 16px 36px; font-size: 16px; }

  /* ─── Hero card ───────────────────────────────────────────── */
  .hero-card-wrap {
    width: 100%;
    max-width: 1080px;
    flex: none;
    height: 680px;
    display: flex;
    flex-direction: column;
    padding: 0 0 80px;
    opacity: 0;
    transform: translateY(20px);
    transition: opacity 0.9s 0.35s ease, transform 0.9s 0.35s ease;
  }
  .loaded .hero-card-wrap { opacity: 1; transform: none; }

  .hero-card {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    border-radius: 14px;
    overflow: hidden;
    border: 1px solid rgba(255,255,255,.10);
    box-shadow: 0 0 0 1px rgba(79,110,247,.12), 0 32px 80px rgba(0,0,0,.5), 0 8px 24px rgba(0,0,0,.3);
  }

  .card-chrome {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 14px;
    background: #161b22;
    border-bottom: 1px solid rgba(255,255,255,.07);
  }

  .chrome-dots { display: flex; gap: 5px; }
  .chrome-dots span {
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }
  .chrome-dots span:nth-child(1) { background: #ff5f57; }
  .chrome-dots span:nth-child(2) { background: #febc2e; }
  .chrome-dots span:nth-child(3) { background: #28c840; }

  .chrome-title {
    flex: 1;
    text-align: center;
    font-size: 11px;
    font-weight: 600;
    color: rgba(255,255,255,.4);
    letter-spacing: 0.02em;
  }

  .chrome-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    color: rgba(255,255,255,.3);
  }

  .chrome-avatars {
    display: flex;
    gap: -3px;
  }

  .chrome-avatar {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 1.5px solid #161b22;
    margin-left: -4px;
    display: inline-block;
  }
  .chrome-avatars .chrome-avatar:first-child { margin-left: 0; }

  /* Split view */
  .card-body {
    flex: 1;
    display: flex;
    min-height: 0;
  }

  /* Left table list panel */
  .card-panel {
    width: 130px;
    flex-shrink: 0;
    background: #f1f5f9;
    border-right: 1px solid #e2e8f0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px 8px;
    border-bottom: 1px solid #e2e8f0;
  }

  .panel-title {
    font-size: 10px;
    font-weight: 700;
    color: #475569;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .panel-count {
    font-size: 10px;
    font-weight: 700;
    color: #94a3b8;
    background: #e2e8f0;
    border-radius: 9px;
    padding: 1px 6px;
  }

  .panel-rows {
    flex: 1;
    overflow-y: auto;
    padding: 4px 0;
  }

  .panel-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 12px;
  }

  .panel-row-selected {
    background: rgba(79,110,247,0.08);
    border-left: 2px solid #4f6ef7;
    padding-left: 10px;
  }

  .row-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .row-dot.occupied { background: #22c55e; }
  .row-dot.open     { background: #94a3b8; }
  .row-dot.selected { background: #4f6ef7; }

  .row-name {
    flex: 1;
    font-size: 11px;
    font-weight: 500;
    color: #334155;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .panel-row-selected .row-name { color: #4f6ef7; font-weight: 600; }

  .row-seats {
    font-size: 10px;
    font-weight: 600;
    color: #334155;
  }
  .row-cap { color: #94a3b8; font-weight: 400; }
  .row-open { color: #94a3b8; font-weight: 500; }

  .panel-footer {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    border-top: 1px solid #e2e8f0;
    background: #f8fafc;
  }

  .pf-stat {
    font-size: 10px;
    color: #64748b;
    white-space: nowrap;
  }
  .pf-num { font-weight: 700; color: #334155; }
  .pf-sep { color: #cbd5e1; font-size: 10px; }

  /* Right canvas */
  .card-canvas {
    flex: 1;
    position: relative;
    background: #f8f9fc;
    overflow: hidden;
  }

  /* Card tabs */
  .card-tabs {
    display: flex;
    gap: 0;
    background: #0f1419;
    border-bottom: 1px solid rgba(255,255,255,.07);
    padding: 0 8px;
  }

  .card-tab {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 8px 12px;
    font-size: 11px;
    font-weight: 500;
    color: rgba(255,255,255,.35);
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    font-family: inherit;
    transition: color .15s, border-color .15s;
    margin-bottom: -1px;
  }
  .card-tab:hover { color: rgba(255,255,255,.65); }
  .tab-active { color: rgba(255,255,255,.9) !important; border-bottom-color: #4f6ef7 !important; }

  .tab-unread {
    background: #4f6ef7;
    color: #fff;
    font-size: 9px;
    font-weight: 700;
    border-radius: 99px;
    padding: 1px 5px;
    line-height: 1.5;
  }

  /* Tab panels */
  .tab-panel {
    flex: 1;
    overflow: hidden;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  /* Reservations tab */
  .tab-res { background: #f8f9fc; display: flex; flex-direction: column; }

  .res-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    border-bottom: 1px solid #e2e8f0;
    background: #f1f5f9;
  }

  .res-toolbar-title { font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.05em; }

  .res-chip {
    font-size: 10px; font-weight: 600; color: #4f6ef7;
    background: rgba(79,110,247,0.1); border-radius: 99px; padding: 2px 8px;
  }

  .res-list { flex: 1; overflow-y: auto; }

  .res-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 11px 16px;
    border-bottom: 1px solid #f1f5f9;
    transition: background .12s;
  }
  .res-row:hover { background: #f1f5f9; }
  .res-row-active { background: rgba(79,110,247,0.04); }

  .res-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }

  .res-info { flex: 1; min-width: 0; }
  .res-name { display: block; font-size: 12px; font-weight: 600; color: #1e293b; }
  .res-meta { display: block; font-size: 10px; color: #94a3b8; margin-top: 1px; }

  .res-date { font-size: 11px; color: #64748b; white-space: nowrap; }

  .res-status {
    font-size: 10px; font-weight: 600; border-radius: 99px;
    padding: 2px 8px; white-space: nowrap;
  }
  .res-approved { background: rgba(34,197,94,0.12); color: #16a34a; }
  .res-planning  { background: rgba(79,110,247,0.1);  color: #4f6ef7; }
  .res-pending   { background: rgba(245,158,11,0.12); color: #d97706; }

  /* Messages tab — dark theme */
  .tab-msgs { background: #0d1117; display: flex; flex-direction: column; }

  .msgs-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    border-bottom: 1px solid rgba(255,255,255,.07);
    background: #0f1419;
  }
  .msgs-title { font-size: 12px; font-weight: 700; color: rgba(255,255,255,.82); }
  .msgs-sub {
    font-size: 10px; font-weight: 600; color: #818cf8;
    background: rgba(79,110,247,.15); border-radius: 99px; padding: 1px 7px;
  }

  .msgs-body { flex: 1; overflow-y: auto; padding: 10px 0; }

  .msg-item {
    display: flex;
    gap: 10px;
    padding: 7px 14px;
  }
  .msg-item-you .msg-content p {
    color: rgba(255,255,255,.55);
  }

  .msg-av {
    width: 24px; height: 24px; border-radius: 50%;
    flex-shrink: 0; display: flex; align-items: center; justify-content: center;
    font-size: 9px; font-weight: 700; color: #fff;
  }
  .msg-av-you { background: #4f6ef7; }

  .msg-content { flex: 1; min-width: 0; }
  .msg-meta { display: flex; gap: 6px; align-items: baseline; margin-bottom: 3px; }
  .msg-author { font-size: 11px; font-weight: 600; color: rgba(255,255,255,.65); }
  .msg-time { font-size: 10px; color: rgba(255,255,255,.22); }
  .msg-text { font-size: 11px; color: rgba(255,255,255,.38); line-height: 1.55; margin: 0; }

  .msgs-compose {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 8px 14px;
    border-top: 1px solid rgba(255,255,255,.07);
    background: #0f1419;
  }
  .msgs-placeholder { font-size: 11px; color: rgba(255,255,255,.18); }
  .msgs-send {
    width: 24px; height: 24px; border-radius: 50%;
    background: #4f6ef7; color: #fff;
    border: none; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: background .15s;
  }
  .msgs-send:hover { background: #3d5ce8; }

  .fp-svg {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: cover;
  }

  /* SVG selection ring / table pulse */
  :global(.sel-ring) {
    animation: selPulse 2.5s ease-in-out 1s infinite;
  }
  :global(.sel-table) {
    animation: selPulse 2.5s ease-in-out 1s infinite;
  }
  @keyframes selPulse {
    0%,100% { opacity: 0.9; }
    50%      { opacity: 0.45; }
  }

  .canvas-label {
    position: absolute;
    bottom: 10px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 6px;
    background: rgba(15,17,23,0.9);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(79,110,247,.3);
    border-radius: 100px;
    padding: 5px 12px;
    font-size: 11px;
    font-weight: 600;
    color: rgba(255,255,255,.7);
    white-space: nowrap;
    opacity: 0;
    animation: labelIn 0.5s ease-out 1.6s forwards;
  }
  @keyframes labelIn {
    from { opacity: 0; transform: translateX(-50%) translateY(8px); }
    to   { opacity: 1; transform: translateX(-50%) translateY(0); }
  }

  .label-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #4f6ef7;
    animation: dotPulse 1.8s ease-in-out infinite;
  }
  @keyframes dotPulse {
    0%,100% { transform: scale(1); opacity: 1; }
    50%      { transform: scale(1.6); opacity: 0.6; }
  }

  /* ─── Trust strip ────────────────────────────────────────── */
  .trust-strip {
    border-top: 1px solid rgba(255,255,255,.06);
    border-bottom: 1px solid rgba(255,255,255,.06);
    padding: 24px 48px;
    display: flex;
    align-items: center;
    gap: 40px;
    overflow-x: auto;
  }

  .trust-label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: rgba(255,255,255,.25);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .trust-logos {
    display: flex;
    gap: 40px;
    flex-wrap: wrap;
  }

  .trust-logos span {
    font-size: 13px;
    font-weight: 700;
    color: rgba(255,255,255,.2);
    letter-spacing: -0.01em;
    white-space: nowrap;
  }

  /* ─── Features section ───────────────────────────────────── */
  .features-section {
    padding: 100px 0;
  }

  .features-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 20px;
  }

  .feature-card {
    --mx: 50%;
    --my: 50%;
    background: #111827;
    border: 1px solid rgba(255,255,255,.07);
    border-radius: 14px;
    padding: 28px;
    position: relative;
    overflow: hidden;
    transition: transform .25s, box-shadow .25s;
  }

  /* Inner spotlight glow that follows cursor */
  .feature-card::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: radial-gradient(280px circle at var(--mx) var(--my), rgba(99,102,241,.11) 0%, transparent 65%);
    opacity: 0;
    transition: opacity .35s;
    pointer-events: none;
  }

  /* Border spotlight — gradient masked to just the border edge */
  .feature-card::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    padding: 1px;
    background: radial-gradient(180px circle at var(--mx) var(--my), rgba(99,102,241,.75) 0%, transparent 65%);
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    opacity: 0;
    transition: opacity .35s;
    pointer-events: none;
  }

  .feature-card:hover { transform: translateY(-2px); box-shadow: 0 16px 48px rgba(0,0,0,.35); }
  .feature-card:hover::before { opacity: 1; }
  .feature-card:hover::after  { opacity: 1; }

  .feature-icon {
    width: 42px;
    height: 42px;
    border-radius: 10px;
    background: rgba(79,110,247,.1);
    border: 1px solid rgba(79,110,247,.2);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #818cf8;
    margin-bottom: 18px;
  }

  .feature-card h3 {
    font-size: 15px;
    font-weight: 700;
    color: #fff;
    margin-bottom: 8px;
  }

  .feature-card p {
    font-size: 13px;
    color: rgba(255,255,255,.45);
    line-height: 1.65;
  }

  /* ─── How it works ───────────────────────────────────────── */
  .how-section {
    padding: 100px 0;
    background: #0a0e16;
  }

  .steps {
    display: grid;
    grid-template-columns: 1fr auto 1fr auto 1fr;
    gap: 0;
    align-items: start;
  }

  .step {
    --mx: 50%;
    --my: 50%;
    background: #111827;
    border: 1px solid rgba(255,255,255,.07);
    border-radius: 16px;
    padding: 28px;
    position: relative;
    overflow: hidden;
    transition: transform .25s, box-shadow .25s;
    cursor: default;
  }

  .step::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: radial-gradient(260px circle at var(--mx) var(--my), rgba(99,102,241,.09) 0%, transparent 65%);
    opacity: 0;
    transition: opacity .35s;
    pointer-events: none;
  }
  .step::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    padding: 1px;
    background: radial-gradient(160px circle at var(--mx) var(--my), rgba(99,102,241,.6) 0%, transparent 60%);
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    opacity: 0;
    transition: opacity .35s;
    pointer-events: none;
  }
  .step:hover { transform: translateY(-3px); box-shadow: 0 16px 48px rgba(0,0,0,.35); }
  .step:hover::before { opacity: 1; }
  .step:hover::after  { opacity: 1; }

  .step-visual {
    margin-bottom: 20px;
    transition: transform .25s;
  }
  .step:hover .step-visual { transform: scale(1.05); }

  .step-num {
    font-size: 34px;
    font-weight: 800;
    letter-spacing: -0.04em;
    background: linear-gradient(135deg, #4f6ef7, #818cf8);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    margin-bottom: 12px;
    line-height: 1;
    transition: filter .25s;
  }
  .step:hover .step-num { filter: brightness(1.3) drop-shadow(0 0 8px rgba(79,110,247,0.5)); }

  .step-content h3 {
    font-size: 16px;
    font-weight: 700;
    color: #fff;
    margin-bottom: 10px;
  }

  .step-content p {
    font-size: 13px;
    color: rgba(255,255,255,.45);
    line-height: 1.65;
  }

  .step-connector {
    width: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-top: 52px;
    flex-direction: column;
    gap: 0;
    align-self: start;
  }
  .connector-line {
    width: 48px;
    height: 1px;
    background: linear-gradient(90deg, rgba(79,110,247,.4), rgba(79,110,247,.1));
  }
  .connector-dot {
    width: 7px; height: 7px; border-radius: 50%;
    background: rgba(79,110,247,.45);
    box-shadow: 0 0 8px rgba(79,110,247,.3);
    margin-left: 40px;
    margin-top: -3.5px;
  }

  /* ─── Stats ──────────────────────────────────────────────── */
  .stats-section {
    background: linear-gradient(180deg, #0a0e16 0%, #0d1117 100%);
    padding: 80px 48px;
  }

  .stats-inner {
    max-width: 900px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0;
  }

  .stat {
    flex: 1;
    text-align: center;
    padding: 0 32px;
  }

  .stat-num {
    display: block;
    font-size: clamp(28px, 4vw, 42px);
    font-weight: 800;
    letter-spacing: -0.03em;
    white-space: nowrap;
    background: linear-gradient(135deg, #fff 0%, rgba(255,255,255,.6) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    margin-bottom: 6px;
  }

  .stat-label {
    display: block;
    font-size: 13px;
    color: rgba(255,255,255,.35);
    font-weight: 500;
  }

  .stat-divider {
    width: 1px;
    height: 48px;
    background: rgba(255,255,255,.08);
    flex-shrink: 0;
  }

  /* ─── Values ─────────────────────────────────────────────── */
  .values-section {
    padding: 100px 0;
  }

  .values-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 24px;
  }

  .value-card {
    --mx: 50%;
    --my: 50%;
    --va: rgba(99,102,241,.09);
    --vb: rgba(99,102,241,.6);
    border-radius: 16px;
    padding: 32px;
    border: 1px solid rgba(255,255,255,.07);
    position: relative;
    overflow: hidden;
    transition: transform .25s, box-shadow .25s;
    cursor: default;
    background: #111827;
  }

  .value-card[data-accent="amber"] { --va: rgba(245,158,11,.08); --vb: rgba(245,158,11,.55); }
  .value-card[data-accent="teal"]  { --va: rgba(20,184,166,.08); --vb: rgba(20,184,166,.55); }
  .value-card[data-accent="purple"]{ --va: rgba(139,92,246,.09); --vb: rgba(139,92,246,.6); }

  .value-card::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: radial-gradient(280px circle at var(--mx) var(--my), var(--va) 0%, transparent 65%);
    opacity: 0;
    transition: opacity .35s;
    pointer-events: none;
  }
  .value-card::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    padding: 1px;
    background: radial-gradient(180px circle at var(--mx) var(--my), var(--vb) 0%, transparent 60%);
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    opacity: 0;
    transition: opacity .35s;
    pointer-events: none;
  }
  .value-card:hover { transform: translateY(-3px); box-shadow: 0 16px 48px rgba(0,0,0,.35); }
  .value-card:hover::before { opacity: 1; }
  .value-card:hover::after  { opacity: 1; }

  .value-icon {
    color: #818cf8;
    margin-bottom: 18px;
  }

  .value-card[data-accent="amber"] .value-icon { color: #f59e0b; }
  .value-card[data-accent="teal"]  .value-icon { color: #14b8a6; }
  .value-card[data-accent="purple"] .value-icon { color: #8b5cf6; }

  .value-card h3 {
    font-size: 16px;
    font-weight: 700;
    color: #fff;
    margin-bottom: 10px;
  }

  .value-card p {
    font-size: 13px;
    color: rgba(255,255,255,.45);
    line-height: 1.65;
  }

  /* ─── CTA ─────────────────────────────────────────────────── */
  .cta-section {
    position: relative;
    overflow: hidden;
    padding: 120px 48px;
    text-align: center;
  }

  .cta-bg {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .orb-cta-1 {
    width: 500px; height: 500px;
    background: radial-gradient(circle, rgba(79,110,247,.20) 0%, transparent 65%);
    top: -100px; left: 50%;
    transform: translateX(-50%);
    animation: orbDrift 10s ease-in-out infinite;
  }
  .orb-cta-2 {
    width: 350px; height: 350px;
    background: radial-gradient(circle, rgba(139,92,246,.15) 0%, transparent 65%);
    bottom: -80px; right: 10%;
    animation: orbDrift 8s ease-in-out 3s infinite reverse;
  }

  .cta-inner {
    position: relative;
    z-index: 1;
    max-width: 600px;
    margin: 0 auto;
  }

  .cta-inner h2 {
    font-size: clamp(28px, 4.5vw, 48px);
    font-weight: 800;
    letter-spacing: -0.03em;
    color: #fff;
    margin-bottom: 16px;
  }

  .cta-inner p {
    font-size: 16px;
    color: rgba(255,255,255,.5);
    line-height: 1.6;
    margin-bottom: 36px;
  }

  /* ─── Footer ─────────────────────────────────────────────── */
  .footer {
    border-top: 1px solid rgba(255,255,255,.06);
    padding: 32px 48px;
  }

  .footer-inner {
    max-width: 1200px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    gap: 40px;
  }

  .footer-brand {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .footer-logo {
    width: 20px;
    height: 20px;
    filter: brightness(0) invert(0.4);
  }

  .footer-name {
    font-family: 'Poppins', sans-serif;
    font-weight: 900;
    font-style: italic;
    font-size: 14px;
    color: rgba(255,255,255,.4);
    letter-spacing: -0.01em;
  }

  .footer-nav {
    display: flex;
    gap: 24px;
  }

  .footer-nav a {
    font-size: 13px;
    color: rgba(255,255,255,.35);
    text-decoration: none;
    transition: color .15s;
  }
  .footer-nav a:hover { color: rgba(255,255,255,.7); }

  .footer-copy {
    margin-left: auto;
    font-size: 12px;
    color: rgba(255,255,255,.2);
  }

  /* ─── Responsive ─────────────────────────────────────────── */
  @media (max-width: 1024px) {
    .hero-inner { padding: 96px 32px 0; gap: 48px; }
    .hero-h1 { font-size: clamp(34px, 5.5vw, 54px); }
    .hero-card-wrap { height: 620px; }
  }

  @media (max-width: 860px) {
    .hero-inner { padding: 80px 24px 0; gap: 40px; }
    .hero-card-wrap { height: 520px; padding-bottom: 56px; }
    .hero-card { margin: 0 auto; }
    /* Hide left panel on smaller screens, let canvas fill */
    .card-panel { width: 100px; }
    .row-seats, .row-cap { display: none; }
    .panel-footer { display: none; }

    .features-grid { grid-template-columns: 1fr 1fr; }
    .values-grid   { grid-template-columns: 1fr 1fr; }

    .steps { grid-template-columns: 1fr; }
    .step-connector { display: none; }

    .trust-strip { gap: 24px; }
    .stats-inner { flex-wrap: wrap; gap: 40px; }
    .stat-divider { display: none; }

    .section-inner { padding: 0 24px; }
    .footer-inner { flex-wrap: wrap; gap: 20px; }
    .footer-copy { margin-left: 0; width: 100%; }
  }

  @media (max-width: 560px) {
    .features-grid { grid-template-columns: 1fr; }
    .values-grid   { grid-template-columns: 1fr; }
    .hero-inner { padding: 72px 20px 0; }
    .hero-card-wrap { height: 440px; padding-bottom: 40px; }
    .section-inner { padding: 0 20px; }
    .stats-section, .cta-section, .footer { padding-left: 20px; padding-right: 20px; }
    .trust-strip { padding: 20px; flex-direction: column; align-items: flex-start; }
    /* On very small screens, hide the card panel entirely */
    .card-panel { display: none; }
    .hero-card { max-width: 100%; }
  }

  /* ─── Interactive panel rows ─────────────────────────────── */
  .panel-row { cursor: pointer; }
  .panel-row:hover:not(.panel-row-selected) { background: rgba(79,110,247,.05); }

  /* ─── Reservation clickable rows ─────────────────────────── */
  .res-row { cursor: pointer; }

  /* ─── Reservation expanded detail ────────────────────────── */
  .res-detail {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 16px 9px 43px;
    background: rgba(79,110,247,.04);
    border-bottom: 1px solid #edf0f9;
    animation: detailSlide 0.16s ease;
  }
  @keyframes detailSlide {
    from { opacity: 0; transform: translateY(-4px); }
    to   { opacity: 1; transform: none; }
  }
  .res-detail-contact { font-size: 11px; flex: 1; color: #64748b; }
  .res-detail-btn {
    font-size: 10px; font-weight: 600; color: #4f6ef7;
    background: none; border: none; cursor: pointer; padding: 0;
    font-family: inherit; white-space: nowrap;
  }
  .res-detail-btn:hover { text-decoration: underline; }

  /* ─── Messages compose input ──────────────────────────────── */
  .msgs-input {
    flex: 1;
    min-width: 0;
    background: none;
    border: none;
    outline: none;
    font-size: 11px;
    color: rgba(255,255,255,.8);
    font-family: inherit;
    caret-color: #4f6ef7;
  }
  .msgs-input::placeholder { color: rgba(255,255,255,.18); }
</style>
