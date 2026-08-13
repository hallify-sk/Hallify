import type { PageServerLoad, Actions } from './$types';
import { dbAll, dbRun, toJson } from '$lib/db/index';
import type { EmailLogRow } from '$lib/db/index';
import { fail } from '@sveltejs/kit';
import { sendTestEmail, getEmailTemplates } from '$lib/email';
import { st } from '$lib/i18n-server';
import { env } from '$env/dynamic/private';
import { requirePlatformAdmin } from '$lib/guards';

const TEMPLATE_KEYS = ['newReservation', 'guestMessage', 'guestCancel', 'guestEdit', 'statusChange', 'newMessage', 'passwordReset', 'testEmail'] as const;

export const load: PageServerLoad = async ({ locals }) => {
  const templates = await getEmailTemplates(locals.db);

  const emailLog = await dbAll<EmailLogRow>(locals.db,
    `SELECT id, recipient, subject, template, status, error, created_at
     FROM email_log ORDER BY created_at DESC LIMIT 100`
  );

  const sentCount = emailLog.filter(e => e.status === 'sent').length;
  const failedCount = emailLog.filter(e => e.status === 'failed').length;

  return {
    templates,
    emailLog,
    stats: { sent: sentCount, failed: failedCount },
    config: {
      provider: 'Brevo',
      fromEmail: env.EMAIL_FROM || 'noreply@hallify.sk',
      fromName: env.EMAIL_FROM_NAME || 'Hallify',
      configured: !!env.BREVO_API_KEY,
    },
  };
};

export const actions: Actions = {
  testEmail: async ({ request, locals }) => {
    requirePlatformAdmin(locals);
    const data = await request.formData();
    const to = String(data.get('testEmail') ?? '').trim();
    if (!to) return fail(400, { error: st(locals.locale).serverErrors.emailRequired });

    const result = await sendTestEmail(locals.db, to);
    if (result.ok) return { success: true, section: 'test', testOk: true };
    return fail(400, { error: result.error ?? st(locals.locale).serverErrors.failedToSend });
  },

  saveTemplates: async ({ request, locals }) => {
    requirePlatformAdmin(locals);
    const data = await request.formData();
    const templates: Record<string, string> = {};
    for (const key of TEMPLATE_KEYS) {
      templates[key] = String(data.get(`tpl_${key}`) ?? '');
    }
    await dbRun(locals.db,
      `INSERT INTO system_settings (key, value, updated_at)
       VALUES ('email_templates', ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      toJson(templates)
    );
    return { success: true, section: 'templates' };
  },
};
