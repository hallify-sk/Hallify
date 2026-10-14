# Hallify: one brand, two clear journeys

The redesign should make Hallify useful to people choosing an event venue while giving venue operators a distinct, credible reason to adopt its management tools. Recommend **Atlas as the starting direction**, with Spatial's floorplan interaction incorporated into venue detail pages. The public map is the new entrance; the operator product remains the business behind it.

These are six interactive design prototypes: three visual directions, each with a public and a business experience. They use demonstration content. They do not represent live venue inventory, confirmed availability, current commercial offers or a production booking system.

## What the meeting establishes

Source: `meeting 9.10..txt`, meeting dated 9 October 2026. Timestamps below refer only to the Hallify business discussion; unrelated personal material is excluded.

| Meeting evidence | Design consequence |
| --- | --- |
| **14:46–15:39:** visitors choose an occasion and location, then inspect venue capacity, facilities, photos and contact details. | Lead with “Čo plánujete?” and “Kde?”. Make useful results reachable before signup. |
| **18:42–19:19:** clearer pricing, dimensions and guest-count estimates could differentiate Hallify. | Put capacity, layout and price basis beside the venue. Label estimates and avoid implying a confirmed quote. |
| **19:49–20:30:** the public marketplace/map is discussed alongside the existing operator service, including whether to launch earlier. | Separate the public discovery journey from operator acquisition without creating separate brands. |
| **21:22; 28:13–29:24:** businesses could remain on other directories while adopting Hallify for richer profiles, venue planning and management. | Sell additional value with “Zviditeľnite svoj priestor” and “Spravujte svoje rezervácie”; avoid exclusivity messaging. |
| **28:48–30:57:** the directory could include businesses that are not customers, with richer information for cooperating venues. | Distinguish “Partner Hallify” from a basic directory entry. A listing must not imply a commercial relationship. |
| **29:50:** the meeting explicitly leaves source-data reuse for further investigation. | Treat sourcing and permission decisions as a separate launch dependency. Prototypes use illustrative content and do not import a competitor directory. |
| **31:41–32:43:** venue discovery and resulting enquiries could support the sales story. | Plan measurement for venue views, contact actions and submitted enquiries. Demonstration metrics must stay clearly labelled. |
| **38:15–38:48:** multi-day events are discussed; calculable bookings may get estimates, other cases need a direct conversation. | Keep multi-day support as a later scope decision. Use “Cena na vyžiadanie” when a reliable estimate is unavailable. |
| **38:58–39:34:** calendar accuracy differs between ordinary directory entries and cooperating venues. | Explain the source of availability; a directory entry must not display an authoritative booking calendar. |
| **39:40–39:57:** partners should be distinguishable on the map. | Use both a text badge and a distinct pin treatment. Colour alone is insufficient. |
| **40:49–41:13:** the map and a review of product readiness are identified as next steps. | Make discovery tangible now; validate which operational capabilities can be promised at launch. |

The discussion contains proposals rather than a complete specification. In particular, exact partner privileges, commercial terms, launch inventory, advertising rules and availability guarantees remain undecided.

## Proposed information architecture

These are **future routes**, not changes to the application's current routing.

| Proposed route | Purpose | Primary action |
| --- | --- | --- |
| `/` | Public introduction, occasion/location search, selected venues and an obvious operator entrance. | **Nájsť priestor** |
| `/priestory` | Synchronized map and results; location, occasion, capacity and relevant facility filters. | **Pozrieť priestor** |
| `/priestory/[slug]` | Photos, capacity, facilities, dimensions/layout, pricing basis, contact or partner enquiry flow. | **Overiť termín** or **Kontaktovať priestor**, according to data quality |
| `/pre-prevadzkovatelov` | Explain discovery plus management: enquiries, reservations, calendar, seating and client communication. | **Vyskúšať Hallify** |

Keep **Hľadám priestor / Pre prevádzkovateľov** visible in the main navigation. Each audience gets a complete page and its own primary action; the switch must not leave visitors guessing which product they are viewing. On mobile, retain a clear map/list switch and a usable result list. Existing customer booking portals and authentication routes require a separate implementation plan.

## Three paired directions

| Direction | Public experience | Business experience | Interaction and tradeoff |
| --- | --- | --- | --- |
| **01 · Atlas** | Bright, practical venue finder with a prominent search, map and informative venue cards. | A clear operational workspace: calendar, enquiries and seating alongside the discovery proposition. | Linked map pins and cards, useful filters and product tabs. Best starting point for comprehension, scalability and everyday use. |
| **02 · Occasion** | Editorial hospitality direction: generous photography, warm typography and occasion-led exploration. | A hospitality story that follows an event from first enquiry to a prepared room. | Changing occasions updates the content; focused gallery and workflow interactions. Strong emotional appeal; depends more on consistent venue photography. |
| **03 · Spatial** | An architectural view of a venue: visitors explore capacity and layout before choosing. | A precise planning environment that demonstrates how a team manages a room and its event. | Restrained spatial model, layout selection and meaningful state changes. Distinctive product demonstration; requires a clear conventional fallback on small screens. |

All six should retain Hallify's recognizable identity, readable Slovak copy and obvious audience routing. Differences should be structural and experiential, beyond a palette change.

## Recommended direction

Start with **Atlas public + Atlas business**, then borrow Spatial's room/layout demonstration for a venue detail page or a focused business section. This gives the map the central role discussed in the meeting and makes Hallify's operational advantage tangible without asking every visitor to manipulate a 3D scene.

Use motion to explain selection, reveal a connected result or show a layout change. Prefer short transitions and user-controlled interaction. Decorative motion must not delay search or contact, intercept scrolling, or continue when reduced motion is requested. A readable flat layout must work without 3D support.

Occasion is a strong alternative if hospitality presentation becomes the primary acquisition story and good venue photography is available consistently.

## Launch scope and later opportunities

| First launch recommendation | Later, after the foundations are validated |
| --- | --- |
| A focused public directory with useful location/capacity/occasion filters and a synchronized map/list. | Broader geographic coverage, saved shortlists and comparisons. |
| Honest basic venue profiles with contact information, data provenance and corrections. | Automated enrichment and a venue-owner claim/update workflow. |
| Explicit partner and directory-only states. | Commercial promotion controls, clearly labelled **Sponzorované** when paid placement is introduced. |
| A separate operator page demonstrating current reservations, calendar, floorplan/seating, messaging and add-ons. | Expanded workflows, integrations and validated feature additions. |
| Clear price basis and an enquiry path when pricing cannot be calculated. | Reliable multi-day estimates and broader event duration support. |
| Availability wording that reflects the actual source and freshness of data. | Stronger availability guarantees once the necessary synchronization and operational rules exist. |
| Instrument venue views, contact clicks and completed enquiry submissions. | Operator reporting based on accumulated real data and an agreed lead definition. |

The current repository already contains venue management, seating and enquiry-related building blocks. It does not establish that the public map, geographic search, reliable global availability or multi-day pricing are production-ready. RSVP is currently parked in the product and should not lead the launch promise without a separate decision.

## Listing and commercial clarity

**Partner Hallify:** an explicitly participating venue. Show the badge on both the card and the selected map pin. Expose only the booking, pricing and calendar capabilities that the venue actually maintains. Partner status is not automatically verification, a quality award or sponsored placement.

**Directory-only:** a venue listed for discovery. Use neutral presentation and a direct contact action. Do not imply that the business uses Hallify, accepts reservations through it or keeps a calendar there. Unknown data should be stated as unknown.

For prices, use **Orientačná cena**, **Od …** with a clear basis, or **Cena na vyžiadanie**. Where an estimate exists, show the guest count and included items that produced it. Keep this separate from the operator's Hallify subscription price.

For dates, use **Overiť termín u prevádzkovateľa** when the source is not authoritative. Do not turn an enquiry or an expression of interest into a confirmed reservation. Contact clicks are contact actions; only a defined and completed enquiry should be reported as an enquiry.

## Review the six prototypes

Apply the same tasks to each direction's public and business variant. The checklist is for review, not a claim that every prototype contains a complete production flow.

- **Audience clarity:** within five seconds, can a new visitor tell whether the page is for finding a venue or running one? Switch audiences and back without losing orientation.
- **Public task:** select an occasion and capacity; inspect results; select a venue on the map and from its card. Confirm that the selected venue and visible details agree. Try a filter combination with no results and reset it.
- **Listing trust:** inspect a partner and a directory entry. Their relationship, contact action, price basis and availability confidence should be understandable without relying on colour.
- **Business task:** use the main interactive demonstration. Explain what changed and how the tool helps manage an actual enquiry, reservation or room layout. Confirm that the next action is concrete.
- **Mobile:** review near 390 px wide. Check navigation, filter controls, map/list access, card details and primary actions for clipping or difficult touch targets.
- **Keyboard and motion:** reach controls with Tab; activate them with a keyboard; check visible focus. Enable reduced motion and ensure content remains accessible with no essential information hidden in an animation.
- **Truthful content:** identify every illustrative venue, price, metric and testimonial. Do not allow demonstration content to appear as live inventory or proven performance.
- **Professional polish:** check text contrast, long Slovak labels, layout stability and whether motion supports the task. Prefer the direction that remains clear after the novelty wears off.

Choose the strongest public journey and the strongest business journey separately, then check their brand coherence together. Record what should carry into implementation rather than treating an entire concept as indivisible.
