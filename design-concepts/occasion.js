(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const themeButton = $('#theme-toggle');
  let currentTheme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  function updateThemeButton() { themeButton.textContent = currentTheme === 'dark' ? 'Svetlý vzhľad' : 'Tmavý vzhľad'; }
  updateThemeButton();
  themeButton.addEventListener('click', () => { currentTheme = currentTheme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = currentTheme; updateThemeButton(); });
  const audience = new URLSearchParams(location.search).get('audience') === 'business' ? 'business' : 'customer';
  $('#customer-page').hidden = audience !== 'customer';
  $('#business-page').hidden = audience !== 'business';
  document.title = `Hallify · ${audience === 'business' ? 'Pre prevádzkovateľov' : 'Nájdite svoj priestor'} · Occasion`;
  $$('[data-audience]').forEach(link => {
    if (link.dataset.audience === audience && link.closest('nav')) link.setAttribute('aria-current', 'page');
    link.addEventListener('click', event => {
      if (window.parent !== window) {
        event.preventDefault();
        window.parent.postMessage({ type: 'hallify-audience', audience: link.dataset.audience }, location.origin);
      }
    });
  });
  if (audience === 'business') {
    $('#header-action').href = '#partnership';
    $('#header-action').innerHTML = 'Možnosti spolupráce <span aria-hidden="true">↗</span>';
  }
  const categories = {
    wedding: { word: 'veľké áno.', description: 'Nájdite miesto, v ktorom si viete predstaviť svoj deň.', image: 'occasion-wedding.jpg', alt: 'Priestranná spoločenská sála s okrúhlymi stolmi a krištáľovými lustrami', title: 'Sála pod lustrami', capacity: 140, type: 'Svadba' },
    celebration: { word: 'spoločné chvíle.', description: 'Za jedným stolom, so všetkými, na ktorých vám záleží.', image: 'occasion-celebration.jpg', alt: 'Slávnostne prestretý stôl s pestrými kvetmi a pohármi', title: 'Večera v záhrade', capacity: 110, type: 'Oslava' },
    conference: { word: 'nové nápady.', description: 'Dajte svojmu tímu priestor stretnúť sa a posunúť veci ďalej.', image: 'occasion-conference.jpg', alt: 'Konferenčný priestor s okrúhlymi stolmi a prezentačnými plátnami', title: 'Fórum pre stretnutia', capacity: 160, type: 'Firemné podujatie' }
  };
  let activeCategory = 'wedding';
  function animate(element) {
    element.classList.remove('content-switch');
    void element.offsetWidth;
    element.classList.add('content-switch');
  }
  $$('[data-category]').forEach(button => button.addEventListener('click', () => {
    activeCategory = button.dataset.category;
    const data = categories[activeCategory];
    $$('[data-category]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    $('#hero-word').textContent = data.word;
    $('#hero-description').textContent = data.description;
    $('#hero-image').src = `assets/${data.image}`;
    $('#hero-image').alt = data.alt;
    $('#venue-image').src = `assets/${data.image}`;
    $('#venue-image').alt = data.alt;
    $('#venue-title').textContent = data.title;
    $('#venue-meta').textContent = `Západné Slovensko · do ${data.capacity} hostí`;
    $('[data-venue="partner"]').setAttribute('aria-label', `Zobraziť detail priestoru ${data.title}`);
    animate($('#hero-image'));
    animate($('#hero-word'));
    filterVenues();
  }));
  function filterVenues() {
    const region = $('#region').value;
    const size = $('#guests').value;
    let count = 0;
    $$('.venue-card').forEach(card => {
      card.hidden = !((region === 'all' || region === card.dataset.region) && (size === 'all' || size === card.dataset.size));
      if (!card.hidden) count++;
    });
    $('#empty-state').hidden = count !== 0;
    $('#results-note').textContent = `${count} ${count === 1 ? 'ilustračný priestor' : 'ilustračné priestory'}. Fotografie nepredstavujú konkrétne slovenské prevádzky.`;
  }
  $('#discovery-form').addEventListener('submit', event => { event.preventDefault(); filterVenues(); });
  $('#reset-filters').addEventListener('click', () => { $('#discovery-form').reset(); filterVenues(); });
  const venueDialog = $('#venue-dialog');
  const pathDialog = $('#path-dialog');
  function openDialog(dialog) { dialog.showModal(); document.body.classList.add('modal-open'); }
  $$('dialog').forEach(dialog => {
    $('[data-close]', dialog).addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => document.body.classList.remove('modal-open'));
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const bounds = dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
    });
  });
  const dateText = date => new Intl.DateTimeFormat('sk-SK', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${date}T12:00:00`));
  function openVenue(kind) {
    const data = kind === 'partner' ? categories[activeCategory] : { title: 'Pri dlhom stole', image: 'occasion-celebration.jpg', alt: 'Stôl pripravený na slávnostné podujatie', capacity: 70, type: 'Oslava' };
    const isPartner = kind === 'partner';
    $('#venue-dialog-content').innerHTML = `
      <img class="dialog-photo" src="assets/${data.image}" alt="${data.alt}" width="1400" height="935">
      <div class="dialog-body"><p class="venue-kind">${isPartner ? 'Partnerský profil' : 'Záznam v katalógu'} · ilustračný priestor</p><h2 id="dialog-title">${data.title}</h2>
      <p>${isPartner ? 'Západné' : 'Stredné'} Slovensko, do ${data.capacity} hostí. Fotografia je ilustračná.</p>
      <p>${isPartner ? 'V návrhu partnerského profilu si pozriete podrobnosti a pripravíte dopyt na jeden deň alebo celý víkend.' : 'Základný profil pomôže objaviť priestor. Termín, cenu a vybavenie si návštevník overí priamo u prevádzkovateľa.'}</p>
      ${isPartner ? `<form id="inquiry-form"><div class="form-dates"><label>Od dátumu<input type="date" id="date-from" name="from" required min="2026-10-13" value="2026-11-20"></label><label>Do dátumu<input type="date" id="date-to" name="to" required min="2026-11-20" value="2026-11-21"></label></div><label>Počet hostí<input type="number" id="inquiry-guests" min="1" max="${data.capacity}" required value="70"></label><p>Cena na vyžiadanie. Dostupnosť a podmienky potvrdí prevádzka.</p><button type="submit" class="button primary">Pripraviť náhľad dopytu <span aria-hidden="true">↗</span></button></form><div class="request-preview" id="request-preview" hidden aria-live="polite"></div>` : `<div class="request-preview"><h3>Ďalší krok: kontaktovať prevádzku</h3><p>V živom katalógu by tu bol overený telefón, e-mail alebo web prevádzky. Tento koncept neobsahuje skutočné kontaktné údaje.</p></div>`}
      <p class="demo-note">Ukážka plánovanej služby. Nejde o rezerváciu a žiadny dopyt sa neodošle.</p></div>`;
    if (isPartner) {
      $('#date-from').addEventListener('change', () => {
        $('#date-to').min = $('#date-from').value;
        if ($('#date-to').value < $('#date-from').value) $('#date-to').value = $('#date-from').value;
        $('#request-preview').hidden = true;
      });
      $('#inquiry-form').addEventListener('input', () => { $('#request-preview').hidden = true; });
      $('#inquiry-form').addEventListener('submit', event => {
        event.preventDefault();
        const from = $('#date-from').value;
        const to = $('#date-to').value;
        const guests = Number($('#inquiry-guests').value);
        if (!from || !to || to < from || guests < 1 || guests > data.capacity) return;
        const days = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
        const preview = $('#request-preview');
        preview.replaceChildren();
        const heading = document.createElement('h3'); heading.textContent = 'Váš dopyt je pripravený na kontrolu.';
        const summary = document.createElement('p'); summary.textContent = `${data.type} v priestore ${data.title}. ${dateText(from)}${from !== to ? ` až ${dateText(to)}` : ''}, ${days} ${days === 1 ? 'deň' : days < 5 ? 'dni' : 'dní'}, ${guests} hostí.`;
        const detail = document.createElement('p'); detail.textContent = 'Cena na vyžiadanie. Termín ešte nie je potvrdený. V tejto ukážke sa dopyt neodosiela.'; detail.style.marginTop = '12px';
        preview.append(heading, summary, detail); preview.hidden = false;
        preview.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'nearest' });
      });
    }
    openDialog(venueDialog);
  }
  $$('[data-venue]').forEach(button => button.addEventListener('click', () => openVenue(button.dataset.venue)));
  let selectedStep = 'discovery';
  let calendarAdded = false;
  let selectedDay = 20;
  let layout = 'banquet';
  const stepTemplates = {
    discovery: () => `<div class="step-copy"><h3>Najprv si vás<br>niekto všimne.</h3><p>Fotografie a základné informácie pomôžu človeku predstaviť si podujatie vo vašom priestore.</p><button type="button" class="button primary" data-next="inquiry">Pozrieť nadväzujúci dopyt <span aria-hidden="true">↗</span></button></div><div class="step-visual"><img src="assets/occasion-wedding.jpg" alt="Ilustračná sála partnerského profilu" width="1800" height="1163"><p class="venue-kind">Ukážka partnerského profilu</p><h4>Sála pod lustrami</h4><p>Západné Slovensko · do 140 hostí</p><button type="button" class="text-button" data-demo-detail>Pozrieť detail priestoru <span aria-hidden="true">↗</span></button></div>`,
    inquiry: () => `<div class="step-copy"><h3>A potom sa<br>začne rozhovor.</h3><p>V dopyte už poznáte typ podujatia, počet hostí aj celý rozsah dátumov. Odpoveď zostáva vo vašich rukách.</p><button type="button" class="button primary" id="add-calendar">${calendarAdded ? 'Pozrieť termín v kalendári' : 'Označiť termín ako dopyt'} <span aria-hidden="true">↗</span></button></div><div class="step-visual"><p class="venue-kind">Ukážkový dopyt</p><h4>Svadobný víkend</h4><dl class="mini-data"><div><dt>Začiatok</dt><dd>20. november 2026</dd></div><div><dt>Koniec</dt><dd>22. november 2026</dd></div><div><dt>Hostia</dt><dd>70 ľudí</dd></div><div><dt>Cena</dt><dd>Na vyžiadanie</dd></div></dl><p class="inquiry-status">${calendarAdded ? 'Dopyt je v ukážkovom kalendári. Nie je potvrdený.' : 'Čaká na vašu odpoveď. Termín nie je rezervovaný.'}</p><p style="margin-top:16px">„Radi by sme priestor využili aj na prípravu a upratanie.“</p></div>`,
    calendar: () => `<div class="step-copy"><h3>Celý víkend.<br>V jednom prehľade.</h3><p>Rozsah ukazuje prípravu aj samotné podujatie. Vyberte deň a pozrite si jeho úlohu v pláne.</p><button type="button" class="button primary" data-next="floorplan">Prejsť k usporiadaniu <span aria-hidden="true">↗</span></button></div><div class="step-visual"><p class="venue-kind">Ukážkový kalendár</p><h4>November 2026</h4><div class="calendar-strip" aria-label="Týždeň od 16. do 22. novembra 2026">${['Po','Ut','St','Št','Pi','So','Ne'].map(day => `<span class="weekday">${day}</span>`).join('')}${[16,17,18,19,20,21,22].map(day => day >= 20 ? `<button type="button" data-day="${day}" aria-pressed="${selectedDay === day}" aria-label="${day}. november: ${day === 20 ? 'Príprava' : day === 21 ? 'Podujatie' : 'Odovzdanie'}">${day}</button>` : `<span>${day}</span>`).join('')}</div><p class="calendar-note" id="calendar-note">${dayDescription(selectedDay)}</p><p class="inquiry-status" style="margin-top:18px">${calendarAdded ? 'Označené ako dopyt. Vyžaduje potvrdenie prevádzky.' : 'Návrh termínu. Pridáte ho v časti Dopyt.'}</p></div>`,
    floorplan: () => `<div class="step-copy"><h3>Aj rozloženie<br>má svoj príbeh.</h3><p>Vyskúšajte dve usporiadania priestoru. Skutočnú kapacitu a vybavenie vždy určí konkrétna prevádzka.</p><button type="button" class="button primary" data-path="partner">Preskúmať partnerský profil <span aria-hidden="true">↗</span></button></div><div class="step-visual"><p class="venue-kind">Schematický pôdorys</p><h4>Priestor pre vaše podujatie</h4><div class="layout-control" aria-label="Usporiadanie sály"><button type="button" data-layout="banquet" aria-pressed="${layout === 'banquet'}">Banket</button><button type="button" data-layout="theatre" aria-pressed="${layout === 'theatre'}">Divadlo</button></div><div class="floorplan ${layout === 'theatre' ? 'theatre' : ''}" id="floorplan" role="img" aria-label="${layout === 'banquet' ? 'Osem okrúhlych stolov pred pódiom' : 'Tridsaťdva sedadiel v radoch pred pódiom'}">${Array.from({length:layout === 'banquet' ? 8 : 32}, () => '<span class="table"></span>').join('')}</div><p id="layout-note">${layout === 'banquet' ? 'Banket: okrúhle stoly a priestor na rozhovory.' : 'Divadlo: rady sedadiel orientované na pódium.'}</p></div>`
  };
  function dayDescription(day) { return day === 20 ? '20. november: príprava a výzdoba.' : day === 21 ? '21. november: svadobné podujatie.' : '22. november: upratanie a odovzdanie priestoru.'; }
  function renderStep(step, focus = false) {
    selectedStep = step;
    $$('[data-step]').forEach(button => { const selected = button.dataset.step === step; button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1; });
    const panel = $('#journey-panel');
    panel.setAttribute('aria-labelledby', `tab-${step}`);
    panel.innerHTML = stepTemplates[step]();
    animate(panel);
    if (focus) panel.focus({ preventScroll: true });
  }
  $$('[data-step]').forEach(button => {
    button.addEventListener('click', () => renderStep(button.dataset.step));
    button.addEventListener('keydown', event => {
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault();
      const tabs = $$('[data-step]');
      let index = tabs.indexOf(button);
      index = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      renderStep(tabs[index].dataset.step); tabs[index].focus();
    });
  });
  $('#journey-panel').addEventListener('click', event => {
    const target = event.target.closest('button');
    if (!target) return;
    if (target.dataset.next) renderStep(target.dataset.next, true);
    if (target.hasAttribute('data-demo-detail')) openVenue('partner');
    if (target.id === 'add-calendar') { calendarAdded = true; renderStep('calendar', true); }
    if (target.dataset.day) {
      selectedDay = Number(target.dataset.day);
      $$('[data-day]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.day) === selectedDay)));
      $('#calendar-note').textContent = dayDescription(selectedDay);
    }
    if (target.dataset.layout) {
      layout = target.dataset.layout;
      renderStep('floorplan');
      $(`[data-layout="${layout}"]`).focus({ preventScroll: true });
    }
  });
  renderStep('discovery');
  let selectedPath = 'partner';
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-path]');
    if (!button) return;
    selectedPath = button.dataset.path;
    $('#path-copy').textContent = selectedPath === 'partner' ? 'Partnerský profil môže prepojiť prezentáciu priestoru s dopytmi, termínmi a pôdorysom. Skúste si jeho úvod.' : 'Začnite názvom a lokalitou. Základný záznam pomôže návštevníkovi objaviť váš priestor a kontaktovať vás.';
    $('#path-form').reset(); $('#profile-preview').hidden = true;
    openDialog(pathDialog);
  });
  $('#path-form').addEventListener('input', () => { $('#profile-preview').hidden = true; });
  $('#path-form').addEventListener('submit', event => {
    event.preventDefault();
    const name = $('#path-name').value.trim();
    const locationName = $('#path-location').value.trim();
    if (!name || !locationName) return;
    const preview = $('#profile-preview'); preview.replaceChildren();
    const label = document.createElement('p'); label.className = 'venue-kind'; label.textContent = selectedPath === 'partner' ? 'Náhľad partnerského profilu' : 'Náhľad záznamu v katalógu';
    const title = document.createElement('h3'); title.textContent = name;
    const place = document.createElement('p'); place.textContent = locationName;
    const next = document.createElement('p'); next.style.marginTop = '12px'; next.textContent = selectedPath === 'partner' ? 'V ďalšom kroku by ste doplnili fotografie, kapacitu a možnosti prijímania dopytov.' : 'V ďalšom kroku by ste doplnili základné informácie a kontaktné údaje.';
    preview.append(label, title, place, next); preview.hidden = false;
  });
})();
