/** Build-time feature flags.
 *
 *  These gate whole features at the route level, not just in the UI. A flag that only
 *  hid buttons would leave the underlying routes and form actions reachable by URL.
 */

/** RSVP — guest invitations, the public response form, seating-editor integration,
 *  and reusable RSVP templates.
 *
 *  OFF for v1 (decided 2026-08-01). The feature is built but not shipping; it may
 *  return later, so the code stays in the tree rather than being deleted.
 *
 *  Flipping this to `true` re-enables, in one step:
 *    - `/rsvp/[code]`                              public response form (load + submit)
 *    - `/app/reservation/[id]/rsvp-editor`         staff RSVP designer (load + actions)
 *    - `/app/manage/rsvp-templates` (+ `/[id]`)    template CRUD
 *    - the sidebar "RSVP templates" link
 *    - the RSVP panel on the staff reservation page and in FloorplanViewer
 *
 *  Marketing copy is NOT wired to this flag. While RSVP is off it is kept out of the
 *  plan feature lists in `plans.ts` (also the Stripe product description) and the
 *  landing hero, "how it works" and pricing copy in `i18n.ts` — add it back there
 *  when it ships.
 *
 *  Before turning it back on, note that the RSVP form collects allergies/dietary
 *  requirements — Article 9 health data. That needs an explicit lawful basis (consent
 *  captured at the form) plus matching wording in the Privacy Policy and in the DPA's
 *  data categories. See the header note in `src/lib/legal.ts`.
 */
export const RSVP_ENABLED = false;
