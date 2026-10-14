# Selected Hallify redesign

The selected direction is now implemented in the SvelteKit application:

- `/`: Atlas customer composition with real OpenStreetMap geography and Leaflet interaction.
- `/pre-prevadzkovatelov`: Shared architectural visual language, Atlas business narrative, a working inquiry/calendar/messaging demo, side-by-side profile comparison, and existing plan/signup flows.
- `/priestory`: full-viewport map explorer with a searchable left sidebar, capacity/amenity/floorplan/booking filters, linked list/pin selection, and a 10/25/50/100 km nearby filter.
- All public marketing pages share the same charcoal/pink palette, sharp corners, SK/EN, keyboard interaction, reduced motion and theme switching.
- The 3D marketing model was removed. The profile comparison now shows both tiers at once and highlights eight concrete capability groups.

The original concept files remain as references. The live application is the selected implementation.

## Venue data and map placement

The homepage reads actual public halls. Private halls, halls locked by a plan downgrade and suspended organizations are excluded. A hall's globally unique ID is used for its detail URL because slugs are unique only inside an organization.

Operators can set a position in the venue's public profile settings by clicking the map, dragging its marker, or entering coordinates. Both coordinates must be present and valid; both can be cleared. Addresses are never automatically guessed or geocoded. A venue without coordinates remains in the list and does not get a fabricated map pin.

Map tiles come directly from `https://tile.openstreetmap.org/{z}/{x}/{y}.png`; Leaflet is bundled locally. Attribution stays visible and normal browser caching/referrer behavior is preserved. Only the tile-image host is added to the existing CSP. The map reports tile failures while venue details remain usable.

The business inquiry, calendar, messaging and profile comparison are explicitly labeled examples. The public map and listings use real hall records. Basic-versus-partner profiles remain an illustration of the directory roadmap, rather than a new subscription entitlement. Subscription amounts and limits come from `src/lib/plans.ts`.

## Database migration and release

Migration `0004_hall_coordinates.sql` adds optional latitude/longitude columns with geographic range constraints and a public-location index. Migration `0005_hallify_partners.sql` adds an explicit organization partner flag, defaulting to false. Both have been applied locally. Apply the migrations to the target database before deploying this version:

```sh
# Development deployment
npm run migrate:dev
npm run deploy:dev

# Production deployment
npm run migrate:prod
npm run deploy:prod
```

No remote migration or deployment was performed. Add coordinates to published venue profiles to populate their markers.

Leaflet installation uses `--legacy-peer-deps` because the repository already combines adapter-cloudflare 4 with Wrangler 4, while that adapter declares a Wrangler 3 peer requirement. No adapter or Wrangler upgrade was included.

## Validation

- Svelte/TypeScript check: zero errors, existing application warnings remain.
- Production build succeeds.
- All 51 tests pass, including coordinate validation, geodesic demo positions within 50 km, longitude wrapping, combined discovery filters, partner-only eligibility and nearest-three ranking.
- SQLite migration-chain and visibility checks confirm private, plan-locked and suspended records are excluded.
- Homepage, explorer and business routes return HTTP 200 in SK and EN. Explorer and business pages appear in the sitemap. Geolocation is enabled for self only on the homepage and explorer; other routes retain their denial policy.
- Browser review was blocked by the browser permission policy because local preview access was declined. Responsive rules and interactions were reviewed in source; visual rendering and live tile loading still need browser review.

Local preview: `npm run dev -- --host 127.0.0.1 --port 5173`.

## Demo pins and nearby discovery

Seven clearly labeled demo venues are enabled in local development. On a production build, enable them explicitly with `?demo=1` or the demo toggle. They are generated in browser/application memory, never inserted into the database, and their detail preview cannot create a reservation. Without location permission they sit around Prague; with a location fix they are regenerated at distances of 3-42 km around the user.

The “Use my location” control requests browser permission and frames approximately a 50 km radius. An already-granted permission is reused on an unfiltered discovery page. Denied, unavailable and timeout states leave the map and city search usable. Location coordinates stay in client memory and are not put in URLs, analytics or persistent storage; normal tile requests naturally reveal the viewed map area to the tile service.

The map theme picker offers the original colour street map, light monochrome, dark monochrome, and matching the website theme. Light is the default for legibility; the selected map style is remembered locally. Pins, controls, attribution and venue detail panels retain the shared interface palette, independent of the selected geographic style. Attribution remains readable and is not filtered with the tiles. Colour filters apply to individual tile images rather than the transformed tile pane, and the loading background follows the geographic theme, independently of the website theme.

Trackpad navigation supports two-finger panning and fractional pinch zoom anchored at the pointer. Pinch events use Leaflet’s debounced animated wheel handler instead of resetting the view every animation frame, retaining visible tiles during zoom. Tile levels update at the end of animated zoom; reduced motion disables animation. It starts enabled in the full-screen explorer. On the homepage, click the map or its hand control to activate it; the hand control also releases map scrolling. Before activation, normal scrolling continues through the page. Touch dragging/pinching, keyboard navigation and zoom buttons remain available.

## Featured partners and search

The initial customer and explorer lists show up to three featured partner venues, followed by the remaining venues without duplicates. Only organizations explicitly marked as Hallify partners are eligible. Candidates need saved coordinates and are ranked by distance from the viewer’s permitted location, falling back to the default map center if location is unavailable. Searching or setting a feature/capacity filter changes the list to a single set of matching search results. Resetting restores the discovery groups.

Platform admins can set partner status on the organization detail page. The partner flag is independent of paid subscription level, cannot be enabled by venue staff, and defaults to false for all existing organizations. Demo venues deliberately contain both partner and nonpartner examples. No live organizations were designated as partners during implementation.

Select elements now share styled fields and chevrons, marketing actions use Tabler SVG icons instead of diagonal arrow glyphs, and the guest-count field has space below its label. Pricing copy uses “2 členi tímu”, “Vytvoriť účet”, “Dohodnúť konzultáciu”, and “Plán, ktorý sedí vašej prevádzke.”

The homepage “Nájsť priestor” form navigates to `/priestory`, preserving the city/venue query, guest count, floorplan filter, demo visibility and language. The “Všetky priestory” map link uses the same selection. The destination initializes its filters from the URL, including on direct visits or reloads.

The “V mojom okolí” / “Around me” button toggles the nearby radius filter on and off. Disabling it restores venues outside the radius, removes the radius overlay and clears the active control styling while retaining the approximate location in memory. Trackpad panning uses a 1.8× movement multiplier; pinch zoom uses Leaflet’s 40 ms debounce and 60 pixels per zoom level.
