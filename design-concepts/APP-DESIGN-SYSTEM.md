# Hallify app design system

The design language established on the landing page (`src/lib/marketing/marketing.css`),
restated as the contract for the **application** UI (`src/app.css` + every `.svelte`
component and route outside `src/lib/marketing/`).

This is the single source of truth. When page code and this document disagree, this
document wins.

---

## 1. The one rule that matters most

The accent **`#f05ca1` is a fill colour, not a text colour.**

| Pairing | Ratio | Verdict |
|---|---|---|
| `#f05ca1` text on `#f9f9f7` | 3.11:1 | ✗ fails AA |
| `#ffffff` text on `#f05ca1` | 3.11:1 | ✗ fails AA |
| `#27131c` text on `#f05ca1` | 5.64:1 | ✓ — what the landing page uses |
| `#a6225e` text on `#f9f9f7` | 6.61:1 | ✓ — the accent *text* colour |

The old app accent (`#4f6ef7`) worked as both fill and text. The new one does not.
Three distinct tokens therefore replace the single old `--accent`:

```
--accent            #f05ca1   fills, bars, active pills, borders, focus rings
--accent-ink        #a6225e   accent TEXT and icons sitting on a light background
--accent-contrast   #27131c   text/icons sitting ON an --accent fill
```

### Mechanical conversion rules

| Old | New |
|---|---|
| `color: var(--accent)` | `color: var(--accent-ink)` |
| `fill`/`stroke: var(--accent)` on an icon over page bg | `var(--accent-ink)` |
| `background: var(--accent)` | unchanged |
| `border-color: var(--accent)` | unchanged |
| `color: #fff` **on an `--accent` fill** | `color: var(--accent-contrast)` |
| `color: #fff` on a `--danger`/`--success`/`--warning` fill | `var(--on-danger)` / `var(--on-success)` / `var(--on-warning)` |
| `background: var(--accent-dim)` + `color: var(--accent)` | keep bg, text → `var(--accent-ink)` |

`--accent-ink` and `--accent-contrast` are defined per theme *and* recomputed by the
org-branding override in `src/routes/+layout.svelte`, so a white-label org that sets a
dark brand colour still gets readable text. Never hardcode `#a6225e` / `#27131c` in a
component — always go through the token.

---

## 2. Colour tokens

Existing token **names are preserved** so the ~2 500 existing `var(--…)` references keep
working; only their values change. New names are additive.

### Light — "paper" (`:root`, theme id `slate`)

```
--bg-base         #f9f9f7   page background (warm paper)
--bg-panel        #fefefd   card / panel surface
--bg-panel2       #f3f4f0   inset surface, table headers, inputs
--bg-hover        #eef0eb   hover wash  (= landing --subtle)
--border          #dfe2dd   hairline    (= landing --line)
--border-subtle   #eceee9   faintest divider

--accent          #f05ca1
--accent-ink      #a6225e
--accent-contrast #27131c
--accent-dim      #fce5ef   soft tint background (= landing --accent-soft)
--accent-hover    #e54a93

--text-base       #202322   (= landing --ink)
--text-muted      #686d68   (= landing --muted)
--text-subtle     #878f87

--danger   #c3362c   --danger-dim   #fbeeec   --on-danger  #ffffff
--success  #2f7a52   --success-dim  #ecf5ef   --on-success #ffffff
--warning  #955f10   --warning-dim  #faf2e4   --on-warning #ffffff
```

### Dark (`[data-theme="dark"]`)

```
--bg-base   #181c1a   --bg-panel  #222723   --bg-panel2 #272d28
--bg-hover  #2d342e   --border    #384038   --border-subtle #2a312b

--accent    #f05ca1   --accent-ink #f58cba  --accent-contrast #27131c
--accent-dim #402933  --accent-hover #f372ae

--text-base #f0f3ee   --text-muted #acb4ac  --text-subtle #78817a

--danger  #f0867c  --danger-dim  #38201d  --on-danger  #2a1512
--success #6cc292  --success-dim #17291f  --on-success #0c1a11
--warning #e0a850  --warning-dim #332815  --on-warning #241a08
```

### Warm (`[data-theme="warm"]`)

A terracotta sibling of the same system — same structure, warmer hues. See `app.css`.

Status colours stay usable as text on their `-dim` tint in every theme. As a solid fill
they need `--on-*` for their label: the light themes make the fill dark (white reads on it),
the dark theme inverts it to pale (white does not). The accent has the same split, under
the `--accent-ink` / `--accent-contrast` names.

---

## 3. Typography

Inter variable, self-hosted. The landing page uses the in-between weights a variable
font makes available — the app must too. **Do not use 700/800/900** outside the Poppins
wordmark.

| Old app weight | New |
|---|---|
| 400 | 400 |
| 500 | 500 |
| 600 (headings) | **550** |
| 600 (labels, buttons, UI chrome) | **600** |
| 700 | **650** |
| 800 / 900 | **650** |

Negative tracking on headings is a signature of the language — do not skip it:

```
h1 / page title   clamp(28px, 3.2vw, 40px)   550   -.055em
h2 / section      20–24px                    550   -.045em
h3 / card title   15–17px                    600   -.03em
body                       13–14px           400   0
small / meta               10–12px           400   0        colour: --text-muted
```

**Eyebrow** (the uppercase overline above a page title) is a core motif:

```css
font-size: 10px; font-weight: 650; text-transform: uppercase;
letter-spacing: .13em; color: var(--accent-ink);
```

**Use it sparingly.** The landing page has about four per page, each introducing a major
section. It is not the style for every small uppercase label — nav group headings,
dropdown headers, table column headers and panel titles take `var(--text-muted)`. Painting
all of them accent-ink floods the UI with pink and the motif stops meaning anything.
A tinted pill (`background: var(--accent-dim)` + `color: var(--accent-ink)`) is a
different thing — that is an accent badge, and it is fine.

Prose line-height is generous: `1.75`–`1.9` for lead/body paragraphs, `1.4`–`1.5` for
dense table and list rows.

---

## 4. Shape

**The language is near-square.** This is the single easiest thing to get wrong, because
`marketing.css` declares generous radii early on and then reverses them. At line 1441:

```css
/* One architectural language for discovery, the map and venue operations. */
.marketing { --radius: 3px; }
.marketing .primary, .search-form, .map-panel, .bridge, .venue-photo, .empty-state {
  border-radius: 3px;
}
```

That override supersedes the 8px buttons, 12px photos, 16px cards and 24px panels
written above it. Read the whole file before trusting any radius in it.

```
--radius-sm   3px    buttons, inputs, chips, badges, small controls
--radius      3px    panels, list rows, menus, cards
--radius-lg   4px    dialogs, popovers, large panels
--radius-xl   6px    the rare largest container
50%                  circles only — avatars, round icon buttons
```

Radii go **down**, not up: `8px → 3px`, `12px → 4px`, `24px → 6px`. Pills (`99px`) become
`3px` too — the landing squares its own filter chips at line 1465. The only shapes that
stay curved are true circles (`50%`) and physical-metaphor controls: toggle switches,
sliders, progress bars, avatars, status dots.

**Exception — RSVP decorative styles.** The `.rsvp-style-*` variants on the guest-facing
RSVP page (elegant, romantic, minimal, festive, classic, modern) are templates an
organiser picks, not app chrome. They keep their own distinct radii (24/28/4/50/8/0) and
must not be flattened into this scale, or they all collapse into the same look.

## 5. Elevation

Shadows are soft, wide and green-tinted — never the hard grey drop shadow of the old UI.

```
--shadow-xs  0 1px 2px   rgba(41,54,33,.04)
--shadow-sm  0 2px 8px   rgba(41,54,33,.05)
--shadow     0 12px 36px rgba(41,54,33,.07)
```

Prefer a `1px solid var(--border)` hairline over a shadow for anything that sits flat on
the page. Reserve shadows for things that genuinely float: dropdowns, dialogs, popovers.

---

## 6. Controls

### Primary button — `.btn-action`

```css
background: var(--accent);
color: var(--accent-contrast);
border-radius: var(--radius-sm);
padding: 10px 20px;
font-size: 13px;
font-weight: 650;
transition: transform .2s, background .2s;
```
Hover **lifts**: `transform: translateY(-2px)`. That lift is the signature interaction of
the language — apply it to primary actions everywhere.

### Secondary — `.btn-outline`
Transparent background, `1px solid var(--border)`, `color: var(--text-base)`,
same radius and padding. Hover: `background: var(--bg-hover)`.

### Chip / filter — `.chip`
`border-radius: 99px`, `1px solid var(--border)`, transparent, `font-size: 11px`.
Selected state inverts to ink, exactly as the landing page's `.occasion-filter`:
`background: var(--ink); color: var(--bg)` → in app tokens
`background: var(--text-base); color: var(--bg-panel)`.

### Inputs
`background: var(--bg-panel2)`, `1px solid var(--border)`, `border-radius: var(--radius-sm)`.
Focus: `border-color: var(--accent)` + `box-shadow: 0 0 0 3px var(--accent-dim)`.

### Focus-visible (keyboard)
`outline: 2px solid var(--accent-ink); outline-offset: 2px`.
The landing uses 3px/4px; the app's density calls for the tighter pair. Never remove the
outline without replacing it.

---

## 7. Motion

`transition: transform .2s` for lifts, `.15s` for colour changes. Cards that contain a
photo scale it on hover (`transform: scale(1.04)`, `transition: transform .5s`).
Everything must respect `prefers-reduced-motion: reduce`.

---

## 8. Conversion checklist (per file)

1. `color: var(--accent)` → `var(--accent-ink)`; `#fff` on accent fill → `var(--accent-contrast)`.
2. Replace hardcoded hex with tokens. Old-palette hexes that must be gone:
   `#4f6ef7 #3d5ce8 #818cf8 #6366f1 #7c3aed #eef1fe #f3f4f6 #e3e6ed #111827 #6b7280 #9ca3af`
   plus slate-family greys `#0f172a #1e293b #334155 #475569 #64748b #94a3b8 #cbd5e1 #e2e8f0 #f1f5f9`.
   Stock status hexes (`#ef4444 #dc2626 #22c55e #16a34a #f59e0b #b45309 #92400e`) → the
   `--danger/--success/--warning` tokens.
3. Font weights: 600→550 on headings / 600 on UI chrome, 700→650, 800/900→650.
4. Add negative tracking to headings per §3.
5. Radii up per §4; shadows softened per §5.
6. Primary buttons get the hover lift.
7. Keep **all** markup, props, logic, `data-*`, ARIA and i18n keys untouched. This is a
   restyle, not a refactor — no behaviour changes.
