# Discovery fixes (fix/discovery)

| id | status | note |
|----|--------|------|
| B4 | done | Venue cards and the venue page send "Rezervovať" to the booking page on the venue's own site (custom domain or org subdomain); old /app/halls/<id>/book redirects there. |
| B13 | done | Search matches every word of the query in name or address, diacritics-insensitive; a geocoded query widens results (text OR area) instead of filtering them; the area filter starts off. |
| B38 | done | On phones the explorer is a normal scrolling page: map on top at a fixed share of the screen, then search, filters and all results in flow (no inner scroll box, no fixed-height shell). |
| B45 | partial | All operator-page sign-up links preselect "Prevádzkujem priestor" (intent=operator) and name the chosen plan (plan=<id>). Carrying the plan on through registration and org creation needs the register/org pages (accounts team), which do not read it yet. |
| B71 | done | Apex venue page names built-in and custom amenities (org_amenities labels); unknown keys are dropped. |
| B73 | done | Directory lists a hall only when public, live, with a slug and an address or a map position (LISTED_HALL_SQL). |
| B75 | done | Booking CTA only for halls that take bookings; otherwise a "no online booking" note. |
| B76 | done | Apex pages and the sitemap use the listing rule (plan lock, archive, org suspension); venue site list/detail and its sitemap hide plan-locked halls. |
| B125 | partial | Code side done (same listing gate as B73). Removing the three test venues on production is the owner's call. |
| B126 | done | Venue links go to indexable /priestory/<org>/<hall>; "Detail" is a link; /app/halls/* redirect there. |
| B163 | done | Marketing theme choice is kept for the visit (module state) and in a cookie the page loads read, so it survives navigation and reloads without a flash; <html lang> follows chooseLocale and the marketing shell. |
| M19 | done | Indexable venue page with canonical, hreflang, og:image, JSON-LD EventVenue; og:image on marketing pages; canonical/OG on venue sites (VenueSiteMeta in the halls layout); venue pages in the apex sitemap. |
| I33 | done | One robots group, Allow /uploads/halls/, client pages disallowed on venue sites; lastmod from halls.updated_at (migration 0020, trigger-maintained). |
