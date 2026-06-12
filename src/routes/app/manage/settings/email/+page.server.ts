import type { PageServerLoad, Actions } from './$types';
import sql from '$lib/db';
import type { EmailLogRow } from '$lib/db';
import { fail } from '@sveltejs/kit';
import { sendTestEmail, type SmtpConfig } from '$lib/email';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const jsonb = (obj: unknown) => sql.json(obj as any);

export const load: PageServerLoad = async ({ locals }) => {
  const orgId = locals.currentOrg!.id;
  const rows = await sql<{ key: string; value: unknown }[]>`
    SELECT key, value FROM org_settings
    WHERE org_id = ${orgId} AND key IN ('smtp', 'email_notifications', 'email_templates')
  `;
  const settings: Record<string, unknown> = {};
  for (const r of rows) settings[r.key] = r.value;

  const emailLog = await sql<EmailLogRow[]>`
    SELECT id, recipient, subject, template, status, error, created_at
    FROM email_log ORDER BY created_at DESC LIMIT 100
  `;

  return {
    settings,
    templates: (settings.email_templates ?? {}) as Record<string, string>,
    emailLog,
  };
};

const upsertOrgSetting = (orgId: string, key: string, value: unknown) => sql`
  INSERT INTO org_settings (org_id, key, value, updated_at)
  VALUES (${orgId}, ${key}, ${sql.json(value as object)}, NOW())
  ON CONFLICT (org_id, key) DO UPDATE SET value = ${sql.json(value as object)}, updated_at = NOW()
`;

export const actions: Actions = {
  saveSmtp: async ({ request, locals }) => {
    const orgId = locals.currentOrg!.id;
    const data = await request.formData();
    const config: SmtpConfig = {
      host:      String(data.get('host')      ?? ''),
      port:      Number(data.get('port')      ?? 587),
      secure:    data.get('secure') === 'on',
      user:      String(data.get('user')      ?? ''),
      pass:      String(data.get('pass')      ?? ''),
      fromEmail: String(data.get('fromEmail') ?? ''),
      fromName:  String(data.get('fromName')  ?? 'Hallify'),
    };
    await upsertOrgSetting(orgId, 'smtp', config);
    return { success: true, section: 'smtp' };
  },

  testSmtp: async ({ request, locals }) => {
    const orgId = locals.currentOrg!.id;
    const data = await request.formData();
    const to = String(data.get('testEmail') ?? '');
    if (!to) return fail(400, { error: 'Email is required' });

    const [row] = await sql<{ value: SmtpConfig }[]>`
      SELECT value FROM org_settings WHERE org_id = ${orgId} AND key = 'smtp'
    `;
    if (!row?.value?.host) return fail(400, { error: 'SMTP not configured' });

    const result = await sendTestEmail(row.value, to);
    if (result.ok) return { success: true, section: 'smtp', testOk: true };
    return fail(400, { error: result.error ?? 'Failed to send' });
  },

  saveNotifications: async ({ request, locals }) => {
    const orgId = locals.currentOrg!.id;
    const data = await request.formData();
    const config = {
      newReservation: data.get('newReservation') === 'on',
      statusChange:   data.get('statusChange')   === 'on',
      newMessage:     data.get('newMessage')     === 'on',
    };
    await upsertOrgSetting(orgId, 'email_notifications', config);
    return { success: true, section: 'notifications' };
  },

  saveTemplates: async ({ request, locals }) => {
    const orgId = locals.currentOrg!.id;
    const data = await request.formData();
    const templates = {
      newReservation: String(data.get('tpl_newReservation') ?? ''),
      statusChange:   String(data.get('tpl_statusChange')   ?? ''),
      newMessage:     String(data.get('tpl_newMessage')     ?? ''),
      passwordReset:  String(data.get('tpl_passwordReset')  ?? ''),
      testEmail:      String(data.get('tpl_testEmail')      ?? ''),
    };
    await upsertOrgSetting(orgId, 'email_templates', templates);
    return { success: true, section: 'templates' };
  },
};
