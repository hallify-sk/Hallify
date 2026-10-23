import type { PageServerLoad, Actions } from './$types';
import { dbAll, dbFirst, dbRun, toJson, fromJson } from '$lib/db/index';
import type { EmailLogRow } from '$lib/db/index';
import { fail } from '@sveltejs/kit';
import { sendTestEmail, getEmailTemplates, isDefaultTemplate } from '$lib/email';
import { DEFAULT_TEMPLATES as LOCALIZED_DEFAULTS, type TemplateKey } from '$lib/server/email-copy';
import { logPlatformAction } from '$lib/server/platform-audit';
import { templateOverrides } from '$lib/email-template-overrides';
import { st } from '$lib/i18n-server';
import { env } from '$env/dynamic/private';
import { requirePlatformAdmin } from '$lib/guards';

// The page edits the Slovak defaults (getEmailTemplates resolves for 'sk'). A value
// equal to any shipped default (either language, or the old English one) is not an
// override either: emails then go out in each recipient's language.
const DEFAULT_TEMPLATES = LOCALIZED_DEFAULTS.sk;
const overrides = (submitted: Record<string, string>) => Object.fromEntries(
  Object.entries(templateOverrides(submitted, DEFAULT_TEMPLATES)).filter(([k, v]) => !isDefaultTemplate(k as TemplateKey, v))
);

const TEMPLATE_KEYS = ['newReservation', 'guestMessage', 'guestCancel', 'guestEdit', 'statusChange', 'hallCancellation', 'newMessage', 'passwordReset', 'testEmail', 'bookingReceived', 'bookingConfirmed', 'clientEdited', 'clientCancelled', 'venueChanged', 'eventReminder'] as const;

export const load: PageServerLoad = async ({ locals }) => {
  const templates = await getEmailTemplates(locals.db);
  // Which templates differ from the built-in default, so the page can mark them
  // and offer to go back.
  const storedRow = await dbFirst<{ value: string | null }>(locals.db,
    "SELECT value FROM system_settings WHERE key = 'email_templates'");
  const stored = overrides(fromJson<Record<string, string>>(storedRow?.value ?? null) ?? {});

  const emailLog = await dbAll<EmailLogRow>(locals.db,
    `SELECT id, recipient, subject, template, status, error, created_at
     FROM email_log ORDER BY created_at DESC LIMIT 100`
  );

  const sentCount = emailLog.filter(e => e.status === 'sent').length;
  const failedCount = emailLog.filter(e => e.status === 'failed').length;

  return {
    templates,
    defaults: DEFAULT_TEMPLATES,
    customized: Object.keys(stored),
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
    const submitted: Record<string, string> = {};
    for (const key of TEMPLATE_KEYS) {
      submitted[key] = String(data.get(`tpl_${key}`) ?? '');
    }
    // Store only real changes. Saving used to write all nine templates, which froze
    // every default in place (later improvements never reached anyone), and an
    // emptied field was stored as '' and sent blank emails. Empty or unchanged =
    // use the default.
    const templates = overrides(submitted);
    await dbRun(locals.db,
      `INSERT INTO system_settings (key, value, updated_at)
       VALUES ('email_templates', ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      toJson(templates)
    );
    await logPlatformAction(locals, 'email.templates', { type: 'email', id: 'templates' }, { customized: Object.keys(templates) });
    return { success: true, section: 'templates' };
  },
};
