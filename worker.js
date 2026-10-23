// The Worker's entry (wrangler.toml `main`). SvelteKit's generated Worker serves every
// request, pages and static assets alike; this file only adds the Cron Trigger's
// `scheduled` handler. See src/lib/server/scheduled.ts.
//
// The import below exists only after `vite build`, which every deploy script runs first.
import app from './.svelte-kit/cloudflare/_worker.js';
import { withScheduled } from './src/lib/server/scheduled.ts';

export default withScheduled(app);
