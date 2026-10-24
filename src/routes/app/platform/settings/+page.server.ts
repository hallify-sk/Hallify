import { fail } from '@sveltejs/kit';
import { normaliseServerUrl } from '$lib/analytics-servers';
import { env } from '$env/dynamic/private';
import { dbFirst } from '$lib/db/index';
import { requirePlatformAdmin } from '$lib/guards';
import { st } from '$lib/i18n-server';
import {
  DEFAULT_ANALYTICS,
  GTM_PATTERN,
  loadPlatformAnalytics,
  loadPlatformMcp,
  writePlatformSetting
} from '$lib/server/platform-settings';
import { DEFAULT_AI, MODEL_PRICES, AI_MODEL, AI_REASONING_EFFORT, loadAiPlatform, costUsdMicro, toMilliCredits } from '$lib/server/ai/pricing';
import { aiConfigured } from '$lib/server/ai/openai';
import { logPlatformAction } from '$lib/server/platform-audit';
import { publicMcpUrl } from '$lib/server/mcp/http';
import { countLiveConnections } from '$lib/server/mcp/connections';
import type { PageServerLoad, Actions } from './$types';

/**
 * Settings for Hallify itself.
 *
 * Everything on this page applies across the whole platform — the marketing
 * site, every organisation's console, and (where explicitly opted in) the public
 * venue sites. It is the home for the settings that have nowhere else to live;
 * until now the only way to change any of them was a redeploy.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
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

  const ai = await loadAiPlatform(locals.db);
  // What an ordinary turn costs an organisation at these settings: a few thousand
  // tokens of instructions, tools and history in, a short answer out.
  const typicalTurnMc = (model: string) =>
    toMilliCredits(costUsdMicro(model, { input_tokens: 6000, cached_tokens: 0, output_tokens: 600 }), ai);

  // The MCP server's own switch (separate from the in-app assistant's).
  const mcp = {
    ...(await loadPlatformMcp(locals.db)),
    url: publicMcpUrl(url, env.HALLIFY_DOMAIN ?? 'hallify.app', env.APP_URL),
    active: await countLiveConnections(locals.db)
  };

  return {
    mcp,
    ai,
    aiConfigured: aiConfigured(),
    model: { id: AI_MODEL, effort: AI_REASONING_EFFORT, ...MODEL_PRICES[AI_MODEL], turnCredits: typicalTurnMc(AI_MODEL) / 1000 },
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
    const rawServer = String(data.get('serverUrl') ?? '').trim();
    const serverUrl = normaliseServerUrl(rawServer);
    if (rawServer && !serverUrl) return fail(400, { error: st(locals.locale).serverErrors.invalidServerUrl });

    await writePlatformSetting(
      locals.db,
      'analytics',
      { ...DEFAULT_ANALYTICS, containerId: raw, includeBubbles, serverUrl: serverUrl ?? '' },
      locals.user?.id ?? null
    );
    await logPlatformAction(locals, 'settings.update', { type: 'settings', id: 'analytics' },
      { containerId: raw, includeBubbles, serverUrl: serverUrl ?? '' });

    return { saved: true };
  },

  saveMcp: async ({ request, locals }) => {
    requirePlatformAdmin(locals);
    const enabled = (await request.formData()).get('enabled') === 'on';
    await writePlatformSetting(locals.db, 'mcp', { enabled }, locals.user?.id ?? null);
    await logPlatformAction(locals, 'settings.update', { type: 'settings', id: 'mcp' }, { enabled });
    return { saved: true };
  },

  saveAi: async ({ request, locals }) => {
    requirePlatformAdmin(locals);
    const data = await request.formData();
    const markup = Number(data.get('markup'));
    const usdToEur = Number(data.get('usdToEur'));
    if (!Number.isFinite(markup) || markup < 1 || markup > 20) return fail(400, { error: 'Markup must be between 1 and 20.' });
    if (!Number.isFinite(usdToEur) || usdToEur <= 0.3 || usdToEur >= 3) return fail(400, { error: 'Exchange rate looks wrong.' });
    await writePlatformSetting(locals.db, 'ai',
      { ...DEFAULT_AI, enabled: data.get('enabled') === 'on', markup, usdToEur },
      locals.user?.id ?? null);
    await logPlatformAction(locals, 'settings.update', { type: 'settings', id: 'ai' },
      { enabled: data.get('enabled') === 'on', markup, usdToEur });
    return { saved: true };
  }
};
