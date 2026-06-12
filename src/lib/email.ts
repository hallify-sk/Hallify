import nodemailer from 'nodemailer';
import sql from '$lib/db';

export interface SmtpConfig {
	host: string;
	port: number;
	secure: boolean;
	user: string;
	pass: string;
	fromEmail: string;
	fromName: string;
}

export interface EmailNotifyConfig {
	newReservation: boolean;
	statusChange: boolean;
	newMessage: boolean;
}

export interface EmailTemplates {
	newReservation?: string;
	statusChange?: string;
	newMessage?: string;
	passwordReset?: string;
	testEmail?: string;
}

const DEFAULT_TEMPLATES: Required<EmailTemplates> = {
	newReservation: `<h2>New Reservation</h2>
<p><b>{{userName}}</b> created a new reservation <b>{{title}}</b> at <b>{{hallName}}</b> on <b>{{date}}</b>.</p>`,
	statusChange: `<h2>Reservation Status Updated</h2>
<p>Your reservation <b>{{title}}</b> has been updated to: <b>{{status}}</b>.</p>`,
	newMessage: `<h2>New Message</h2>
<p><b>{{senderName}}</b> sent a message in ticket <b>{{subject}}</b>.</p>`,
	passwordReset: `<h2>Password Reset</h2>
<p>You requested a password reset. Click the link below to set a new password:</p>
<p><a href="{{resetUrl}}">{{resetUrl}}</a></p>
<p>This link expires in 1 hour. If you did not request this, please ignore this email.</p>`,
	testEmail: `<h2>Hallify SMTP Test</h2>
<p>If you can read this, your SMTP settings are working correctly.</p>`,
};

/** Load SMTP settings from the system_settings table */
export async function getSmtpConfig(): Promise<SmtpConfig | null> {
	const [row] = await sql<{ value: SmtpConfig }[]>`
		SELECT value FROM system_settings WHERE key = 'smtp'
	`;
	if (!row?.value?.host) return null;
	return row.value;
}

/** Load email notification preferences */
export async function getNotifyConfig(): Promise<EmailNotifyConfig> {
	const [row] = await sql<{ value: EmailNotifyConfig }[]>`
		SELECT value FROM system_settings WHERE key = 'email_notifications'
	`;
	return row?.value ?? { newReservation: false, statusChange: false, newMessage: false };
}

/** Load email templates (merged with defaults) */
export async function getEmailTemplates(): Promise<Required<EmailTemplates>> {
	const [row] = await sql<{ value: EmailTemplates }[]>`
		SELECT value FROM system_settings WHERE key = 'email_templates'
	`;
	return { ...DEFAULT_TEMPLATES, ...row?.value };
}

/** Replace {{key}} placeholders in a template string */
function renderTemplate(template: string, vars: Record<string, string>): string {
	return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}

/** Create a nodemailer transport from saved SMTP config */
function createTransport(config: SmtpConfig) {
	return nodemailer.createTransport({
		host: config.host,
		port: config.port,
		secure: config.secure,
		auth: { user: config.user, pass: config.pass },
	});
}

/** Log an email send attempt to the database */
async function logEmail(recipient: string, subject: string, template: string | null, status: 'sent' | 'failed', error?: string) {
	try {
		await sql`INSERT INTO email_log (recipient, subject, template, status, error)
			VALUES (${recipient}, ${subject}, ${template}, ${status}, ${error ?? null})`;
	} catch { /* don't fail on logging errors */ }
}

/** Send an email using saved SMTP settings. Returns true on success. */
export async function sendEmail(to: string, subject: string, html: string, templateName?: string): Promise<boolean> {
	const config = await getSmtpConfig();
	if (!config) return false;

	try {
		const transport = createTransport(config);
		await transport.sendMail({
			from: `"${config.fromName}" <${config.fromEmail}>`,
			to,
			subject,
			html,
		});
		await logEmail(to, subject, templateName ?? null, 'sent');
		return true;
	} catch (err) {
		console.error('[email] Failed to send:', err);
		await logEmail(to, subject, templateName ?? null, 'failed', err instanceof Error ? err.message : String(err));
		return false;
	}
}

/** Send a test email to verify SMTP config works */
export async function sendTestEmail(config: SmtpConfig, to: string): Promise<{ ok: boolean; error?: string }> {
	try {
		const templates = await getEmailTemplates();
		const transport = createTransport(config);
		await transport.sendMail({
			from: `"${config.fromName}" <${config.fromEmail}>`,
			to,
			subject: 'Hallify – Test Email',
			html: templates.testEmail,
		});
		await logEmail(to, 'Hallify – Test Email', 'testEmail', 'sent');
		return { ok: true };
	} catch (err: unknown) {
		await logEmail(to, 'Hallify – Test Email', 'testEmail', 'failed', err instanceof Error ? err.message : String(err));
		return { ok: false, error: err instanceof Error ? err.message : String(err) };
	}
}

/** Notify admins about a new reservation */
export async function notifyNewReservation(title: string, userName: string, hallName: string, date: string) {
	const notify = await getNotifyConfig();
	if (!notify.newReservation) return;

	const templates = await getEmailTemplates();
	const html = renderTemplate(templates.newReservation, { title, userName, hallName, date });
	const admins = await sql<{ email: string }[]>`SELECT email FROM users WHERE role = 'admin'`;
	for (const admin of admins) {
		await sendEmail(admin.email, `New Reservation: ${title}`, html, 'newReservation');
	}
}

/** Notify a user about reservation status change */
export async function notifyStatusChange(userEmail: string, title: string, newStatus: string) {
	const notify = await getNotifyConfig();
	if (!notify.statusChange) return;

	const templates = await getEmailTemplates();
	const html = renderTemplate(templates.statusChange, { title, status: newStatus });
	await sendEmail(userEmail, `Reservation Update: ${title}`, html, 'statusChange');
}

/** Notify about a new message in a ticket */
export async function notifyNewMessage(recipientEmail: string, ticketSubject: string, senderName: string) {
	const notify = await getNotifyConfig();
	if (!notify.newMessage) return;

	const templates = await getEmailTemplates();
	const html = renderTemplate(templates.newMessage, { subject: ticketSubject, senderName });
	await sendEmail(recipientEmail, `New Message: ${ticketSubject}`, html, 'newMessage');
}

/** Send a password reset email */
export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<boolean> {
	const templates = await getEmailTemplates();
	const html = renderTemplate(templates.passwordReset, { resetUrl });
	return sendEmail(to, 'Hallify – Password Reset', html, 'passwordReset');
}
