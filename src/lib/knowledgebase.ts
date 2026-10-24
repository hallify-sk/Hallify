// Static knowledgebase — authored in code, version-controlled, no admin UI.
// Every article exists in Slovak and English: the console is Slovak by default, and
// the help centre used to be English only. Bodies are trusted HTML (rendered with
// {@html}); keep them simple and helpful.

export type KbLocale = 'sk' | 'en';

export type CategoryId = 'start' | 'halls' | 'reservations' | 'seating' | 'site' | 'account';

export const CATEGORIES: Record<CategoryId, { sk: string; en: string }> = {
	start: { sk: 'Začíname', en: 'Getting started' },
	halls: { sk: 'Sály a pôdorysy', en: 'Halls & floor plans' },
	reservations: { sk: 'Rezervácie a komunikácia', en: 'Reservations & messages' },
	seating: { sk: 'Rozsadenie', en: 'Seating' },
	site: { sk: 'Verejná stránka a integrácie', en: 'Public site & integrations' },
	account: { sk: 'Účet, tím a predplatné', en: 'Account, team & billing' }
};

interface Localized {
	title: string;
	summary: string;
	body: string;
}

interface ArticleSource {
	slug: string;
	category: CategoryId;
	sk: Localized;
	en: Localized;
}

/** An article in one language, as the pages use it. */
export interface Article extends Localized {
	slug: string;
	categoryId: CategoryId;
	category: string;
}

const SOURCES: ArticleSource[] = [
	{
		slug: 'getting-started',
		category: 'start',
		sk: {
			title: 'Začíname s Hallify',
			summary: 'Celkový obraz: organizácia, sály, rezervácie a ako si u vás klienti rezervujú.',
			body: `
			<p>Hallify vám pomáha spravovať priestory na podujatia — vaše <strong>sály</strong> — a <strong>rezervácie</strong>, ktoré si na ne ľudia robia.</p>
			<h3>Postup</h3>
			<ol>
				<li><strong>Vytvorte sálu</strong> pre každý priestor, ktorý prenajímate (kapacita, adresa, fotografie, ceny).</li>
				<li><strong>Nakreslite pôdorys</strong>, aby ste mohli rozmiestniť stoly a rozsadiť hostí.</li>
				<li><strong>Zverejnite ju</strong> a pošlite klientom odkaz na vašu stránku — klienti žiadajú o termín a vy ho schvaľujete.</li>
				<li>Po schválení vy (alebo klient) pripravíte <strong>rozloženie stolov</strong> a zoznam hostí.</li>
			</ol>
			<p>Postup nastavenia sledujte v <strong>kontrolnom zozname</strong> na stránke Pomoc.</p>
		`
		},
		en: {
			title: 'Getting started with Hallify',
			summary: 'The big picture: organizations, halls, reservations and how guests book.',
			body: `
			<p>Hallify helps you manage event venues — your <strong>halls</strong> — and the <strong>reservations</strong> people make for them.</p>
			<h3>The flow</h3>
			<ol>
				<li><strong>Create a hall</strong> for each space you rent out (capacity, address, photos, pricing).</li>
				<li><strong>Draw its floor plan</strong> so you can arrange tables and seat guests.</li>
				<li><strong>Make it public</strong> and share your booking page — guests request dates, you approve them.</li>
				<li>Once approved, you (or the client) can build the <strong>table layout</strong> and manage the guest list.</li>
			</ol>
			<p>Use the <strong>onboarding checklist</strong> on the Help page to track your setup.</p>
		`
		}
	},
	{
		slug: 'halls-and-floorplans',
		category: 'halls',
		sk: {
			title: 'Nastavenie sály a jej pôdorysu',
			summary: 'Obrys, steny, zóny a typy stolov — na čo slúži každý z nich.',
			body: `
			<p><strong>Pôdorys</strong> je plátno, na ktorom stoja vaše stoly. Otvorte sálu a zvoľte <em>Pôdorys</em>.</p>
			<h3>Štyri kroky</h3>
			<ol>
				<li><strong>Obrys</strong> — nakreslite vonkajší obdĺžnik miestnosti. Ohraničí všetko ostatné.</li>
				<li><strong>Steny</strong> — pevné prvky (steny, stĺpy, pódium). Stoly sa s nimi nemôžu prekrývať.</li>
				<li><strong>Zóny</strong> — vyfarbite a <em>pomenujte</em> časti priestoru (napr. „Parket“, „Bar“, „Vstup“). Slúžia na orientáciu.</li>
				<li><strong>Hotovo</strong> — uložte. Pôdorys môžete kedykoľvek upraviť.</li>
			</ol>
			<h3>Typy stolov</h3>
			<p>Stoly sa nekreslia priamo do pôdorysu sály. V nastaveniach sály si definujete opakovane použiteľné <strong>typy stolov</strong> (okrúhly pre 8, banketový…) a pri konkrétnej udalosti ich rozmiestnite.</p>
		`
		},
		en: {
			title: 'Setting up a hall and its floor plan',
			summary: 'Bounds, walls, zones and table types — what each one is for.',
			body: `
			<p>A <strong>floor plan</strong> is the canvas your tables live on. Open a hall and choose <em>Floor plan</em> to draw it.</p>
			<h3>The four steps</h3>
			<ol>
				<li><strong>Bounds</strong> — draw the outer rectangle of the room. This frames everything.</li>
				<li><strong>Walls</strong> — draw the solid structures (walls, pillars, the stage). They're obstacles tables can't overlap.</li>
				<li><strong>Zones</strong> — shade and <em>name</em> areas (e.g. “Dance floor”, “Bar”, “Entrance”). Purely organisational.</li>
				<li><strong>Done</strong> — save. You can edit it any time.</li>
			</ol>
			<h3>Table types</h3>
			<p>Tables aren't drawn on the hall plan directly — instead you define reusable <strong>table types</strong> (a round 8-seater, a long banquet table, …) in the hall's settings. When arranging a specific event, you place those types onto the plan.</p>
		`
		}
	},
	{
		slug: 'reservations-and-approvals',
		category: 'reservations',
		sk: {
			title: 'Ako fungujú rezervácie a schvaľovanie',
			summary: 'Stavy rezervácie, schválenie žiadosti a čo môže klient urobiť potom.',
			body: `
			<p>Keď klient požiada o sálu, rezervácia príde ako <strong>Čakajúca</strong>. Váš tím ju posúva ďalej:</p>
			<ul>
				<li><strong>Čakajúca</strong> → nová žiadosť čaká na vaše rozhodnutie.</li>
				<li><strong>Čaká na platbu</strong> → termín držíte, kým klient nezaplatí zálohu.</li>
				<li><strong>Schválená / Naplánovaná</strong> → potvrdené, termín je obsadený.</li>
				<li><strong>Dokončená</strong> → udalosť prebehla (nastaví sa automaticky).</li>
				<li><strong>Zrušená</strong> → termín sa uvoľní. Zrušená rezervácia zostáva v histórii.</li>
			</ul>
			<p>Stav mení len váš tím. Pre každú sálu môžete zapnúť <strong>automatické schvaľovanie</strong>, ak nechcete posudzovať každú žiadosť.</p>
			<h3>Po schválení</h3>
			<p>Po schválení si klient môže sám otvoriť <strong>rozloženie stolov</strong> a zoznam hostí. Upravujete ten istý plán, takže platí vždy jedna verzia.</p>
		`
		},
		en: {
			title: 'How reservations and approvals work',
			summary: 'Statuses, approving a request, and what the client can do after.',
			body: `
			<p>When a guest requests a hall it arrives as <strong>Pending</strong>. Staff move it through its lifecycle:</p>
			<ul>
				<li><strong>Pending</strong> → a new request awaiting your decision.</li>
				<li><strong>Waiting for payment</strong> → you hold the date until the client pays a deposit.</li>
				<li><strong>Approved / Planned</strong> → confirmed. The date is reserved.</li>
				<li><strong>Completed</strong> → the event has passed (set automatically).</li>
				<li><strong>Cancelled</strong> → frees the date. A cancelled reservation stays in the history.</li>
			</ul>
			<p>Only staff change the status. Each hall can be set to <strong>auto-approve</strong> if you don't want to vet every request.</p>
			<h3>After approval</h3>
			<p>Once a booking is approved, the <strong>client can self-serve</strong>: from their reservation they can open the table layout and the guest list. You both edit the same plan, so there's a single source of truth.</p>
		`
		}
	},
	{
		slug: 'calendar',
		category: 'reservations',
		sk: {
			title: 'Kalendár',
			summary: 'Všetky rezervácie a blokované termíny v mesiaci, týždni, dni alebo zozname.',
			body: `
			<p><strong>Kalendár</strong> ukazuje rezervácie všetkých vašich sál na jednom mieste.</p>
			<ul>
				<li><strong>Zobrazenia</strong> — Mesiac, Týždeň, Deň a Zoznam. Tlačidlo <em>Dnes</em> vás vráti na aktuálny dátum.</li>
				<li><strong>Filtre</strong> — zobrazte len jednu sálu alebo len rezervácie v určitom stave.</li>
				<li><strong>Blokované termíny</strong> — dni, keď je sála zatvorená, sa zobrazujú ako blokované a klienti si ich nemôžu rezervovať.</li>
				<li><strong>Nová udalosť</strong> — vytvorte rezerváciu priamo z kalendára, napríklad pre klienta, ktorý volal telefonicky.</li>
			</ul>
			<p>Kliknutím na udalosť otvoríte rezerváciu. Na nástenke sa dá kliknúť aj na deň v malom kalendári — otvorí sa ten deň.</p>
		`
		},
		en: {
			title: 'The calendar',
			summary: 'Every booking and blocked date by month, week, day or as a list.',
			body: `
			<p>The <strong>calendar</strong> shows the bookings of all your halls in one place.</p>
			<ul>
				<li><strong>Views</strong> — Month, Week, Day and List. <em>Today</em> brings you back to the current date.</li>
				<li><strong>Filters</strong> — show one hall only, or only bookings in a certain status.</li>
				<li><strong>Blocked dates</strong> — days when a hall is closed show as blocked, and clients cannot book them.</li>
				<li><strong>New event</strong> — create a booking straight from the calendar, for example for a client who phoned.</li>
			</ul>
			<p>Click an event to open the reservation. On the dashboard, clicking a day in the small calendar opens that day here.</p>
		`
		}
	},
	{
		slug: 'messages',
		category: 'reservations',
		sk: {
			title: 'Správy od klientov',
			summary: 'Vlákna k rezerváciám, odpovede, uzavretie vlákna a e-mailové upozornenia.',
			body: `
			<p>Každá rezervácia má vlastné <strong>vlákno správ</strong> medzi klientom a vaším tímom. Všetky nájdete v sekcii <strong>Správy</strong>.</p>
			<ul>
				<li><strong>Otvorené / Uzavreté</strong> — vlákno, ktoré je vybavené, uzavrite. Ak klient napíše znova, môžete ho opäť otvoriť.</li>
				<li><strong>Systémové správy</strong> — vo vlákne sa zaznamená aj zmena stavu rezervácie, aby klient vedel, čo sa stalo.</li>
				<li><strong>Úprava a vymazanie</strong> — vlastnú správu môžete upraviť alebo vymazať.</li>
			</ul>
			<h3>Upozornenia e-mailom</h3>
			<p>V <strong>Nastavenia → Pokročilé</strong> zvolíte, kto z tímu dostane e-mail o novej správe od klienta a či klient dostane e-mail, keď mu odpoviete.</p>
		`
		},
		en: {
			title: 'Messages from clients',
			summary: 'Booking threads, replies, closing a thread and email notifications.',
			body: `
			<p>Every reservation has its own <strong>message thread</strong> between the client and your team. You find them all under <strong>Messages</strong>.</p>
			<ul>
				<li><strong>Open / Closed</strong> — close a thread once it is dealt with. If the client writes again, you can reopen it.</li>
				<li><strong>System messages</strong> — a change of the booking's status is recorded in the thread too, so the client knows what happened.</li>
				<li><strong>Edit and delete</strong> — you can edit or delete your own message.</li>
			</ul>
			<h3>Email notifications</h3>
			<p>Under <strong>Settings → Advanced</strong> you choose who on the team gets an email about a new client message, and whether the client gets an email when you reply.</p>
		`
		}
	},
	{
		slug: 'seating-editor',
		category: 'seating',
		sk: {
			title: 'Editor rozsadenia — stoly, stoličky a hostia',
			summary: 'Rozmiestnenie stolov, priradenie hostí, samostatné stoličky a zóny.',
			body: `
			<p>V rezervácii otvorte <strong>Rozloženie stolov</strong> a rozmiestnite hostí na pôdoryse sály.</p>
			<ul>
				<li><strong>Stoly</strong> vložíte z typov stolov sály. Presúvajte ich ťahaním, rúčkou ich otočíte.</li>
				<li><strong>Hostia</strong> — kliknite na stoličku a posaďte na ňu niekoho zo zoznamu hostí. Ku každému hosťovi môžete pridať poznámku (strava, bezbariérovosť).</li>
				<li><strong>Samostatné stoličky</strong> — nástroj stolička pridá jednotlivé miesta bez stola (rady na obrad alebo koncert). Priraďujú sa rovnako ako miesta pri stole.</li>
				<li><strong>Zóny</strong> — vyfarbite a pomenujte časti priestoru.</li>
			</ul>
			<p>Zmeny sa <strong>ukladajú automaticky</strong>. Zasadací poriadok vytlačíte po poschodiach aj so zoznamom na kontrolu príchodu a zoznam hostí exportujete ako CSV (otvorí sa v Exceli či Google Sheets).</p>
		`
		},
		en: {
			title: 'The seating editor — tables, chairs & guests',
			summary: 'Placing tables, assigning guests, standalone chairs and zones.',
			body: `
			<p>Open a reservation's <strong>Table layout</strong> to arrange seating on the hall's floor plan.</p>
			<ul>
				<li><strong>Place tables</strong> from the hall's table types. Drag to position, use the handle to rotate.</li>
				<li><strong>Assign guests</strong> — click a chair to seat someone from the guest list. Add per-guest notes (dietary, accessibility).</li>
				<li><strong>Standalone chairs</strong> — the chair tool drops single seats not attached to a table (concert / ceremony rows). They're assignable like table seats.</li>
				<li><strong>Zones</strong> — shade and label areas to organise the space.</li>
			</ul>
			<p>Changes <strong>autosave</strong>. When you're done, the <strong>Seating sheet</strong> view prints a per-floor manifest with a check-in list, and exports the guest list as a CSV (opens in Excel / Google Sheets).</p>
		`
		}
	},
	{
		slug: 'hall-extras',
		category: 'reservations',
		sk: {
			title: 'Doplnky k rezervácii',
			summary: 'Catering, technika alebo služby, ktoré si klienti môžu objednať.',
			body: `
			<p><strong>Doplnky</strong> si klienti vyberajú pri rezervácii sály — catering, ozvučenie, výzdobu, čokoľvek ponúkate.</p>
			<h3>Nastavenie</h3>
			<p>V sále otvorte časť <strong>Doplnky</strong> a pridajte každý s cenou buď <strong>pevnou</strong> (za udalosť), alebo <strong>za hosťa</strong> (násobí sa počtom hostí).</p>
			<h3>Ako ich klienti používajú</h3>
			<p>Klient zaškrtne doplnky pri rezervácii a vidí priebežný súčet. Výber môže meniť, kým rezerváciu neschválite; potom ho môžete upraviť vy (napríklad keď sa dohodnete v správach).</p>
			<p>Počet doplnkov na sálu závisí od vášho programu.</p>
		`
		},
		en: {
			title: 'Offering extras with a booking',
			summary: 'Add catering, equipment or services guests can order.',
			body: `
			<p><strong>Extras</strong> are add-ons guests can pick when booking a hall — catering, a sound system, decoration, anything you offer.</p>
			<h3>Set them up</h3>
			<p>On a hall, open the <strong>Extras</strong> section and add each one with a price that's either <strong>fixed</strong> (per event) or <strong>per guest</strong> (multiplied by the guest count).</p>
			<h3>How guests use them</h3>
			<p>Guests tick the extras they want while booking and see a running total. They can change their selection until you approve the booking; after that, you can adjust it for them (handy when you agree on something over messages).</p>
			<p>The number of extras per hall depends on your plan.</p>
		`
		}
	},
	{
		slug: 'public-site',
		category: 'site',
		sk: {
			title: 'Verejná stránka: šablóna, sekcie a texty',
			summary: 'Ako poskladať stránku, ktorú vidia vaši klienti, a čo je v ktorom programe.',
			body: `
			<p>Vaša verejná stránka beží na vašej subdoméne (alebo vlastnej doméne) a ukazuje vaše verejné sály. Upravíte ju v <strong>Nastavenia → Verejná stránka</strong>.</p>
			<h3>Sekcie</h3>
			<p>Stránka sa skladá zo sekcií — hlavný priestor, zoznam alebo mriežka priestorov, vyhľadávanie, O nás, vybavenie, kontakt a výzva na rezerváciu. Sekcie pridáte, odoberiete a zoradíte šípkami alebo potiahnutím.</p>
			<p>Sekcia, ktorá nemá čo ukázať, sa na stránke nezobrazí (napr. Kontakt bez kontaktných údajov v profile sály). Editor vás na to upozorní.</p>
			<h3>Šablóna a texty</h3>
			<p>Vyberte šablónu vzhľadu a napíšte podnadpis a krátke predstavenie. Napravo vidíte <strong>živý náhľad</strong>; návštevníci zmeny uvidia až po uložení.</p>
			<h3>Program</h3>
			<p>Vlastné rozloženie, prémiové šablóny a texty sú súčasťou platených programov. Na programe Free vidia návštevníci predvolenú stránku; vaše uložené nastavenia sa vrátia po prechode na platený program.</p>
		`
		},
		en: {
			title: 'Your public site: template, sections and texts',
			summary: 'How to put together the page your clients see, and what each plan includes.',
			body: `
			<p>Your public site runs on your subdomain (or your own domain) and shows your public halls. Edit it under <strong>Settings → Public site</strong>.</p>
			<h3>Sections</h3>
			<p>The page is made of sections — featured venue, venue list or grid, search, about, amenities, contact and a booking call to action. Add, remove and reorder them with the arrows or by dragging.</p>
			<p>A section with nothing to show is left off the page (e.g. Contact when no hall profile has contact details). The editor tells you when that happens.</p>
			<h3>Template and texts</h3>
			<p>Pick a template and write a subtitle and a short introduction. The <strong>live preview</strong> on the right updates as you go; visitors see the changes once you save.</p>
			<h3>Plans</h3>
			<p>A custom layout, premium templates and texts are part of the paid plans. On Free, visitors see the default page; your saved settings come back when you move to a paid plan.</p>
		`
		}
	},
	{
		slug: 'domains',
		category: 'site',
		sk: {
			title: 'Vaša adresa a vlastné domény',
			summary: 'Bezplatná subdoména a pripojenie vlastnej domény.',
			body: `
			<p>Každá organizácia má bezplatnú adresu <strong>&lt;vasa-subdomena&gt;.hallify.sk</strong>, na ktorej sú vaše verejné sály. Netreba nič nastavovať.</p>
			<h3>Vlastná doména (platené programy)</h3>
			<p>Na platenom programe môžete pripojiť vlastnú doménu (napr. <em>rezervacie.vasapriestor.sk</em>): pridajte ju v <strong>Nastavenia → Domény</strong>, u svojho poskytovateľa DNS vytvorte záznamy, ktoré vám tam ukážeme (<strong>CNAME</strong> na Hallify a <strong>TXT</strong> na overenie vlastníctva), a počkajte na vydanie certifikátu SSL. Stav kontrolujeme sami každú hodinu a kým máte stránku otvorenú, aj priebežne; skontrolovať ho hneď môžete tlačidlom <em>Skontrolovať stav</em>.</p>
			<p>Vaša stránka začne na doméne fungovať až keď je doména overená (Cloudflare hlási doménu aj certifikát ako aktívne). Dovtedy sa zobrazuje ako <em>čaká na overenie</em>. Doména, ktorú nikto do 7 dní neoverí, sa uvoľní a môže ju pridať iná organizácia — rezervovať si cudziu doménu teda nejde.</p>
		`
		},
		en: {
			title: 'Your booking address & custom domains',
			summary: 'Your free subdomain, and connecting your own domain.',
			body: `
			<p>Every organization gets a free <strong>&lt;your-slug&gt;.hallify.sk</strong> address where your public halls live — no setup needed.</p>
			<h3>Custom domains (paid plans)</h3>
			<p>On a paid plan you can connect your own domain (e.g. <em>bookings.yourvenue.com</em>): add it under <strong>Settings → Domains</strong>, create the records shown there at your DNS provider (a <strong>CNAME</strong> pointing to Hallify and a <strong>TXT</strong> record proving ownership), then wait for the SSL certificate. We check the status every hour, and continuously while the page is open; <em>Check status</em> checks it right away.</p>
			<p>Your site starts working on the domain only once it is verified (Cloudflare reports both the domain and its certificate active). Until then it shows as <em>awaiting verification</em>. A domain nobody verifies within 7 days is released and another organisation can add it, so nobody can sit on someone else's domain.</p>
		`
		}
	},
	{
		slug: 'webhooks',
		category: 'site',
		sk: {
			title: 'Webhooky',
			summary: 'Posielajte udalosti z Hallify do Slacku, Make, Zapieru alebo vlastnej služby.',
			body: `
			<p><strong>Webhook</strong> je adresa, na ktorú Hallify pošle požiadavku HTTP POST vždy, keď sa niečo stane — nová rezervácia, zmena stavu, nová správa. Nastavíte ich v <strong>Nastavenia → Pokročilé</strong> (program Starter a vyšší).</p>
			<h3>Pridanie</h3>
			<ul>
				<li>Adresa musí byť verejná a začínať <strong>https://</strong>. Adresy http, localhost a interné siete nie sú povolené.</li>
				<li>Vyberte udalosti, ktoré chcete dostávať.</li>
				<li>Voliteľný <strong>tajný kľúč</strong>: každá požiadavka je potom podpísaná a nesie hlavičku <code>X-Hallify-Signature: sha256=…</code> (HMAC-SHA256 tela), takže overíte, že prišla od nás.</li>
			</ul>
			<h3>Obsah</h3>
			<p>Telo je JSON: <code>event</code>, <code>org_id</code>, <code>timestamp</code> a <code>data</code>. Názov udalosti je aj v hlavičke <code>X-Hallify-Event</code>.</p>
			<h3>Testovanie a doručenia</h3>
			<p>Tlačidlo <strong>Odoslať test</strong> pošle skúšobnú udalosť a ukáže, čo odpovedal váš server. V zozname <strong>Posledné doručenia</strong> rozkliknete každý pokus, uvidíte odoslané údaje a chybu a môžete ho <strong>odoslať znova</strong>.</p>
			<p>Po prechode na Free sa webhooky prestanú odosielať, ale zostanú uložené; po návrate na platený program fungujú ďalej.</p>
		`
		},
		en: {
			title: 'Webhooks',
			summary: 'Send Hallify events to Slack, Make, Zapier or your own service.',
			body: `
			<p>A <strong>webhook</strong> is an address Hallify sends an HTTP POST to whenever something happens — a new booking, a status change, a new message. Set them up under <strong>Settings → Advanced</strong> (Starter plan and up).</p>
			<h3>Adding one</h3>
			<ul>
				<li>The address must be public and start with <strong>https://</strong>. http, localhost and internal network addresses are not allowed.</li>
				<li>Choose the events you want to receive.</li>
				<li>Optional <strong>secret</strong>: every request then carries <code>X-Hallify-Signature: sha256=…</code> (an HMAC-SHA256 of the body), so you can check it came from us.</li>
			</ul>
			<h3>Payload</h3>
			<p>The body is JSON: <code>event</code>, <code>org_id</code>, <code>timestamp</code> and <code>data</code>. The event name is also in the <code>X-Hallify-Event</code> header.</p>
			<h3>Testing and deliveries</h3>
			<p><strong>Send test</strong> posts a test event and shows what your server answered. Under <strong>Recent deliveries</strong> you can open each attempt, see the payload and the error, and <strong>send it again</strong>.</p>
			<p>After a move to Free, webhooks stop being sent but stay saved; they work again once you are back on a paid plan.</p>
		`
		}
	},
	{
		slug: 'ai-assistant',
		category: 'site',
		sk: {
			title: 'AI asistent',
			summary: 'Čo asistent vie, ako ho zapnúť, koľko stojí a ako schvaľujete jeho návrhy.',
			body: `
			<p><strong>AI asistent</strong> pomáha s rutinnou prácou: importuje udalosti z tabuľky CSV, rozsadí hostí zo zoznamu mien, pripraví pôdorys z výkresu alebo doplní profil sály.</p>
			<h3>Zapnutie</h3>
			<p>Asistent je pre organizáciu vypnutý, kým ho nezapne niekto s oprávnením spravovať nastavenia (<strong>Nastavenia → AI asistent</strong>). Údaje, s ktorými pracuje, sa posielajú spoločnosti OpenAI na spracovanie.</p>
			<h3>Nič nezapíše bez vás</h3>
			<p>Každá zmena, ktorú asistent navrhne, príde ako <strong>návrh</strong>. Do vašich údajov sa zapíše, až keď ho potvrdíte.</p>
			<h3>Kredity</h3>
			<p>Asistent míňa <strong>kredity</strong> (10 kreditov = 1 €) podľa toho, koľko práce požiadavka dá. Každý program obsahuje mesačný príspevok kreditov, ktorý sa na začiatku obdobia doplní; dokúpené kredity neprepadajú a míňajú sa až po mesačných.</p>
		`
		},
		en: {
			title: 'The AI assistant',
			summary: 'What the assistant does, how to turn it on, what it costs and how you approve its proposals.',
			body: `
			<p>The <strong>AI assistant</strong> helps with routine work: importing events from a CSV, seating guests from a list of names, drafting a floor plan from a drawing, or filling in a hall profile.</p>
			<h3>Turning it on</h3>
			<p>The assistant is off for an organisation until someone allowed to manage settings switches it on (<strong>Settings → AI assistant</strong>). The data it works with is sent to OpenAI for processing.</p>
			<h3>Nothing is written without you</h3>
			<p>Every change the assistant suggests arrives as a <strong>proposal</strong>. It is written to your data only when you apply it.</p>
			<h3>Credits</h3>
			<p>The assistant spends <strong>credits</strong> (10 credits = €1) according to how much work a request takes. Each plan includes a monthly allowance, refilled at the start of each period; purchased credits do not expire and are spent after the monthly ones.</p>
		`
		}
	},
	{
		slug: 'connect-ai-assistant',
		category: 'site',
		sk: {
			title: 'Pripojte svojho AI asistenta (MCP)',
			summary: 'Ako pripojiť Claude, ChatGPT alebo Cursor k Hallify cez MCP a čo môže asistent robiť.',
			body: `
			<p>Vlastného AI asistenta — <strong>Claude</strong>, <strong>ChatGPT</strong>, <strong>Cursor</strong> a ďalších, ktorí podporujú protokol MCP — môžete pripojiť k Hallify. Asistent potom vie odpovedať na otázky o vašich sálach, rezerváciách, správach od klientov a štatistikách.</p>
			<p>Adresa servera: <code>https://hallify.sk/mcp</code></p>
			<h3>Claude</h3>
			<ol>
				<li>V Claude otvorte <strong>Nastavenia → Konektory</strong> (Connectors) a zvoľte <strong>Pridať vlastný konektor</strong> (Add custom connector).</li>
				<li>Ako názov zadajte „Hallify“ a ako URL <code>https://hallify.sk/mcp</code>. Potvrďte.</li>
				<li>Kliknite na <strong>Pripojiť</strong> (Connect). Otvorí sa Hallify: prihláste sa, skontrolujte, čo bude asistent smieť, a zvoľte <strong>Povoliť prístup</strong>.</li>
				<li>V konverzácii zapnite Hallify v ponuke nástrojov a pýtajte sa, napríklad „Aké rezervácie mám budúci týždeň?“</li>
			</ol>
			<p>V tímových plánoch Claude pridáva vlastné konektory vlastník alebo administrátor tímu.</p>
			<h3>ChatGPT</h3>
			<ol>
				<li>V ChatGPT otvorte <strong>Nastavenia → Aplikácie a konektory</strong> (Apps &amp; Connectors) a v rozšírených nastaveniach zapnite <strong>režim pre vývojárov</strong> (Developer mode).</li>
				<li>Zvoľte <strong>Vytvoriť</strong> (Create), zadajte názov „Hallify“, adresu servera MCP <code>https://hallify.sk/mcp</code> a overenie <strong>OAuth</strong>.</li>
				<li>Prihláste sa do Hallify a zvoľte <strong>Povoliť prístup</strong>. Potom konektor vyberte v konverzácii.</li>
			</ol>
			<p>Názvy ponúk sa v aplikáciách môžu mierne líšiť.</p>
			<h3>Čo asistent smie</h3>
			<ul>
				<li>Pracuje <strong>vo vašom mene a s vašimi oprávneniami</strong> v každej organizácii, ktorej ste členom. Čo nevidíte vy, nevidí ani on.</li>
				<li>Predvolene <strong>len číta</strong>. Ak pri pripájaní zapnete <strong>Povoliť aj zmeny</strong>, môže meniť stav rezervácií, odpovedať klientom a upravovať popis sál. Každá zmena sa zaznamená ako vykonaná „cez MCP“.</li>
				<li>Údaje organizácie sú dostupné na plánoch <strong>Professional</strong> a <strong>Enterprise</strong>. Asistent nemíňa vaše AI kredity — platíte len za svojho asistenta u jeho poskytovateľa.</li>
			</ul>
			<h3>Zrušenie prístupu</h3>
			<p>Pripojené aplikácie nájdete v <strong>Profile → Pripojené AI aplikácie</strong>, kde im prístup zrušíte. Vlastník organizácie vidí pripojenia členov v <strong>Nastavenia → Rozšírené</strong> a môže im prístup k organizácii odobrať.</p>
		`
		},
		en: {
			title: 'Connect your AI assistant (MCP)',
			summary: 'How to connect Claude, ChatGPT or Cursor to Hallify over MCP, and what the assistant can do.',
			body: `
			<p>You can connect your own AI assistant — <strong>Claude</strong>, <strong>ChatGPT</strong>, <strong>Cursor</strong> and others that support the MCP protocol — to Hallify. It can then answer questions about your halls, reservations, client messages and statistics.</p>
			<p>Server URL: <code>https://hallify.sk/mcp</code></p>
			<h3>Claude</h3>
			<ol>
				<li>In Claude, open <strong>Settings → Connectors</strong> and choose <strong>Add custom connector</strong>.</li>
				<li>Name it “Hallify” and enter the URL <code>https://hallify.sk/mcp</code>. Confirm.</li>
				<li>Click <strong>Connect</strong>. Hallify opens: sign in, check what the assistant will be allowed to do, and choose <strong>Allow access</strong>.</li>
				<li>In a chat, turn Hallify on in the tools menu and ask, for example, “Which reservations do I have next week?”</li>
			</ol>
			<p>On Claude team plans, custom connectors are added by the team’s owner or an admin.</p>
			<h3>ChatGPT</h3>
			<ol>
				<li>In ChatGPT, open <strong>Settings → Apps &amp; Connectors</strong> and, under advanced settings, turn on <strong>Developer mode</strong>.</li>
				<li>Choose <strong>Create</strong>, name it “Hallify”, enter the MCP server URL <code>https://hallify.sk/mcp</code> and choose <strong>OAuth</strong> authentication.</li>
				<li>Sign in to Hallify and choose <strong>Allow access</strong>. Then pick the connector in a chat.</li>
			</ol>
			<p>Menu names may differ slightly between apps and versions.</p>
			<h3>What the assistant may do</h3>
			<ul>
				<li>It works <strong>as you, with your permissions</strong>, in every organisation you belong to. What you cannot see, neither can it.</li>
				<li>By default it <strong>only reads</strong>. If you turn on <strong>Also allow changes</strong> when connecting, it can change reservation statuses, reply to clients and edit hall descriptions. Every change is recorded as made “via MCP”.</li>
				<li>Organisation data is available on the <strong>Professional</strong> and <strong>Enterprise</strong> plans. The assistant spends none of your AI credits — you pay only your assistant’s own provider.</li>
			</ul>
			<h3>Revoking access</h3>
			<p>Your connected apps are under <strong>Profile → Connected AI apps</strong>, where you can revoke them. An organisation’s owner sees members’ connections in <strong>Settings → Advanced</strong> and can take away their access to the organisation.</p>
		`
		}
	},
	{
		slug: 'plans-and-limits',
		category: 'account',
		sk: {
			title: 'Programy, limity a čo sa stane pri prechode na nižší',
			summary: 'Čo obsahuje každý program a ako prebieha zníženie.',
			body: `
			<p>Program určuje limity sál, členov, rezervácií na sálu za mesiac, fotografií a doplnkov, a funkcie ako vlastná doména, vlastný vzhľad a webhooky.</p>
			<h3>Zvýšenie a zníženie</h3>
			<p>Pri prechode na vyšší program zaplatíte len <strong>pomerný rozdiel</strong> do konca obdobia. Prechod na nižší program platí od <strong>konca aktuálneho obdobia</strong> — bez neočakávanej platby.</p>
			<h3>Zníženie nič nevymaže</h3>
			<p>Ak po znížení prekročíte limit, nadbytočné veci sa <strong>pozastavia, nevymažú</strong> — sály nad limit sa skryjú, kým ich znova neaktivujete, vlastný vzhľad, domény a webhooky sa pozastavia a fotografie nad limit sa skryjú. Po zvýšení programu sa všetko vráti.</p>
		`
		},
		en: {
			title: 'Plans, limits and what happens on downgrade',
			summary: 'What each plan includes and how downgrades are handled.',
			body: `
			<p>Your plan sets limits on halls, members, reservations per hall per month, gallery images and extras, plus features like custom domains, branding and webhooks.</p>
			<h3>Upgrades &amp; downgrades</h3>
			<p>Upgrading charges only the <strong>prorated difference</strong> for the rest of the period. Downgrading takes effect at the <strong>end of the current period</strong> — no surprise charge.</p>
			<h3>Downgrades never delete anything</h3>
			<p>If a downgrade puts you over a limit, the extra resources are <strong>suspended, not removed</strong> — over-limit halls are hidden until you reactivate them, branding/custom-domains/webhooks pause, and extra gallery images are hidden. Everything comes back when you upgrade again.</p>
		`
		}
	},
	{
		slug: 'team-and-roles',
		category: 'account',
		sk: {
			title: 'Členovia tímu a roly',
			summary: 'Vlastník, administrátori, členovia a vlastné roly — kto čo môže.',
			body: `
			<p>Kolegov pozvete v sekcii <strong>Ľudia</strong>. Každý člen má rolu:</p>
			<ul>
				<li><strong>Vlastník</strong> — plná kontrola vrátane predplatného a uzavretia organizácie.</li>
				<li><strong>Administrátor</strong> — spravuje sály, rezervácie, členov a nastavenia.</li>
				<li><strong>Člen</strong> — bežný prístup bez nastavení organizácie.</li>
			</ul>
			<p>Môžete si vytvoriť aj <strong>vlastné roly</strong> s presne vybranými oprávneniami (napr. len rezervácie a kalendár) a jednotlivým členom oprávnenia pridať či odobrať.</p>
			<p>Člen môže organizáciu kedykoľvek <strong>opustiť</strong>; jeho roly a oprávnenia sa pritom odstránia. Počet členov závisí od programu.</p>
		`
		},
		en: {
			title: 'Team members and roles',
			summary: 'Owner, administrators, members and custom roles — who can do what.',
			body: `
			<p>Invite teammates under <strong>People</strong>. Each member has a role:</p>
			<ul>
				<li><strong>Owner</strong> — full control, including billing and closing the organization.</li>
				<li><strong>Administrator</strong> — manages halls, reservations, members and settings.</li>
				<li><strong>Member</strong> — day-to-day access without organisation settings.</li>
			</ul>
			<p>You can also create <strong>custom roles</strong> with exactly the permissions you choose (e.g. bookings and the calendar only), and add or remove permissions for individual members.</p>
			<p>A member can <strong>leave</strong> the organisation at any time; their roles and permissions are removed when they do. The number of members depends on your plan.</p>
		`
		}
	},
	{
		slug: 'export-and-closing',
		category: 'account',
		sk: {
			title: 'Export údajov a uzavretie organizácie',
			summary: 'Ako si stiahnuť všetky údaje a čo sa stane, keď organizáciu uzavriete.',
			body: `
			<p>V <strong>Nastavenia → Pokročilé</strong> si vlastník môže kedykoľvek <strong>stiahnuť údaje</strong>: všetko v jednom súbore JSON (sály, rezervácie, hostia, klienti, členovia, nastavenia) alebo rezervácie ako tabuľku CSV pre Excel.</p>
			<h3>Uzavretie organizácie</h3>
			<p>Uzavretie je nevratné. Pred vymazaním Hallify:</p>
			<ul>
				<li>zruší vaše predplatné v Stripe, takže sa už nestrhne ďalšia platba,</li>
				<li>pošle e-mail každému klientovi s nadchádzajúcou rezerváciou, že bola zrušená,</li>
				<li>archivuje záznam na účtovné a právne účely.</li>
			</ul>
			<p>Potom sa vymažú sály, rezervácie, účty klientov na vašej stránke a nastavenia. Odporúčame si údaje najprv stiahnuť.</p>
		`
		},
		en: {
			title: 'Exporting data and closing the organisation',
			summary: 'How to download all your data, and what happens when you close the organisation.',
			body: `
			<p>Under <strong>Settings → Advanced</strong> the owner can <strong>download the data</strong> at any time: everything in one JSON file (halls, bookings, guests, clients, members, settings), or the bookings as a CSV spreadsheet for Excel.</p>
			<h3>Closing the organisation</h3>
			<p>Closing cannot be undone. Before deleting anything, Hallify:</p>
			<ul>
				<li>cancels your Stripe subscription, so you are not charged again,</li>
				<li>emails every client with an upcoming booking that it has been cancelled,</li>
				<li>archives a record for accounting and legal purposes.</li>
			</ul>
			<p>Then halls, bookings, clients' accounts on your site and settings are deleted. Download your data first.</p>
		`
		}
	}
];

function localize(src: ArticleSource, locale: KbLocale): Article {
	const l = src[locale] ?? src.sk;
	return { slug: src.slug, categoryId: src.category, category: CATEGORIES[src.category][locale], ...l };
}

/** Every article in one language, in reading order. */
export function articlesFor(locale: KbLocale): Article[] {
	return SOURCES.map((s) => localize(s, locale));
}

/** Kept for callers that only need slugs and the Slovak text. */
export const ARTICLES: Article[] = articlesFor('sk');

export function getArticle(slug: string, locale: KbLocale = 'sk'): Article | undefined {
	const src = SOURCES.find((a) => a.slug === slug);
	return src ? localize(src, locale) : undefined;
}

/** Lower case, no diacritics, tags removed: "Kaštieľ <b>Sála</b>" → "kastiel sala". */
export function searchable(s: string): string {
	return s
		.replace(/<[^>]+>/g, ' ')
		.replace(/&[a-z]+;/g, ' ')
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/\s+/g, ' ')
		.trim();
}

/** Articles matching every word of the query, best first: a word in the title
 *  counts more than one in the summary, which counts more than one in the body. */
export function searchArticles<T extends { title: string; summary: string; body?: string; text?: string }>(articles: T[], query: string): T[] {
	const words = searchable(query).split(' ').filter((w) => w.length > 1);
	if (!words.length) return articles;
	const scored: Array<{ a: T; score: number }> = [];
	for (const a of articles) {
		const title = searchable(a.title);
		const summary = searchable(a.summary);
		const body = a.text ?? searchable(a.body ?? '');
		let score = 0;
		let all = true;
		for (const w of words) {
			if (title.includes(w)) score += 5;
			else if (summary.includes(w)) score += 3;
			else if (body.includes(w)) score += 1;
			else { all = false; break; }
		}
		if (all) scored.push({ a, score });
	}
	return scored.sort((x, y) => y.score - x.score).map((s) => s.a);
}
