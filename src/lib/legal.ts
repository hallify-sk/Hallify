/** Terms of Service, Privacy Policy and Data Processing Agreement — SK/EN.
 *
 *  ⚠️  DRAFT — NOT LEGAL ADVICE. These documents were assembled from what the code
 *  actually does (plans + billing behaviour in `plans.ts`/`stripe.ts`, the data the
 *  schema stores, and the three sub-processors in use). They are a solid starting
 *  point, but a Slovak lawyer must review them before launch, and every
 *  `OPERATOR` field below must be filled in with the real entity.
 *
 *  Scoped to v1: RSVP is not shipping, so nothing here describes RSVP collection or
 *  Article 9 health data. If RSVP ships, the allergies field becomes special-category
 *  data and needs both a lawful basis (explicit consent at the form) and matching
 *  wording in the Privacy Policy and the DPA's data categories.
 *
 *  Kept as data rather than markup so `/terms`, `/privacy` and `/dpa` share one
 *  renderer and both locales stay structurally identical.
 */
import type { Locale } from './i18n';

/** ⚠️ FILL THESE IN — they appear verbatim in both documents, in both languages. */
export const OPERATOR = {
  legalName: 'Richard Marcinčák',
  address: 'Teplička 124, 052 01 Spišská Nová Ves, Slovensko',
  companyId: '57644420',
  vatId: '[[ DIČ ]]',
  /** Sole trader, so this is the TRADE register (živnostenský), not the commercial
   *  register. Phrased as a noun ("Zápis: …") rather than a participle so the
   *  sentence does not have to agree in gender with the operator's name. */
  registerEntry: '[[ Živnostenský register Okresného úradu …, č. … ]]',
  contactEmail: '[[ contact@hallify.sk ]]',
  privacyEmail: '[[ privacy@hallify.sk ]]',
} as const;

/** Last substantive revision. Bump when the text changes. */
export const LEGAL_UPDATED = '2026-08-01';

export interface LegalBlock {
  /** A paragraph, or a bulleted list. */
  p?: string;
  list?: string[];
}

export interface LegalSection {
  heading: string;
  blocks: LegalBlock[];
}

export interface LegalDoc {
  title: string;
  subtitle: string;
  sections: LegalSection[];
}

// ─── Terms of Service ─────────────────────────────────────────────────────────

const termsSk: LegalDoc = {
  title: 'Obchodné podmienky',
  subtitle: 'Podmienky používania služby Hallify.',
  sections: [
    {
      heading: '1. Prevádzkovateľ',
      blocks: [
        { p: `Službu Hallify („služba“) prevádzkuje ${OPERATOR.legalName}, miesto podnikania ${OPERATOR.address}, IČO ${OPERATOR.companyId}, DIČ ${OPERATOR.vatId}. Zápis: ${OPERATOR.registerEntry} („prevádzkovateľ“, „my“).` },
        { p: `Kontakt: ${OPERATOR.contactEmail}.` },
      ],
    },
    {
      heading: '2. Čo služba poskytuje',
      blocks: [
        { p: 'Hallify je softvér ako služba (SaaS) na správu sál a rezervácií. Umožňuje organizáciám spravovať sály, pôdorysy a zasadacie poriadky, prijímať a schvaľovať rezervácie, komunikovať s klientmi a zverejňovať verejné profily sál — voliteľne na vlastnej doméne.' },
        { p: 'Službu poskytujeme „tak, ako je“, v rozsahu funkcií dostupných v danom čase. Funkcie môžeme priebežne meniť, pridávať alebo odstraňovať; o podstatných zmenách obmedzujúcich už zaplatený rozsah vás upovedomíme vopred.' },
      ],
    },
    {
      heading: '3. Účty a organizácie',
      blocks: [
        { p: 'Na používanie služby je potrebný účet. Zodpovedáte za správnosť údajov, za utajenie hesla a za všetku aktivitu pod svojím účtom.' },
        { p: 'Predplatné sa viaže na organizáciu, nie na jednotlivého používateľa. Vlastník organizácie zodpovedá za jej členov a za obsah, ktorý do nej vložia.' },
        { list: [
          'Vlastník (owner) — plná kontrola vrátane fakturácie a zrušenia organizácie.',
          'Správca (admin) — správa sál, rezervácií, členov a nastavení.',
          'Člen (member) — bežná práca s rezerváciami a správami.',
        ] },
      ],
    },
    {
      heading: '4. Plány a ceny',
      blocks: [
        { p: 'Aktuálne plány a ich limity sú uvedené na stránke s cenníkom a v aplikácii. Ceny sú mesačné, v eurách:' },
        { list: [
          'Free — 0 €',
          'Starter — 29,99 € / mesiac',
          'Professional — 79,99 € / mesiac',
          'Enterprise — cena na vyžiadanie',
        ] },
        { p: 'Ak nie je uvedené inak, ceny sú bez DPH, ktorá sa uplatní podľa platných predpisov. Ceny môžeme meniť; zmena ceny existujúceho predplatného sa uplatní najskôr od nasledujúceho fakturačného obdobia a oznámime ju vopred.' },
        { p: 'Prekročenie limitov plánu (počet sál, členov, rezervácií za mesiac) môže obmedziť vytváranie ďalších záznamov, kým plán nezvýšite.' },
      ],
    },
    {
      heading: '5. Platby, zmeny plánu a zrušenie',
      blocks: [
        { p: 'Platby spracúva Stripe. Neuchovávame čísla platobných kariet. Predplatné sa automaticky obnovuje na konci každého fakturačného obdobia, kým ho nezrušíte.' },
        { list: [
          'Zvýšenie plánu (upgrade) sa uplatní okamžite a doúčtuje sa pomerná časť ceny za zvyšok obdobia.',
          'Zníženie plánu (downgrade) sa uplatní až na konci prebiehajúceho obdobia; do vtedy vám zostáva vyšší plán.',
          'Zrušenie sa uplatní na konci prebiehajúceho obdobia — službu môžete používať do jeho konca. Už zaplatené obdobie sa nevracia pomerne.',
        ] },
        { p: 'Pri omeškaní platby môžeme prístup k plateným funkciám pozastaviť.' },
      ],
    },
    {
      heading: '6. Odstúpenie od zmluvy (spotrebitelia)',
      blocks: [
        { p: 'Ak službu využívate ako spotrebiteľ (mimo podnikateľskej činnosti), máte podľa slovenského práva právo odstúpiť od zmluvy do 14 dní. Začatím poskytovania digitálnej služby pred uplynutím tejto lehoty a vaším výslovným súhlasom toto právo zaniká v rozsahu už poskytnutého plnenia.' },
        { p: 'Väčšina používateľov Hallify sú podnikatelia; v takom prípade sa právo na odstúpenie neuplatňuje.' },
      ],
    },
    {
      heading: '7. Vaše dáta a obsah',
      blocks: [
        { p: 'Obsah, ktorý do služby vložíte (údaje o sálach, rezervácie, zasadacie poriadky, obrázky, správy), zostáva váš. Udeľujete nám obmedzené právo tento obsah spracúvať výhradne na účel poskytovania služby.' },
        { p: 'Zodpovedáte za to, že máte právo vložené údaje spracúvať — vrátane osobných údajov hostí, ktoré do služby zadáte (napr. zoznam hostí a zasadací poriadok). Vo vzťahu k týmto údajom ste prevádzkovateľom vy a my sprostredkovateľom; bližšie v Zásadách ochrany osobných údajov.' },
        { p: 'Export: údaje o rezerváciách a zoznamy hostí si viete kedykoľvek exportovať z aplikácie (CSV, tlačová zostava).' },
      ],
    },
    {
      heading: '8. Neprijateľné použitie',
      blocks: [
        { list: [
          'Porušovanie právnych predpisov alebo práv tretích osôb.',
          'Nahrávanie škodlivého kódu alebo pokusy o narušenie bezpečnosti či dostupnosti služby.',
          'Automatizované sťahovanie dát nad rámec bežného používania.',
          'Rozosielanie nevyžiadaných správ prostredníctvom služby.',
          'Zneužitie vlastnej domény na uvedenie tretích osôb do omylu.',
        ] },
        { p: 'Pri závažnom alebo opakovanom porušení môžeme organizáciu pozastaviť alebo zrušiť.' },
      ],
    },
    {
      heading: '9. Dostupnosť služby',
      blocks: [
        { p: 'Usilujeme sa o vysokú dostupnosť, negarantujeme však neprerušovanú prevádzku. Službu môžeme dočasne obmedziť pre údržbu alebo z bezpečnostných dôvodov. Ak nie je dohodnuté inak (Enterprise), služba sa poskytuje bez zmluvne garantovanej úrovne dostupnosti (SLA).' },
      ],
    },
    {
      heading: '10. Zodpovednosť',
      blocks: [
        { p: 'Služba je nástroj na organizáciu podujatí; za samotné podujatia, za ich priebeh a za vzťah s vašimi klientmi zodpovedáte vy.' },
        { p: 'V rozsahu, v akom to právo pripúšťa, naša celková zodpovednosť za škodu je obmedzená sumou, ktorú ste za službu zaplatili za 12 mesiacov predchádzajúcich udalosti. Nezodpovedáme za ušlý zisk ani za nepriamu škodu. Toto obmedzenie sa nevzťahuje na škodu spôsobenú úmyselne alebo hrubou nedbanlivosťou a na prípady, keď to zákon nedovoľuje.' },
      ],
    },
    {
      heading: '11. Ukončenie',
      blocks: [
        { p: 'Organizáciu môžete kedykoľvek zrušiť v nastaveniach. Pri zrušení sa jej prevádzkové dáta odstránia; obmedzený archívny záznam (identifikácia organizácie, predplatné a faktúry) uchovávame na účely účtovníctva po dobu vyžadovanú právnymi predpismi.' },
        { p: 'Odporúčame si dáta pred zrušením exportovať.' },
      ],
    },
    {
      heading: '12. Zmeny podmienok',
      blocks: [
        { p: 'Podmienky môžeme meniť. O podstatnej zmene vás upovedomíme e-mailom alebo v aplikácii pred nadobudnutím účinnosti. Pokračovaním v používaní služby po účinnosti zmeny vyjadrujete súhlas s novým znením.' },
      ],
    },
    {
      heading: '13. Rozhodné právo',
      blocks: [
        { p: 'Zmluvný vzťah sa riadi právom Slovenskej republiky. Spory sú v právomoci príslušných súdov Slovenskej republiky. Spotrebiteľ má právo obrátiť sa aj na subjekt alternatívneho riešenia sporov (Slovenská obchodná inšpekcia).' },
      ],
    },
  ],
};

const termsEn: LegalDoc = {
  title: 'Terms of Service',
  subtitle: 'The terms that govern your use of Hallify.',
  sections: [
    {
      heading: '1. Who we are',
      blocks: [
        { p: `Hallify (the "Service") is operated by ${OPERATOR.legalName}, a sole trader with place of business at ${OPERATOR.address}, business ID (IČO) ${OPERATOR.companyId}, tax ID (DIČ) ${OPERATOR.vatId}. Registration: ${OPERATOR.registerEntry} ("we", "us").` },
        { p: `Contact: ${OPERATOR.contactEmail}.` },
      ],
    },
    {
      heading: '2. What the Service does',
      blocks: [
        { p: 'Hallify is software-as-a-service for venue and reservation management. It lets organizations manage halls, floor plans and seating, receive and approve reservations, message clients, and publish public hall profiles — optionally on their own domain.' },
        { p: 'The Service is provided as-is, with the features available at any given time. We may change, add or remove features; we will give advance notice of material changes that reduce functionality you have already paid for.' },
      ],
    },
    {
      heading: '3. Accounts and organizations',
      blocks: [
        { p: 'You need an account to use the Service. You are responsible for the accuracy of your details, for keeping your password confidential, and for all activity under your account.' },
        { p: 'Subscriptions attach to an organization, not to an individual user. An organization owner is responsible for its members and for the content they add.' },
        { list: [
          'Owner — full control, including billing and closing the organization.',
          'Admin — manages halls, reservations, members and settings.',
          'Member — day-to-day work with reservations and messages.',
        ] },
      ],
    },
    {
      heading: '4. Plans and pricing',
      blocks: [
        { p: 'Current plans and their limits are shown on the pricing page and in the app. Prices are monthly, in euro:' },
        { list: [
          'Free — €0',
          'Starter — €29.99 / month',
          'Professional — €79.99 / month',
          'Enterprise — price on request',
        ] },
        { p: 'Unless stated otherwise, prices exclude VAT, which is applied as required by law. We may change prices; a change to an existing subscription takes effect no earlier than the next billing period and will be notified in advance.' },
        { p: 'Exceeding your plan limits (halls, members, reservations per month) may prevent creating further records until you upgrade.' },
      ],
    },
    {
      heading: '5. Payment, plan changes and cancellation',
      blocks: [
        { p: 'Payments are processed by Stripe. We do not store card numbers. Subscriptions renew automatically at the end of each billing period until cancelled.' },
        { list: [
          'Upgrades take effect immediately and are charged pro rata for the remainder of the current period.',
          'Downgrades take effect at the end of the current period; you keep the higher plan until then.',
          'Cancellation takes effect at the end of the current period — you keep access until then. Periods already paid for are not refunded pro rata.',
        ] },
        { p: 'We may suspend access to paid features if payment fails or is overdue.' },
      ],
    },
    {
      heading: '6. Right of withdrawal (consumers)',
      blocks: [
        { p: 'If you use the Service as a consumer (outside a business activity), you have a statutory 14-day right of withdrawal under Slovak law. Where you expressly request that the digital service begin during that period, the right lapses in respect of the service already supplied.' },
        { p: 'Most Hallify users are businesses, in which case the right of withdrawal does not apply.' },
      ],
    },
    {
      heading: '7. Your data and content',
      blocks: [
        { p: 'Content you put into the Service (hall details, reservations, seating layouts, images, messages) remains yours. You grant us a limited right to process it solely to provide the Service.' },
        { p: 'You are responsible for having the right to process the data you enter — including personal data about guests that you add (for example a guest list or seating layout). For that data you are the controller and we are the processor; see the Privacy Policy.' },
        { p: 'Export: reservation data and guest lists can be exported from the app at any time (CSV, printable manifest).' },
      ],
    },
    {
      heading: '8. Acceptable use',
      blocks: [
        { list: [
          'No breaking the law or infringing the rights of others.',
          'No malicious code, and no attempts to compromise the security or availability of the Service.',
          'No automated bulk extraction of data beyond normal use.',
          'No sending unsolicited messages through the Service.',
          'No using a custom domain to mislead people about who you are.',
        ] },
        { p: 'We may suspend or close an organization for serious or repeated breaches.' },
      ],
    },
    {
      heading: '9. Availability',
      blocks: [
        { p: 'We aim for high availability but do not guarantee uninterrupted service. We may limit the Service temporarily for maintenance or security. Unless separately agreed (Enterprise), the Service is provided without a contractual service level agreement.' },
      ],
    },
    {
      heading: '10. Liability',
      blocks: [
        { p: 'The Service is a tool for organizing events; you remain responsible for the events themselves and for your relationship with your own clients.' },
        { p: 'To the extent permitted by law, our total liability is limited to the amount you paid for the Service in the 12 months preceding the event giving rise to the claim. We are not liable for lost profits or indirect damage. These limits do not apply to damage caused intentionally or by gross negligence, or where the law does not permit them.' },
      ],
    },
    {
      heading: '11. Termination',
      blocks: [
        { p: 'You may close your organization at any time in settings. Closing deletes its operational data; we keep a limited archival record (organization identity, subscription and invoices) for accounting purposes for the period required by law.' },
        { p: 'Export anything you want to keep before closing.' },
      ],
    },
    {
      heading: '12. Changes to these terms',
      blocks: [
        { p: 'We may update these terms. We will notify you by email or in the app before material changes take effect. Continuing to use the Service after that constitutes acceptance.' },
      ],
    },
    {
      heading: '13. Governing law',
      blocks: [
        { p: 'These terms are governed by the law of the Slovak Republic, and the courts of the Slovak Republic have jurisdiction. Consumers may also use alternative dispute resolution (Slovak Trade Inspection).' },
      ],
    },
  ],
};

// ─── Privacy Policy ───────────────────────────────────────────────────────────

const privacySk: LegalDoc = {
  title: 'Ochrana osobných údajov',
  subtitle: 'Aké údaje spracúvame, prečo, a aké máte práva.',
  sections: [
    {
      heading: '1. Prevádzkovateľ',
      blocks: [
        { p: `${OPERATOR.legalName}, ${OPERATOR.address}, IČO ${OPERATOR.companyId}.` },
        { p: `Kontakt vo veciach ochrany údajov: ${OPERATOR.privacyEmail}.` },
      ],
    },
    {
      heading: '2. Dve roly: prevádzkovateľ a sprostredkovateľ',
      blocks: [
        { p: 'Toto rozlíšenie je pre Hallify podstatné:' },
        { list: [
          'Pri údajoch o používateľoch Hallify (zamestnanci organizácií, ich účty, fakturácia) sme prevádzkovateľom my.',
          'Pri údajoch o hosťoch, ktoré do služby vloží organizácia, je prevádzkovateľom organizácia (sála) a my sme sprostredkovateľom — spracúvame ich len podľa jej pokynov. Podrobnosti upravuje Zmluva o spracúvaní osobných údajov.',
        ] },
        { p: 'Ak ste hosť a chcete uplatniť svoje práva k údajom o rezervácii, obráťte sa najprv na organizáciu, ktorá podujatie organizuje. Radi jej pomôžeme.' },
      ],
    },
    {
      heading: '3. Aké údaje spracúvame',
      blocks: [
        { p: 'Údaje o účte a organizácii:' },
        { list: [
          'Meno, priezvisko, e-mailová adresa, heslo (uložené výhradne ako bezpečný hash, nikdy v čitateľnej podobe).',
          'Názov organizácie, jej členovia a ich role, nastavenia a logo.',
          'Stav predplatného a identifikátory zákazníka v systéme Stripe.',
        ] },
        { p: 'Prevádzkové údaje:' },
        { list: [
          'Sály, pôdorysy, zasadacie poriadky a nahrané obrázky.',
          'Rezervácie: názov podujatia, dátum, počet hostí, poznámky, stav.',
          'Zoznamy hostí: meno hosťa, prípadne skupina/rodina a voľná poznámka, ktorú zadá organizácia.',
          'Správy a tikety v rámci organizácie.',
        ] },
        { p: 'Osobitné kategórie údajov (čl. 9 GDPR): služba ich nevyžaduje ani nepredpokladá. Poznámka pri hosťovi je voľné textové pole; organizácia doň nesmie vkladať údaje o zdraví (napr. alergie) bez vlastného právneho základu.' },
        { p: 'Technické údaje: prihlasovacia relácia, jazyk rozhrania, a bežné záznamy servera a siete potrebné pre prevádzku a bezpečnosť.' },
      ],
    },
    {
      heading: '4. Právne základy a účely',
      blocks: [
        { list: [
          'Plnenie zmluvy — poskytovanie služby, správa účtu, fakturácia.',
          'Oprávnený záujem — bezpečnosť služby, prevencia zneužitia, prevádzkové e-maily.',
          'Zákonná povinnosť — účtovné a daňové doklady.',
          'Súhlas — tam, kde ho osobitne vyžiadame.',
        ] },
        { p: 'Nepoužívame vaše údaje na profilovanie ani na automatizované rozhodovanie s právnymi účinkami. Nepredávame ich.' },
      ],
    },
    {
      heading: '5. Súbory cookie',
      blocks: [
        { p: 'Nevyhnutné cookies (nastavia sa vždy, bez nich služba nefunguje):' },
        { list: [
          'session_id — prihlásenie, platnosť 30 dní, httpOnly.',
          'hallify-lang — zvolený jazyk rozhrania, platnosť 1 rok.',
          'hallify-consent — vaša voľba ohľadom analytických cookies, platnosť 1 rok.',
        ] },
        { p: 'Analytické cookies (len s vaším súhlasom): používame Google Tag Manager a Google Analytics, aby sme videli, ako sa služba používa a kde sa používatelia strácajú. Bez vášho súhlasu sa nenačítajú vôbec — nejde len o ich vypnutie, skript sa vôbec nespustí. Súhlas môžete kedykoľvek zmeniť alebo odvolať cez odkaz „Nastavenia cookies“ v pätičke stránky — rovnako jednoducho, ako ste ho udelili.' },
        { p: 'Analytické a marketingové cookies sú samostatné kategórie — môžete povoliť len jednu z nich. Do analytiky neposielame e-maily, mená ani obsah rezervácií — len pseudonymné identifikátory a údaje ako typ účtu, rola a plán.' },
      ],
    },
    {
      heading: '6. Komu údaje sprístupňujeme',
      blocks: [
        { p: 'Využívame týchto sprostredkovateľov:' },
        { list: [
          'Cloudflare, Inc. — hosting aplikácie, databáza a úložisko nahraných súborov.',
          'Stripe, Inc. / Stripe Payments Europe — spracovanie platieb a fakturácia. Údaje o platobnej karte prijíma priamo Stripe; my ich nevidíme ani neuchovávame.',
          'Brevo (Sendinblue SAS) — odosielanie transakčných e-mailov.',
          'Google Ireland Limited — Google Tag Manager a Google Analytics, len ak ste udelili súhlas s analytickými cookies.',
        ] },
        { p: 'Prenos mimo EÚ/EHP prebieha na základe štandardných zmluvných doložiek alebo iného vhodného právneho mechanizmu. Údaje inak neposkytujeme tretím osobám, s výnimkou zákonnej povinnosti.' },
      ],
    },
    {
      heading: '7. Ako dlho údaje uchovávame',
      blocks: [
        { list: [
          'Údaje o účte a organizácii — po dobu trvania účtu.',
          'Po zrušení organizácie sa prevádzkové dáta odstránia; archívny záznam (identifikácia organizácie, predplatné, faktúry) sa uchováva na účtovné účely po dobu podľa právnych predpisov.',
          'Prihlasovacie relácie — 30 dní od vytvorenia.',
          'Odkazy na obnovu hesla — 1 hodina.',
          'Pozvánky do organizácie a na podujatie — 14 dní.',
          'Záznamy o odoslaných e-mailoch — na účely doručovania a riešenia problémov.',
        ] },
      ],
    },
    {
      heading: '8. Bezpečnosť',
      blocks: [
        { p: 'Heslá ukladáme výhradne ako hash (bcrypt). Komunikácia prebieha cez HTTPS. Dáta každej organizácie sú oddelené a prístupné len jej členom podľa ich role; klientske účty sú viazané výlučne na doménu svojej organizácie.' },
      ],
    },
    {
      heading: '9. Vaše práva',
      blocks: [
        { list: [
          'Právo na prístup k údajom a na ich kópiu.',
          'Právo na opravu nesprávnych údajov.',
          'Právo na vymazanie („na zabudnutie“).',
          'Právo na obmedzenie spracúvania.',
          'Právo na prenosnosť údajov.',
          'Právo namietať proti spracúvaniu na základe oprávneného záujmu.',
          'Právo kedykoľvek odvolať súhlas, ak je spracúvanie založené na súhlase.',
        ] },
        { p: `Práva si uplatníte na ${OPERATOR.privacyEmail}. Odpovieme najneskôr do jedného mesiaca.` },
        { p: 'Máte tiež právo podať sťažnosť dozornému orgánu: Úrad na ochranu osobných údajov Slovenskej republiky, Hraničná 12, 820 07 Bratislava (dataprotection.gov.sk).' },
      ],
    },
    {
      heading: '10. Zmeny týchto zásad',
      blocks: [
        { p: 'Zásady môžeme aktualizovať. O podstatnej zmene vás upovedomíme e-mailom alebo v aplikácii. Dátum poslednej aktualizácie je uvedený v hlavičke.' },
      ],
    },
  ],
};

const privacyEn: LegalDoc = {
  title: 'Privacy Policy',
  subtitle: 'What we process, why, and what rights you have.',
  sections: [
    {
      heading: '1. Controller',
      blocks: [
        { p: `${OPERATOR.legalName}, ${OPERATOR.address}, company ID ${OPERATOR.companyId}.` },
        { p: `Data protection contact: ${OPERATOR.privacyEmail}.` },
      ],
    },
    {
      heading: '2. Two roles: controller and processor',
      blocks: [
        { p: 'This distinction matters in Hallify:' },
        { list: [
          'For data about Hallify users (venue staff, their accounts, billing) we are the controller.',
          'For data about guests that an organization enters, the organization (the venue) is the controller and we are the processor — we handle it only on their instructions. The Data Processing Agreement sets out the detail.',
        ] },
        { p: 'If you are a guest and want to exercise your rights over reservation data, contact the organization running the event first. We will assist them.' },
      ],
    },
    {
      heading: '3. What we process',
      blocks: [
        { p: 'Account and organization data:' },
        { list: [
          'First and last name, email address, password (stored only as a secure hash, never in readable form).',
          'Organization name, members and their roles, settings and logo.',
          'Subscription status and Stripe customer identifiers.',
        ] },
        { p: 'Operational data:' },
        { list: [
          'Halls, floor plans, seating layouts and uploaded images.',
          'Reservations: event title, date, guest count, notes, status.',
          'Guest lists: guest name, optional group/family, and a free-text note entered by the organization.',
          'Messages and support tickets within an organization.',
        ] },
        { p: 'Special category data (Article 9 GDPR): the Service neither requires nor expects it. The per-guest note is a free-text field; organizations must not enter health data (e.g. allergies) into it without their own lawful basis.' },
        { p: 'Technical data: your login session, interface language, and ordinary server and network logs needed to operate and secure the Service.' },
      ],
    },
    {
      heading: '4. Legal bases and purposes',
      blocks: [
        { list: [
          'Performance of a contract — providing the Service, account management, billing.',
          'Legitimate interests — security, abuse prevention, operational email.',
          'Legal obligation — accounting and tax records.',
          'Consent — where we ask for it specifically.',
        ] },
        { p: 'We do not profile you or make automated decisions with legal effect, and we do not sell your data.' },
      ],
    },
    {
      heading: '5. Cookies',
      blocks: [
        { p: 'Strictly necessary cookies (always set — the service does not work without them):' },
        { list: [
          'session_id — keeps you signed in, 30 days, httpOnly.',
          'hallify-lang — your interface language, 1 year.',
          'hallify-consent — your choice about analytics cookies, 1 year.',
        ] },
        { p: 'Analytics cookies (only with your consent): we use Google Tag Manager and Google Analytics to understand how the service is used and where people get stuck. Without your consent they are not loaded at all — the script never runs, rather than merely being disabled. You can change or withdraw consent at any time via the “Cookie settings” link in the page footer — as easily as you gave it.' },
        { p: 'Analytics and marketing are separate categories — you can allow one without the other. We never send emails, names or reservation content to analytics — only pseudonymous identifiers and attributes such as account type, role and plan.' },
      ],
    },
    {
      heading: '6. Who we share data with',
      blocks: [
        { p: 'We use the following sub-processors:' },
        { list: [
          'Cloudflare, Inc. — application hosting, database, and storage for uploaded files.',
          'Stripe, Inc. / Stripe Payments Europe — payment processing and invoicing. Card details go directly to Stripe; we never see or store them.',
          'Brevo (Sendinblue SAS) — transactional email delivery.',
          'Google Ireland Limited — Google Tag Manager and Google Analytics, only where analytics consent has been given.',
        ] },
        { p: 'Any transfer outside the EU/EEA relies on Standard Contractual Clauses or another valid mechanism. We do not otherwise disclose data to third parties except where legally required.' },
      ],
    },
    {
      heading: '7. How long we keep data',
      blocks: [
        { list: [
          'Account and organization data — for the life of the account.',
          'After an organization is closed, operational data is deleted; an archival record (organization identity, subscription, invoices) is kept for accounting for the period required by law.',
          'Login sessions — 30 days from creation.',
          'Password reset links — 1 hour.',
          'Organization and event invitations — 14 days.',
          'Records of sent email — for delivery and troubleshooting purposes.',
        ] },
      ],
    },
    {
      heading: '8. Security',
      blocks: [
        { p: 'Passwords are stored only as bcrypt hashes. Traffic is served over HTTPS. Each organization\'s data is isolated and reachable only by its members according to their role; client accounts are bound exclusively to their own organization\'s domain.' },
      ],
    },
    {
      heading: '9. Your rights',
      blocks: [
        { list: [
          'Access to your data and a copy of it.',
          'Rectification of inaccurate data.',
          'Erasure ("right to be forgotten").',
          'Restriction of processing.',
          'Data portability.',
          'Objection to processing based on legitimate interests.',
          'Withdrawal of consent at any time, where processing is based on consent.',
        ] },
        { p: `To exercise them, write to ${OPERATOR.privacyEmail}. We respond within one month.` },
        { p: 'You also have the right to lodge a complaint with the supervisory authority: Office for Personal Data Protection of the Slovak Republic, Hraničná 12, 820 07 Bratislava (dataprotection.gov.sk).' },
      ],
    },
    {
      heading: '10. Changes to this policy',
      blocks: [
        { p: 'We may update this policy. We will notify you by email or in the app of material changes. The last updated date is shown in the header.' },
      ],
    },
  ],
};

// ─── Data Processing Agreement (GDPR Art. 28) ────────────────────────────────
//
// Hallify is the PROCESSOR; the venue/organization is the CONTROLLER for the guest
// data it puts into the service. This is the agreement that relationship requires.
// Scoped to v1: RSVP is not shipping, so no RSVP/special-category processing is
// described here. Re-add it (and a lawful basis for allergy data) if RSVP ships.

const dpaSk: LegalDoc = {
  title: 'Zmluva o spracúvaní osobných údajov',
  subtitle: 'Príloha k Obchodným podmienkam podľa čl. 28 GDPR.',
  sections: [
    {
      heading: '1. Zmluvné strany a účel',
      blocks: [
        { p: `Táto zmluva sa uzatvára medzi organizáciou používajúcou službu Hallify („prevádzkovateľ“) a ${OPERATOR.legalName}, ${OPERATOR.address}, IČO ${OPERATOR.companyId} („sprostredkovateľ“).` },
        { p: 'Tvorí neoddeliteľnú prílohu Obchodných podmienok a uzatvára sa okamihom, keď prevádzkovateľ začne službu používať. Upravuje spracúvanie osobných údajov, ktoré prevádzkovateľ vkladá do služby, podľa čl. 28 nariadenia (EÚ) 2016/679 (GDPR).' },
        { p: 'V prípade rozporu s Obchodnými podmienkami má v otázkach ochrany osobných údajov prednosť táto zmluva.' },
      ],
    },
    {
      heading: '2. Predmet, trvanie a povaha spracúvania',
      blocks: [
        { p: 'Predmetom je spracúvanie osobných údajov výlučne na účel poskytovania služby Hallify — správy sál, rezervácií, zasadacích poriadkov a súvisiacej komunikácie.' },
        { p: 'Spracúvanie trvá po dobu trvania zmluvného vzťahu a končí zrušením organizácie podľa článku 9 nižšie.' },
      ],
    },
    {
      heading: '3. Kategórie dotknutých osôb a údajov',
      blocks: [
        { p: 'Dotknuté osoby:' },
        { list: [
          'Klienti prevádzkovateľa, ktorí si rezervujú sálu (majitelia klientskych účtov).',
          'Hostia uvedení v zozname hostí a v zasadacom poriadku podujatia.',
          'Zamestnanci a členovia organizácie prevádzkovateľa.',
        ] },
        { p: 'Kategórie osobných údajov:' },
        { list: [
          'Identifikačné a kontaktné údaje: meno, priezvisko, e-mailová adresa.',
          'Údaje o rezervácii: názov a popis podujatia, dátum, počet hostí, poznámky.',
          'Zoznamy hostí a zasadacie poriadky: meno hosťa, prípadne skupina/rodina a voľná textová poznámka.',
          'Obsah správ a tiketov v rámci organizácie.',
        ] },
        { p: 'Osobitné kategórie údajov (čl. 9 GDPR): služba nevyžaduje ani nepredpokladá ich vkladanie. Poznámka pri hosťovi je voľné textové pole — prevádzkovateľ doň nesmie vkladať údaje o zdraví (napr. alergie) ani iné osobitné kategórie údajov bez vlastného právneho základu, spravidla výslovného súhlasu dotknutej osoby.' },
      ],
    },
    {
      heading: '4. Pokyny prevádzkovateľa',
      blocks: [
        { p: 'Sprostredkovateľ spracúva osobné údaje výlučne na základe zdokumentovaných pokynov prevádzkovateľa. Pokynom sa rozumie aj samotné používanie funkcií služby a tieto zmluvné dokumenty.' },
        { p: 'Ak je sprostredkovateľ povinný spracúvať údaje na základe právneho predpisu, informuje o tom prevádzkovateľa vopred, ak to právny predpis nezakazuje. Sprostredkovateľ bezodkladne informuje prevádzkovateľa, ak podľa jeho názoru pokyn porušuje GDPR.' },
      ],
    },
    {
      heading: '5. Mlčanlivosť',
      blocks: [
        { p: 'Sprostredkovateľ zabezpečí, aby osoby oprávnené spracúvať osobné údaje boli viazané mlčanlivosťou a aby prístup mali len tie osoby, ktoré ho nevyhnutne potrebujú na poskytovanie služby.' },
      ],
    },
    {
      heading: '6. Bezpečnosť spracúvania',
      blocks: [
        { p: 'Sprostredkovateľ prijal primerané technické a organizačné opatrenia podľa čl. 32 GDPR, najmä:' },
        { list: [
          'Šifrovanie prenosu (HTTPS) pri celej komunikácii so službou.',
          'Heslá uložené výlučne ako hash (bcrypt), nikdy v čitateľnej podobe.',
          'Logické oddelenie údajov jednotlivých organizácií; prístup podľa role používateľa.',
          'Klientske účty sú viazané výlučne na doménu vlastnej organizácie.',
          'Prihlasovacie relácie s obmedzenou platnosťou a cookies označené ako httpOnly a secure.',
          'Obmedzenie počtu pokusov o prihlásenie a o obnovu hesla.',
          'Zálohovanie a obnova na úrovni platformy poskytovateľa infraštruktúry.',
        ] },
      ],
    },
    {
      heading: '7. Ďalší sprostredkovatelia',
      blocks: [
        { p: 'Prevádzkovateľ udeľuje všeobecný súhlas so zapojením ďalších sprostredkovateľov. Ku dňu uzatvorenia sú nimi:' },
        { list: [
          'Cloudflare, Inc. — hosting aplikácie, databáza, úložisko nahraných súborov.',
          'Stripe, Inc. / Stripe Payments Europe, Ltd. — spracovanie platieb a fakturácia.',
          'Brevo (Sendinblue SAS) — odosielanie transakčných e-mailov.',
          'Google Ireland Limited — Google Tag Manager a Google Analytics, len ak ste udelili súhlas s analytickými cookies.',
        ] },
        { p: 'O zamýšľanej zmene alebo pridaní ďalšieho sprostredkovateľa informuje sprostredkovateľ vopred; prevádzkovateľ môže voči zmene v primeranej lehote namietať, pričom v takom prípade môže zmluvný vzťah ukončiť. Sprostredkovateľ ukladá ďalším sprostredkovateľom rovnaké povinnosti, aké vyplývajú z tejto zmluvy, a zodpovedá za ich plnenie.' },
      ],
    },
    {
      heading: '8. Súčinnosť',
      blocks: [
        { p: 'Sprostredkovateľ poskytne prevádzkovateľovi primeranú súčinnosť pri:' },
        { list: [
          'vybavovaní žiadostí dotknutých osôb (prístup, oprava, výmaz, prenosnosť, námietka);',
          'plnení povinností podľa čl. 32 až 36 GDPR vrátane posúdenia vplyvu na ochranu údajov;',
          'komunikácii s dozorným orgánom.',
        ] },
        { p: 'Väčšinu žiadostí dotknutých osôb vie prevádzkovateľ vybaviť priamo v aplikácii — údaje sú dostupné, upraviteľné, exportovateľné (CSV, tlačová zostava) a odstrániteľné.' },
      ],
    },
    {
      heading: '9. Porušenie ochrany osobných údajov',
      blocks: [
        { p: 'Sprostredkovateľ oznámi prevádzkovateľovi porušenie ochrany osobných údajov bez zbytočného odkladu po tom, ako sa o ňom dozvie, a poskytne informácie potrebné na splnenie oznamovacej povinnosti prevádzkovateľa voči dozornému orgánu a dotknutým osobám.' },
      ],
    },
    {
      heading: '10. Výmaz a vrátenie údajov',
      blocks: [
        { p: 'Po ukončení poskytovania služby sprostredkovateľ na výber prevádzkovateľa údaje vymaže alebo vráti. Zrušením organizácie v aplikácii sa jej prevádzkové dáta odstránia.' },
        { p: 'Sprostredkovateľ je oprávnený uchovať obmedzený archívny záznam (identifikácia organizácie, predplatné, faktúry) v rozsahu a po dobu vyžadovanú právnymi predpismi, najmä účtovnými a daňovými.' },
        { p: 'Prevádzkovateľovi sa odporúča vykonať export údajov pred zrušením organizácie.' },
      ],
    },
    {
      heading: '11. Audit',
      blocks: [
        { p: 'Sprostredkovateľ poskytne prevádzkovateľovi informácie potrebné na preukázanie plnenia povinností podľa čl. 28 GDPR a umožní audit vykonaný prevádzkovateľom alebo ním povereným audítorom. Audit sa vykonáva po predchádzajúcej primeranej výzve, počas pracovného času, spôsobom, ktorý neprimerane nenaruší prevádzku, a s povinnosťou mlčanlivosti.' },
      ],
    },
    {
      heading: '12. Prenos do tretích krajín',
      blocks: [
        { p: 'Ak pri spracúvaní dochádza k prenosu osobných údajov mimo EÚ/EHP, uskutočňuje sa na základe štandardných zmluvných doložiek prijatých Európskou komisiou alebo iného vhodného právneho mechanizmu podľa kapitoly V GDPR.' },
      ],
    },
  ],
};

const dpaEn: LegalDoc = {
  title: 'Data Processing Agreement',
  subtitle: 'Annex to the Terms of Service, under Article 28 GDPR.',
  sections: [
    {
      heading: '1. Parties and purpose',
      blocks: [
        { p: `This agreement is made between the organization using Hallify (the "Controller") and ${OPERATOR.legalName}, ${OPERATOR.address}, company ID ${OPERATOR.companyId} (the "Processor").` },
        { p: 'It forms an integral annex to the Terms of Service and is entered into when the Controller begins using the Service. It governs the processing of personal data the Controller puts into the Service, under Article 28 of Regulation (EU) 2016/679 (GDPR).' },
        { p: 'In case of conflict with the Terms of Service, this agreement prevails on data protection matters.' },
      ],
    },
    {
      heading: '2. Subject matter, duration and nature',
      blocks: [
        { p: 'The subject matter is the processing of personal data solely to provide the Hallify service — managing halls, reservations, seating layouts and related communication.' },
        { p: 'Processing lasts for the duration of the contractual relationship and ends when the organization is closed, as described in section 10 below.' },
      ],
    },
    {
      heading: '3. Categories of data subjects and data',
      blocks: [
        { p: 'Data subjects:' },
        { list: [
          'The Controller\'s clients who book a venue (client account holders).',
          'Guests listed in an event\'s guest list and seating layout.',
          'The Controller\'s own staff and organization members.',
        ] },
        { p: 'Categories of personal data:' },
        { list: [
          'Identification and contact data: first name, last name, email address.',
          'Reservation data: event title and description, date, guest count, notes.',
          'Guest lists and seating layouts: guest name, optional group/family, and a free-text note.',
          'Message and support ticket content within the organization.',
        ] },
        { p: 'Special categories (Article 9 GDPR): the Service neither requires nor expects them. The per-guest note is a free-text field — the Controller must not enter health data (e.g. allergies) or other special category data into it without its own lawful basis, normally the data subject\'s explicit consent.' },
      ],
    },
    {
      heading: '4. Controller instructions',
      blocks: [
        { p: 'The Processor processes personal data only on documented instructions from the Controller. Use of the Service\'s features, together with these contractual documents, constitutes such instructions.' },
        { p: 'Where the Processor is required to process data by law, it will inform the Controller beforehand unless the law prohibits it. The Processor will promptly inform the Controller if, in its opinion, an instruction infringes the GDPR.' },
      ],
    },
    {
      heading: '5. Confidentiality',
      blocks: [
        { p: 'The Processor ensures that persons authorised to process personal data are bound by confidentiality, and that access is limited to those who need it to provide the Service.' },
      ],
    },
    {
      heading: '6. Security of processing',
      blocks: [
        { p: 'The Processor has implemented appropriate technical and organisational measures under Article 32 GDPR, including:' },
        { list: [
          'Encryption in transit (HTTPS) for all communication with the Service.',
          'Passwords stored only as bcrypt hashes, never in readable form.',
          'Logical separation of each organization\'s data, with role-based access.',
          'Client accounts bound exclusively to their own organization\'s domain.',
          'Time-limited login sessions, with httpOnly and secure cookies.',
          'Rate limiting on login and password reset attempts.',
          'Backup and recovery at the infrastructure provider level.',
        ] },
      ],
    },
    {
      heading: '7. Sub-processors',
      blocks: [
        { p: 'The Controller gives general authorisation for the engagement of sub-processors. As at the date of this agreement these are:' },
        { list: [
          'Cloudflare, Inc. — application hosting, database, storage for uploaded files.',
          'Stripe, Inc. / Stripe Payments Europe, Ltd. — payment processing and invoicing.',
          'Brevo (Sendinblue SAS) — transactional email delivery.',
          'Google Ireland Limited — Google Tag Manager and Google Analytics, only where analytics consent has been given.',
        ] },
        { p: 'The Processor will give advance notice of any intended change or addition, and the Controller may object within a reasonable period, in which case it may terminate the contract. The Processor imposes on each sub-processor the same obligations as in this agreement and remains liable for their performance.' },
      ],
    },
    {
      heading: '8. Assistance',
      blocks: [
        { p: 'The Processor provides reasonable assistance to the Controller with:' },
        { list: [
          'responding to data subject requests (access, rectification, erasure, portability, objection);',
          'obligations under Articles 32 to 36 GDPR, including data protection impact assessments;',
          'communication with the supervisory authority.',
        ] },
        { p: 'Most data subject requests can be handled by the Controller directly in the app — data is viewable, editable, exportable (CSV, printable manifest) and deletable.' },
      ],
    },
    {
      heading: '9. Personal data breaches',
      blocks: [
        { p: 'The Processor notifies the Controller without undue delay after becoming aware of a personal data breach, and provides the information the Controller needs to meet its own notification duties to the supervisory authority and to data subjects.' },
      ],
    },
    {
      heading: '10. Deletion and return',
      blocks: [
        { p: 'On termination of the Service, the Processor will delete or return the data at the Controller\'s choice. Closing an organization in the app deletes its operational data.' },
        { p: 'The Processor may retain a limited archival record (organization identity, subscription, invoices) to the extent and for the period required by law, in particular accounting and tax law.' },
        { p: 'Controllers are advised to export their data before closing an organization.' },
      ],
    },
    {
      heading: '11. Audit',
      blocks: [
        { p: 'The Processor makes available the information necessary to demonstrate compliance with Article 28 GDPR and allows for audits by the Controller or an auditor it mandates. Audits take place on reasonable prior notice, during business hours, in a manner that does not unreasonably disrupt operations, and subject to confidentiality.' },
      ],
    },
    {
      heading: '12. International transfers',
      blocks: [
        { p: 'Where processing involves a transfer of personal data outside the EU/EEA, it takes place on the basis of Standard Contractual Clauses adopted by the European Commission or another valid mechanism under Chapter V GDPR.' },
      ],
    },
  ],
};

// ─── Lookup ───────────────────────────────────────────────────────────────────

export const TERMS: Record<Locale, LegalDoc> = { sk: termsSk, en: termsEn };
export const PRIVACY: Record<Locale, LegalDoc> = { sk: privacySk, en: privacyEn };
export const DPA: Record<Locale, LegalDoc> = { sk: dpaSk, en: dpaEn };

export type LegalKind = 'terms' | 'privacy' | 'dpa';

export const LEGAL_LABELS: Record<Locale, {
  updated: string; backHome: string; otherDoc: string;
  terms: string; privacy: string; dpa: string; draftWarning: string; sectionHeading: string;
}> = {
  sk: {
    updated: 'Naposledy aktualizované',
    backHome: 'Späť na úvod',
    otherDoc: 'Súvisiace',
    terms: 'Obchodné podmienky',
    privacy: 'Ochrana osobných údajov',
    dpa: 'Spracúvanie osobných údajov',
    draftWarning: 'Pracovná verzia — pred spustením musí prejsť právnou kontrolou.',
    sectionHeading: 'Právne informácie',
  },
  en: {
    updated: 'Last updated',
    backHome: 'Back to home',
    otherDoc: 'Related',
    terms: 'Terms of Service',
    privacy: 'Privacy Policy',
    dpa: 'Data Processing Agreement',
    draftWarning: 'Draft — must be reviewed by a lawyer before launch.',
    sectionHeading: 'Legal',
  },
};

export const LEGAL_PATHS: Record<LegalKind, string> = {
  terms: '/terms',
  privacy: '/privacy',
  dpa: '/dpa',
};

/** True while OPERATOR still holds unfilled placeholders. Drives the draft banner.
 *
 *  Checks EVERY field, not just the name: filling the name alone used to switch the
 *  banner off while `[[ DIČ ]]` was still rendering verbatim in the published
 *  documents — the one state in which the warning matters most. */
export const LEGAL_IS_DRAFT = Object.values(OPERATOR).some((v) => v.includes('[['));
