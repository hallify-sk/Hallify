import { fail } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { dbFirst } from '$lib/db/index';
import { requirePlatformAdmin } from '$lib/guards';
import { st } from '$lib/i18n-server';
import {
  DEFAULT_ANALYTICS,
  GTM_PATTERN,
  loadPlatformAnalytics,
  writePlatformSetting
} from '$lib/server/platform-settings';
import type { PageServerLoad, Actions } from './$types';

/**
 * Settings for Hallify itself.
 *
 * Everything on this page applies across the whole platform — the marketing
 * site, every organisation's console, and (where explicitly opted in) the public
 * venue sites. It is the home for the settings that have nowhere else to live;
 * until now the only way to change any of them was a redeploy.
 */
export const load: PageServerLoad = async ({ locals }) => {
  // Its own guard. The platform layout gates navigation only, and the action
  // below is reachable by direct POST without it ever running.
  requirePlatformAdmin(locals);

  const analytics = await loadPlatformAnalytics(locals.db);

  const meta = await dbFirst<{ updated_at: string; email: string | null }>(
    locals.db,
    `SELECT ps.updated_at, u.email
       FROM platform_settings ps
       LEFT JOIN users u ON u.id = ps.updated_by
      WHERE ps.key = 'analytics'`
  ).catch(() => null);

  const envContainer = (env.GTM_CONTAINER_ID ?? '').trim().toUpperCase();

  return {
    analytics,
    // Shown so an admin can tell whether a blank field means "off" or "still
    // running on whatever the deployment was configured with".
    envContainer: GTM_PATTERN.test(envContainer) ? envContainer : '',
    updatedAt: meta?.updated_at ?? null,
    updatedBy: meta?.email ?? null
  };
};

export const actions: Actions = {
  saveAnalytics: async ({ request, locals }) => {
    requirePlatformAdmin(locals);
    const data = await request.formData();

    const raw = String(data.get('containerId') ?? '').trim().toUpperCase();
    if (raw && !GTM_PATTERN.test(raw)) {
      return fail(400, { error: st(locals.locale).serverErrors.invalidGtmId });
    }

    // Measuring on a venue's own domain is a decision with a legal shape, not
    // just a technical one, so it is a separate explicit opt-in rather than
    // something that follows from setting a container id.
    const includeBubbles = data.get('includeBubbles') === 'on';

    await writePlatformSetting(
      locals.db,
      'analytics',
      { ...DEFAULT_ANALYTICS, containerId: raw, includeBubbles },
      locals.user?.id ?? null
    );

    return { saved: true };
  }
};
