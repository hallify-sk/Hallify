// Every word of every email, in Slovak and English. Emails are rendered on the
// server only, so this copy is kept out of $lib/i18n (which ships to the browser).
// email-copy.test.ts checks that both languages have the same keys.
//
// Clients are addressed formally (vy). Staff emails are about a client's action.

export type EmailLocale = 'sk' | 'en';

export type TemplateKey =
	| 'newReservation' | 'guestMessage' | 'guestCancel' | 'guestEdit'
	| 'statusChange' | 'hallCancellation' | 'newMessage' | 'passwordReset' | 'testEmail';

/** Default bodies of the templates platform admins can override on /app/platform/email.
 *  Every {{variable}} is HTML-escaped when rendered, and line breaks are kept. */
export const DEFAULT_TEMPLATES: Record<EmailLocale, Record<TemplateKey, string>> = {
	sk: {
		newReservation: `<h2>Nová rezervácia</h2>
<p><b>{{userName}}</b> vytvoril(a) rezerváciu <b>{{title}}</b> v sále <b>{{hallName}}</b> na <b>{{date}}</b>.</p>`,
		guestMessage: `<h2>Nová správa od klienta</h2>
<p><b>{{senderName}}</b> napísal(a) v konverzácii <b>{{subject}}</b>:</p>
<blockquote>{{message}}</blockquote>`,
		guestCancel: `<h2>Klient zrušil rezerváciu</h2>
<p><b>{{guestName}}</b> zrušil(a) rezerváciu <b>{{title}}</b> v sále <b>{{hallName}}</b> na <b>{{date}}</b>.</p>`,
		guestEdit: `<h2>Klient upravil rezerváciu</h2>
<p><b>{{guestName}}</b> upravil(a) rezerváciu <b>{{title}}</b> v sále <b>{{hallName}}</b> (termín: <b>{{date}}</b>).</p>
<p>{{changes}}</p>`,
		statusChange: `<h2>Zmena stavu rezervácie</h2>
<p>Stav vašej rezervácie <b>{{title}}</b> sa zmenil na: <b>{{status}}</b>.</p>
<p>{{statusInfo}}</p>`,
		hallCancellation: `<h2>Vaša rezervácia bola zrušená</h2>
<p>Prevádzka zrušila vašu rezerváciu <b>{{title}}</b> v sále <b>{{hallName}}</b> na <b>{{date}}</b>.</p>
<blockquote>{{message}}</blockquote>
<p>Prevádzke môžete odpovedať priamo vo svojej rezervácii.</p>`,
		newMessage: `<h2>Nová správa</h2>
<p><b>{{senderName}}</b> vám napísal(a) v konverzácii <b>{{subject}}</b>:</p>
<blockquote>{{message}}</blockquote>`,
		passwordReset: `<h2>Obnovenie hesla</h2>
<p>Požiadali ste o obnovenie hesla. Nové heslo si nastavíte cez tento odkaz:</p>
<p><a href="{{resetUrl}}">{{resetUrl}}</a></p>
<p>Odkaz platí 1 hodinu. Ak ste o obnovenie nežiadali, tento e-mail ignorujte.</p>`,
		testEmail: `<h2>Test e-mailu z Hallify</h2>
<p>Ak čítate tento text, odosielanie e-mailov funguje.</p>`,
	},
	en: {
		newReservation: `<h2>New reservation</h2>
<p><b>{{userName}}</b> created the reservation <b>{{title}}</b> at <b>{{hallName}}</b> on <b>{{date}}</b>.</p>`,
		guestMessage: `<h2>New message from a client</h2>
<p><b>{{senderName}}</b> wrote in the conversation <b>{{subject}}</b>:</p>
<blockquote>{{message}}</blockquote>`,
		guestCancel: `<h2>Booking cancelled by the client</h2>
<p><b>{{guestName}}</b> cancelled the booking <b>{{title}}</b> at <b>{{hallName}}</b> on <b>{{date}}</b>.</p>`,
		guestEdit: `<h2>Booking changed by the client</h2>
<p><b>{{guestName}}</b> updated the booking <b>{{title}}</b> at <b>{{hallName}}</b> (date: <b>{{date}}</b>).</p>
<p>{{changes}}</p>`,
		statusChange: `<h2>Reservation status updated</h2>
<p>Your reservation <b>{{title}}</b> is now: <b>{{status}}</b>.</p>
<p>{{statusInfo}}</p>`,
		hallCancellation: `<h2>Your reservation has been cancelled</h2>
<p>The venue cancelled your reservation <b>{{title}}</b> at <b>{{hallName}}</b> on <b>{{date}}</b>.</p>
<blockquote>{{message}}</blockquote>
<p>You can reply to the venue from your reservation.</p>`,
		newMessage: `<h2>New message</h2>
<p><b>{{senderName}}</b> wrote to you in the conversation <b>{{subject}}</b>:</p>
<blockquote>{{message}}</blockquote>`,
		passwordReset: `<h2>Password reset</h2>
<p>You asked to reset your password. Set a new one with this link:</p>
<p><a href="{{resetUrl}}">{{resetUrl}}</a></p>
<p>The link is valid for 1 hour. If you did not ask for this, ignore this email.</p>`,
		testEmail: `<h2>Hallify email test</h2>
<p>If you can read this, email sending works.</p>`,
	},
};

/** The English defaults shipped before emails were translated. A stored template
 *  equal to one of these was never really customised: the old settings form saved
 *  every textarea, defaults included. Such a copy is treated as "use the default". */
export const LEGACY_DEFAULT_TEMPLATES: Partial<Record<TemplateKey, string>> = {
	newReservation: `<h2>New Reservation</h2>
<p><b>{{userName}}</b> created a new reservation <b>{{title}}</b> at <b>{{hallName}}</b> on <b>{{date}}</b>.</p>`,
	guestMessage: `<h2>New message from a guest</h2>
<p><b>{{senderName}}</b> sent a message about <b>{{subject}}</b>:</p>
<blockquote>{{message}}</blockquote>`,
	guestCancel: `<h2>Booking cancelled by a guest</h2>
<p><b>{{guestName}}</b> cancelled their booking <b>{{title}}</b> at <b>{{hallName}}</b> on <b>{{date}}</b>.</p>`,
	guestEdit: `<h2>Booking changed by a guest</h2>
<p><b>{{guestName}}</b> updated their booking <b>{{title}}</b> at <b>{{hallName}}</b> (date: <b>{{date}}</b>).</p>`,
	statusChange: `<h2>Reservation Status Updated</h2>
<p>Your reservation <b>{{title}}</b> has been updated to: <b>{{status}}</b>.</p>`,
	hallCancellation: `<h2>Your reservation has been cancelled</h2>
<p>Your reservation <b>{{title}}</b> at <b>{{hallName}}</b> on <b>{{date}}</b> has been cancelled by the venue.</p>
<blockquote style="white-space:pre-wrap">{{message}}</blockquote>
<p>You can reply to the venue from your reservation in Hallify.</p>`,
	newMessage: `<h2>New Message</h2>
<p><b>{{senderName}}</b> sent a message in ticket <b>{{subject}}</b>.</p>`,
	passwordReset: `<h2>Password Reset</h2>
<p>You requested a password reset. Click the link below to set a new password:</p>
<p><a href="{{resetUrl}}">{{resetUrl}}</a></p>
<p>This link expires in 1 hour. If you did not request this, please ignore this email.</p>`,
	testEmail: `<h2>Hallify email test</h2>
<p>If you can read this, email sending is working correctly.</p>`,
};

const sk = {
	/** Sender name on emails sent for a venue. */
	via: (org: string) => `${org} cez Hallify`,
	subject: {
		newReservation: (title: string) => `Nová rezervácia: ${title}`,
		guestMessage: (subject: string) => `Nová správa od klienta: ${subject}`,
		guestCancel: (title: string) => `Klient zrušil rezerváciu: ${title}`,
		guestEdit: (title: string) => `Klient upravil rezerváciu: ${title}`,
		statusChange: (title: string, status: string) => `${title}: ${status}`,
		hallCancellation: (title: string) => `Rezervácia zrušená: ${title}`,
		newMessage: (subject: string) => `Nová správa: ${subject}`,
		passwordReset: 'Obnovenie hesla',
		testEmail: 'Hallify – testovací e-mail',
		announcement: (title: string) => `Oznámenie Hallify: ${title}`,
		orgInvite: (org: string) => `Pozvánka do tímu ${org} v Hallify`,
	},
	cta: {
		openReservation: 'Otvoriť rezerváciu',
		openConversation: 'Otvoriť konverzáciu',
		viewBooking: 'Zobraziť rezerváciu',
		reply: 'Odpovedať',
		viewMessages: 'Zobraziť správy',
		resetPassword: 'Nastaviť nové heslo',
		acceptInvite: 'Prijať pozvánku',
	},
	details: {
		event: 'Podujatie',
		hall: 'Sála',
		date: 'Dátum',
		time: 'Čas',
		guests: 'Počet hostí',
		client: 'Klient',
		status: 'Stav',
	},
	noteFromVenue: 'Správa od prevádzky',
	changes: {
		title: 'Názov',
		date: 'Dátum',
		startTime: 'Začiatok',
		endTime: 'Koniec',
		guests: 'Počet hostí',
		description: 'Popis',
		empty: '–',
		unknown: 'Podrobnosti zmeny nájdete v rezervácii.',
	},
	statusInfo: {
		pending: 'Prevádzka vašu žiadosť posúdi a o výsledku vám dá vedieť e-mailom.',
		waiting_payment: 'Rezervácia čaká na vašu platbu. Pokyny k platbe vám prevádzka pošle v správe – ak ich nemáte, ozvite sa jej cez odkaz nižšie.',
		approved: 'Prevádzka vašu rezerváciu potvrdila.',
		planned: 'Podujatie je naplánované. Všetky podrobnosti nájdete vo svojej rezervácii.',
		completed: 'Podujatie sa skončilo. Ďakujeme, že ste si vybrali práve túto prevádzku.',
		cancelled: 'Rezervácia bola zrušená. Ak máte otázky, ozvite sa prevádzke.',
	} as Record<string, string>,
	footer: {
		replyToVenue: (venue: string) => `Odpoveď na tento e-mail dostane priamo ${venue}.`,
		noReplyClient: 'Na tento e-mail neodpovedajte – prevádzke napíšte cez odkaz vyššie.',
		replyToClient: (email: string) => `Odpoveď na tento e-mail pôjde priamo klientovi (${email}).`,
		staffSettings: 'Kto z tímu dostáva tieto e-maily, nastavíte v časti Nastavenia → Pokročilé.',
		sentBy: (venue: string) => `Tento e-mail vám poslal systém Hallify v mene prevádzky ${venue}.`,
		automatic: 'Toto je automatická správa zo systému Hallify. Na tento e-mail neodpovedajte.',
		linkFallback: 'Ak tlačidlo nefunguje, skopírujte tento odkaz do prehliadača:',
	},
	announcement: {
		level: { info: 'Informácia', success: 'Novinka', warning: 'Upozornenie', error: 'Dôležité' } as Record<string, string>,
		signOff: '— Tím Hallify',
	},
	orgInvite: {
		heading: (org: string) => `Pozvánka do tímu ${org}`,
		intro: (inviter: string, org: string, role: string) => `${inviter} vás pozýva do organizácie <strong>${org}</strong> v Hallify s rolou <strong>${role}</strong>.`,
		body: 'Pozvánku prijmete tlačidlom nižšie. Ak ešte nemáte účet, vytvoríte si ho.',
		expires: 'Platnosť pozvánky je 7 dní.',
		roles: { owner: 'vlastník', admin: 'administrátor', member: 'člen' } as Record<string, string>,
		someone: 'Kolega',
	},
};

const en: typeof sk = {
	via: (org: string) => `${org} via Hallify`,
	subject: {
		newReservation: (title: string) => `New reservation: ${title}`,
		guestMessage: (subject: string) => `New message from a client: ${subject}`,
		guestCancel: (title: string) => `Booking cancelled by the client: ${title}`,
		guestEdit: (title: string) => `Booking changed by the client: ${title}`,
		statusChange: (title: string, status: string) => `${title}: ${status}`,
		hallCancellation: (title: string) => `Reservation cancelled: ${title}`,
		newMessage: (subject: string) => `New message: ${subject}`,
		passwordReset: 'Password reset',
		testEmail: 'Hallify – test email',
		announcement: (title: string) => `Hallify announcement: ${title}`,
		orgInvite: (org: string) => `You've been invited to ${org} on Hallify`,
	},
	cta: {
		openReservation: 'Open the reservation',
		openConversation: 'Open the conversation',
		viewBooking: 'View your reservation',
		reply: 'Reply',
		viewMessages: 'View messages',
		resetPassword: 'Set a new password',
		acceptInvite: 'Accept the invitation',
	},
	details: {
		event: 'Event',
		hall: 'Hall',
		date: 'Date',
		time: 'Time',
		guests: 'Guests',
		client: 'Client',
		status: 'Status',
	},
	noteFromVenue: 'Message from the venue',
	changes: {
		title: 'Name',
		date: 'Date',
		startTime: 'Start',
		endTime: 'End',
		guests: 'Guests',
		description: 'Description',
		empty: '–',
		unknown: 'You will find the details of the change in the reservation.',
	},
	statusInfo: {
		pending: 'The venue will review your request and let you know by email.',
		waiting_payment: 'The reservation is waiting for your payment. The venue will send you payment instructions in a message – if you do not have them, contact the venue using the link below.',
		approved: 'The venue has confirmed your reservation.',
		planned: 'The event is planned. You will find all the details in your reservation.',
		completed: 'The event has taken place. Thank you for choosing this venue.',
		cancelled: 'The reservation has been cancelled. If you have any questions, contact the venue.',
	} as Record<string, string>,
	footer: {
		replyToVenue: (venue: string) => `Replies to this email go straight to ${venue}.`,
		noReplyClient: 'Please do not reply to this email – write to the venue using the link above.',
		replyToClient: (email: string) => `Replies to this email go straight to the client (${email}).`,
		staffSettings: 'Choose who on your team receives these emails in Settings → Advanced.',
		sentBy: (venue: string) => `Sent by Hallify on behalf of ${venue}.`,
		automatic: 'This is an automatic message from Hallify. Please do not reply to it.',
		linkFallback: 'If the button does not work, copy this link into your browser:',
	},
	announcement: {
		level: { info: 'Information', success: 'News', warning: 'Warning', error: 'Important' } as Record<string, string>,
		signOff: '— The Hallify team',
	},
	orgInvite: {
		heading: (org: string) => `You've been invited to ${org}`,
		intro: (inviter: string, org: string, role: string) => `${inviter} invited you to join <strong>${org}</strong> on Hallify as <strong>${role}</strong>.`,
		body: "Accept with the button below. If you don't have an account yet, you'll be able to create one.",
		expires: 'This invitation expires in 7 days.',
		roles: { owner: 'owner', admin: 'administrator', member: 'member' } as Record<string, string>,
		someone: 'A teammate',
	},
};

export const EMAIL_COPY: Record<EmailLocale, typeof sk> = { sk, en };

export function emailCopy(locale: EmailLocale | string | null | undefined): typeof sk {
	return locale === 'en' ? en : sk;
}
