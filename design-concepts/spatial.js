/* Spatial is a native-CSS concept, with illustrative room geometry and local-only state. */
(() => {
  'use strict';
  const query = new URLSearchParams(location.search);
  const audience = query.get('audience') === 'business' ? 'business' : 'customer';
  const business = audience === 'business';
  const app = document.querySelector('#app');
  document.body.dataset.audience = audience;
  document.title = business ? 'Hallify · Viac možností. Jeden priestor.' : 'Hallify · Priestor pre váš veľký plán';

  const header = `
    <header class="site-header">
      <a class="logo-link" href="#main" aria-label="Hallify, začiatok stránky"><img src="../static/Hallify.svg" alt="" width="31" height="31"><span>Hallify</span></a>
      <nav class="navigation" aria-label="Hlavné menu">${business ? '<a href="#platforma">Platforma</a><a href="#spolupraca">Ako to funguje</a><a href="#partnerstvo">Partnerstvo</a>' : '<a href="#priestory">Objaviť priestory</a><a href="#priestor">Plánovať podujatie</a><a href="#otazky">Ako to funguje</a>'}</nav>
      <button class="audience-link" data-audience="${business ? 'customer' : 'business'}">${business ? 'Hľadám priestor' : 'Pre prevádzkovateľov'} <span aria-hidden="true">↗</span></button>
    </header>
    <div class="demo-label">Interaktívny koncept · ukážkové údaje</div>`;

  function model() {
    const tables = Array.from({length:6}, () => `<div class="banquet-table">${'<i class="chair"></i>'.repeat(8)}</div>`).join('');
    return `
      <div class="model-module" id="priestor">
        <div class="model-heading"><span class="model-status">Ateliér 01 <span class="muted">/ vzorový priestor</span></span><span class="muted">240 m²</span></div>
        <div class="model-stage" data-layout="banquet" data-view="3d" role="img" aria-label="Ilustračný 3D pôdorys sály: banket so šiestimi okrúhlymi stolmi a pódiom.">
          <div class="room-wrap"><div class="room"><div class="wall wall-back"></div><div class="wall wall-left"></div><div class="platform"><span>PÓDIUM</span></div><div class="furniture">${tables}</div><div class="conference-seats">${'<i class="conference-seat"></i>'.repeat(42)}</div></div><span class="dimension dimension-x">20 m</span><span class="dimension dimension-y">12 m</span></div>
          <span class="floor-caption">Ilustračný model · zjednodušené sedenie</span>
          <div class="camera-controls" role="group" aria-label="Pohľad na priestor"><button type="button" data-view="2d" aria-pressed="false">2D</button><button type="button" data-view="3d" aria-pressed="true">3D</button></div>
        </div>
        <div class="model-settings"><div class="segmented" role="group" aria-label="Usporiadanie priestoru"><button type="button" data-layout="banquet" aria-pressed="true">Banket</button><button type="button" data-layout="conference" aria-pressed="false">Konferencia</button></div><div class="capacity" aria-live="polite"><div><strong id="capacity-value">96</strong> hostí</div><small>Vzorová kapacita usporiadania</small></div></div>
        <div class="rotation-row"><label for="room-rotation">Otočiť priestor</label><input id="room-rotation" type="range" min="-55" max="25" value="-28" aria-label="Otočenie 3D priestoru v stupňoch"><output for="room-rotation" id="rotation-value">−28°</output></div>
        <p class="space-note">Skúste zmeniť usporiadanie. Kapacitu aj reálny pôdorys vždy potvrdzuje prevádzkovateľ.</p>
      </div>`;
  }

  function calendar() {
    const blanks = '<span class="calendar-empty" aria-hidden="true"></span>'.repeat(3);
    const days = Array.from({length:31}, (_,i) => { const day=i+1;return `<button type="button" data-day="${day}" class="${[9,10,16,17,23].includes(day)?'has-event':''}" aria-label="${day}. október 2026${[9,10,16,17,23].includes(day)?', ukážková udalosť':''}" aria-pressed="${day===16}">${day}</button>`; }).join('');
    return `<aside class="workbench-sidebar" aria-label="Ukážka rezervácií"><div class="workspace-name"><div class="workspace-monogram">A</div><div>Ateliér 01<span>Pracovný priestor · demo</span></div></div><div class="workspace-tabs"><button data-workspace="calendar" aria-pressed="true">Kalendár</button><button data-workspace="layout" aria-pressed="false">Pôdorys</button></div><div class="mini-calendar"><div class="mini-calendar-header">Október 2026 <span>Ukážka</span></div><div class="calendar-week">${['Po','Ut','St','Št','Pi','So','Ne'].map(d=>`<span>${d}</span>`).join('')}</div><div class="calendar-days">${blanks}${days}</div></div><div class="booking-preview" aria-live="polite"><span id="booking-date">16. – 17. október</span><strong id="booking-name">Firemné stretnutie</strong><p id="booking-meta">2 dni · 80 hostí · dopyt</p></div><p class="workspace-note">Kliknite na dátum. Udalosti sú ukážkové, kalendár neukazuje reálnu dostupnosť.</p></aside>`;
  }

  const customer = `
    <section class="hero" aria-labelledby="hero-title"><div class="hero-copy"><p class="eyebrow">Miesto, kde sa to začne</p><h1 id="hero-title">Priestor pre<br>váš <em>veľký plán.</em></h1><p class="hero-description">Nájdite sálu na mape. Preskúmajte možnosti. Predstavte si svoj event ešte pred prvou obhliadkou.</p><div class="hero-actions"><a class="button primary" href="#priestory">Nájsť priestor <span aria-hidden="true">↗</span></a><button class="button text-button" data-demo="customer">Začať plánovať <span aria-hidden="true">+</span></button></div></div>${model()}</section>
    <div class="hero-foot"><div><i class="mini-symbol" aria-hidden="true">⌖</i><div><b>Výber podľa miesta</b><span>Od mapy ku konkrétnej sále.</span></div></div><div><i class="mini-symbol" aria-hidden="true">⌑</i><div><b>Priestor podľa vás</b><span>Kapacita, zázemie, usporiadanie.</span></div></div><div><i class="mini-symbol" aria-hidden="true">↗</i><div><b>Ďalší krok je jasný</b><span>Dopyt priamo prevádzkovateľovi.</span></div></div></div>
    <section class="section reveal" id="priestory" aria-labelledby="discovery-title"><div class="discovery-heading"><h2 class="section-title" id="discovery-title">Dobré miesto.<br>Ešte lepšie možnosti.</h2><p class="section-intro">Vyberte bod na mape a spoznajte priestor. Partnerský profil ukáže viac; pri základnom zázname začnete kontaktom.</p></div><div class="map-layout"><div class="map" role="group" aria-label="Schéma oblasti s tromi ukážkovými priestormi"><div class="map-road"></div><div class="map-block block-one"></div><div class="map-block block-two"></div><div class="map-block block-three"></div><span class="map-label">Centrum</span><button class="map-pin" data-venue="atelier" aria-pressed="true">Ateliér 01</button><button class="map-pin" data-venue="gallery" aria-pressed="false">Galéria 02</button><button class="map-pin" data-venue="garden" aria-pressed="false">Záhrada 03</button><span class="map-caption">Schéma oblasti · ukážkové miesta</span></div><article class="venue-detail" aria-live="polite"><p class="venue-type" id="venue-type">Partnerský profil · ukážka</p><h3 id="venue-name">Ateliér 01</h3><p class="venue-location" id="venue-location">Mestský priestor · Bratislava</p><p class="venue-description" id="venue-description">Otvorená sála, ktorú si viete predstaviť ako konferenciu aj večerný banket.</p><dl class="venue-facts"><div><dt>Vzorová kapacita</dt><dd id="venue-capacity">96 – 144 hostí</dd></div><div><dt>Pôdorys</dt><dd id="venue-plan">2D / 3D</dd></div></dl><button class="button" id="venue-cta" data-demo="venue">Preskúmať možnosti <span aria-hidden="true">↗</span></button><p class="venue-disclaimer" id="venue-disclaimer">Termín a cenu potvrdí prevádzkovateľ.</p></article></div></section>
    <section class="section planning-section reveal" id="otazky" aria-labelledby="planning-title"><div class="planning-copy"><h2 class="section-title" id="planning-title">Menej otáznikov.<br>Viac predstavy.</h2><p class="section-intro">Od prvého nápadu po dopyt, ktorý dáva prevádzkovateľovi všetko podstatné.</p><button class="button text-button" data-demo="customer">Pripraviť svoj dopyt <span aria-hidden="true">↗</span></button></div><div class="questions"><details open><summary>Zmestí sa sem náš event?</summary><p>Prepínajte usporiadanie a porovnajte kapacitu. Ilustračný pôdorys pomáha s predstavou; presné rozmery, vybavenie a možnosti potvrdí sála.</p></details><details><summary>A čo podujatie na viac dní?</summary><p>V dopyte zvoľte začiatok aj koniec. Prevádzkovateľ s vami overí celý termín vrátane prípravy a upratovania.</p></details><details><summary>Je zobrazený termín naozaj voľný?</summary><p>Kalendár závisí od údajov partnera. Ak dostupnosť nepoznáme alebo potrebuje potvrdenie, pošlete dopyt priamo prevádzkovateľovi.</p></details><details><summary>Kedy budeme vedieť konečnú cenu?</summary><p>Prípadný cenový odhad je orientačný. Konečnú ponuku podľa termínu, počtu hostí a služieb vám pripraví prevádzkovateľ.</p></details></div></section>`;

  const businessPage = `
    <section class="business-hero" id="platforma" aria-labelledby="hero-title"><div class="business-intro"><div><p class="eyebrow">Hallify pre prevádzkovateľov</p><h1 id="hero-title">Viac možností.<br><em>Jeden priestor.</em></h1></div><div class="business-intro-side"><p class="hero-description">Ukážte, čo vaša sála dokáže. Spojte jej profil, termíny a usporiadania do jedného pracovného priestoru.</p><button class="button primary" data-demo="business">Vyskúšať pracovný priestor <span aria-hidden="true">↗</span></button></div></div><div class="workbench">${calendar()}<div class="workbench-main">${model()}</div></div><div class="business-proof"><span><strong>Objaviteľnosť</strong> &nbsp; Verejný profil na mape.</span><span><strong>Kontext</strong> &nbsp; Dopyty s dátumom aj počtom hostí.</span><span><strong>Kontrola</strong> &nbsp; Ponuku a termín potvrdzujete vy.</span></div></section>
    <section class="section workflow-section reveal" id="spolupraca" aria-labelledby="workflow-title"><h2 class="section-title" id="workflow-title">Od „máte voľno?“<br>k spoločnému plánu.</h2><p class="section-intro">Jeden profil pre zákazníkov. Jeden pracovný priestor pre váš tím. Vyberte si krok a pozrite sa bližšie.</p><div class="workflow-content"><div class="workflow-options" role="group" aria-label="Kroky spolupráce"><button class="workflow-option" data-workflow="profile" aria-pressed="true"><span class="workflow-number">01</span><span><b>Ukážte priestor</b><small>Fotografie, zázemie a usporiadania dávajú zákazníkovi konkrétnu predstavu.</small></span><span class="workflow-arrow" aria-hidden="true">↗</span></button><button class="workflow-option" data-workflow="request" aria-pressed="false"><span class="workflow-number">02</span><span><b>Dostaňte zrozumiteľný dopyt</b><small>Typ akcie, počet hostí a celý termín na jednom mieste.</small></span><span class="workflow-arrow" aria-hidden="true">↗</span></button><button class="workflow-option" data-workflow="plan" aria-pressed="false"><span class="workflow-number">03</span><span><b>Zlaďte realizáciu</b><small>Pripravte usporiadanie a potvrďte detaily spolu s tímom.</small></span><span class="workflow-arrow" aria-hidden="true">↗</span></button></div><div class="workflow-preview" aria-live="polite"><div class="workflow-preview-top"><span id="workflow-preview-label">Partnerský profil</span><span>Ukážka</span></div><div><h3 id="workflow-preview-title">Priestor v správnom kontexte.</h3><p id="workflow-preview-copy">Čo sa zmestí. Čo je k dispozícii. Koho kontaktovať. Záujemca začína s lepšou predstavou.</p><div class="profile-tokens" id="workflow-tokens"><span>Kapacita</span><span>Pôdorys</span><span>Vybavenie</span><span>Kontakt</span></div></div><div class="workflow-result"><i aria-hidden="true">↗</i><span id="workflow-result-text">Z mapy priamo na profil vášho priestoru.</span></div></div></div></section>
    <section class="section partner-section reveal" id="partnerstvo" aria-labelledby="partner-title"><div><h2 class="section-title" id="partner-title">Byť na mape<br>je len začiatok.</h2><p class="section-intro">Rozšírený partnerský profil premení základný záznam na miesto, kde sa dá začať plánovať.</p><button class="button primary" data-demo="business">Pripraviť ukážkový event <span aria-hidden="true">↗</span></button></div><div class="partner-features"><div class="partner-feature"><span aria-hidden="true">+</span><div><b>Prezentácia podľa vás</b><p>Popis, fotografie a vybavenie pod vašou správou. Základný záznam v adresári zostáva jasne odlíšený.</p></div></div><div class="partner-feature"><span aria-hidden="true">+</span><div><b>Pripravené aj na viac dní</b><p>Podujatie, príprava aj odovzdanie priestoru v spoločnom časovom kontexte.</p></div></div><div class="partner-feature"><span aria-hidden="true">+</span><div><b>Prísľuby máte pod kontrolou</b><p>Dostupnosť podľa vašich údajov. Individuálna cenová ponuka a potvrdenie rezervácie od vášho tímu.</p></div></div></div></section>`;

  app.innerHTML = `<div class="wrap">${header}<main id="main">${business ? businessPage : customer}</main><footer><span class="footer-brand">hallify.</span><p class="footer-note">Priestory, ktoré dávajú vašim plánom miesto.<br>Spatial · návrh budúceho produktu, ukážkové dáta a funkcie.</p></footer></div>`;

  const modelStage = document.querySelector('.model-stage');
  const rotation = document.querySelector('#room-rotation');
  const room = document.querySelector('.room-wrap');
  let layout = 'banquet';
  let selectedVenue = 'atelier';

  document.querySelectorAll('[data-audience]').forEach(button => button.addEventListener('click', () => {
    const next = button.dataset.audience;
    if (window.parent !== window && location.origin !== 'null') window.parent.postMessage({type:'hallify-audience', audience:next}, location.origin);
    else { const url = new URL(location.href); url.searchParams.set('audience',next); location.href = url.href; }
  }));

  function setLayout(next) {
    layout = next;
    modelStage.dataset.layout = next;
    const banquet = next === 'banquet';
    document.querySelectorAll('button[data-layout]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.layout===next)));
    document.querySelector('#capacity-value').textContent = banquet ? '96' : '144';
    modelStage.setAttribute('aria-label',`Ilustračný ${modelStage.dataset.view.toUpperCase()} pôdorys sály: ${banquet ? 'banket so šiestimi okrúhlymi stolmi a pódiom' : 'konferencia s radmi sedadiel a pódiom'}. Zobrazenie sedenia je zjednodušené.`);
  }
  document.querySelectorAll('button[data-layout]').forEach(button=>button.addEventListener('click',()=>setLayout(button.dataset.layout)));
  document.querySelectorAll('button[data-view]').forEach(button=>button.addEventListener('click',()=>{
    const view=button.dataset.view;
    modelStage.dataset.view=view;
    document.querySelectorAll('button[data-view]').forEach(other=>other.setAttribute('aria-pressed',String(other===button)));
    rotation.disabled=view==='2d';
    document.querySelector('.rotation-row').classList.toggle('disabled',view==='2d');
    setLayout(layout);
  }));
  rotation.addEventListener('input',()=>{
    room.style.setProperty('--rotation',`${rotation.value}deg`);
    document.querySelector('#rotation-value').textContent=`${rotation.value.replace('-','−')}°`;
  });

  const venues = {
    atelier:{name:'Ateliér 01',type:'Partnerský profil · ukážka',location:'Mestský priestor · Bratislava',description:'Otvorená sála, ktorú si viete predstaviť ako konferenciu aj večerný banket.',capacity:'96 – 144 hostí',plan:'2D / 3D',cta:'Preskúmať možnosti',disclaimer:'Termín a cenu potvrdí prevádzkovateľ.'},
    gallery:{name:'Galéria 02',type:'Základný záznam · ukážka',location:'Galéria · Bratislava',description:'Komorné miesto pre stretnutia a menšie podujatia. Ďalšie informácie získate priamo od prevádzkovateľa.',capacity:'Na overenie',plan:'Nedodaný',cta:'Pripraviť otázky',disclaimer:'Dostupnosť ani cena nie sú v adresári uvedené.'},
    garden:{name:'Záhrada 03',type:'Partnerský profil · ukážka',location:'Priestor so záhradou · okolie Bratislavy',description:'Sála s vonkajším zázemím pre oslavy aj viacdňové firemné stretnutia.',capacity:'60 – 100 hostí',plan:'Na vyžiadanie',cta:'Naplánovať dopyt',disclaimer:'Možnosti záhrady a termín overte s prevádzkovateľom.'}
  };
  document.querySelectorAll('[data-venue]').forEach(button=>button.addEventListener('click',()=>{
    selectedVenue=button.dataset.venue;
    const venue=venues[selectedVenue];
    for (const key of ['name','type','location','description','capacity','plan','disclaimer']) document.querySelector(`#venue-${key}`).textContent=venue[key];
    document.querySelector('#venue-cta').innerHTML=`${venue.cta} <span aria-hidden="true">↗</span>`;
    document.querySelectorAll('[data-venue]').forEach(other=>other.setAttribute('aria-pressed',String(other===button)));
  }));

  document.querySelectorAll('[data-day]').forEach(button=>button.addEventListener('click',()=>{
    const day=Number(button.dataset.day);
    document.querySelectorAll('[data-day]').forEach(other=>other.setAttribute('aria-pressed',String(other===button)));
    const event=[9,10].includes(day) ? {date:'9. – 10. október',name:'Súkromná oslava',meta:'2 dni · 96 hostí · ukážka',layout:'banquet'} : [16,17].includes(day) ? {date:'16. – 17. október',name:'Firemné stretnutie',meta:'2 dni · 80 hostí · dopyt',layout:'conference'} : day===23 ? {date:'23. október',name:'Odborná konferencia',meta:'1 deň · 144 hostí · ukážka',layout:'conference'} : {date:`${day}. október`,name:'Bez ukážkovej udalosti',meta:'Skutočná dostupnosť nie je známa',layout};
    document.querySelector('#booking-date').textContent=event.date;
    document.querySelector('#booking-name').textContent=event.name;
    document.querySelector('#booking-meta').textContent=event.meta;
    setLayout(event.layout);
  }));
  document.querySelectorAll('[data-workspace]').forEach(button=>button.addEventListener('click',()=>{
    document.querySelectorAll('[data-workspace]').forEach(other=>other.setAttribute('aria-pressed',String(other===button)));
    if(button.dataset.workspace==='layout') document.querySelector('button[data-layout="banquet"]').focus();
    else document.querySelector('[data-day="16"]').focus();
  }));

  const workflows={
    profile:{label:'Partnerský profil',title:'Priestor v správnom kontexte.',copy:'Čo sa zmestí. Čo je k dispozícii. Koho kontaktovať. Záujemca začína s lepšou predstavou.',tokens:['Kapacita','Pôdorys','Vybavenie','Kontakt'],result:'Z mapy priamo na profil vášho priestoru.'},
    request:{label:'Prichádzajúci dopyt',title:'Základné otázky už majú odpoveď.',copy:'Vzorové firemné stretnutie: 80 hostí, dva dni, konferenčné sedenie. Na termíne a ponuke sa dohodnete vy.',tokens:['16. – 17. október','80 hostí','Konferencia'],result:'Dopyt čaká na vaše potvrdenie, nie je rezerváciou.'},
    plan:{label:'Príprava podujatia',title:'Jeden plán pre celý tím.',copy:'Priraďte usporiadanie k podujatiu. Poznačte prípravu, techniku a odovzdanie priestoru.',tokens:['Usporiadanie','Technika','Príprava','Odovzdanie'],result:'Finálne detaily ostávajú pod vašou kontrolou.'}
  };
  document.querySelectorAll('[data-workflow]').forEach(button=>button.addEventListener('click',()=>{
    const data=workflows[button.dataset.workflow];
    document.querySelectorAll('[data-workflow]').forEach(other=>other.setAttribute('aria-pressed',String(other===button)));
    document.querySelector('#workflow-preview-label').textContent=data.label;
    document.querySelector('#workflow-preview-title').textContent=data.title;
    document.querySelector('#workflow-preview-copy').textContent=data.copy;
    document.querySelector('#workflow-tokens').innerHTML=data.tokens.map(token=>`<span>${token}</span>`).join('');
    document.querySelector('#workflow-result-text').textContent=data.result;
  }));

  const dialog=document.querySelector('#demo-dialog');
  const form=document.querySelector('#demo-form');
  const result=document.querySelector('#demo-result');
  const start=document.querySelector('#event-start');
  const end=document.querySelector('#event-end');
  document.querySelectorAll('[data-demo]').forEach(button=>button.addEventListener('click',()=>{
    const kind=button.dataset.demo;
    document.querySelector('#dialog-title').textContent=kind==='business'?'Váš prvý ukážkový event.':kind==='venue'?`Plán pre ${venues[selectedVenue].name}.`:'Začnime vaším plánom.';
    document.querySelector('#dialog-intro').textContent=kind==='business'?'Vyskúšajte zadanie viacdňového podujatia. Tento koncept sa nepripája k žiadnemu účtu.':kind==='venue'&&selectedVenue==='gallery'?'Tento základný záznam nemá overenú dostupnosť. Pripravte si informácie pre prevádzkovateľa.':'Zadajte základné informácie a pozrite si zhrnutie dopytu. Táto ukážka nič neodosiela.';
    form.hidden=false;result.hidden=true;result.replaceChildren();
    dialog.showModal();
    document.querySelector('#event-name').focus();
  }));
  start.addEventListener('change',()=>{end.min=start.value;if(end.value&&end.value<start.value)end.value=start.value;end.setCustomValidity('');});
  end.addEventListener('change',()=>end.setCustomValidity(start.value&&end.value<start.value?'Koniec podujatia musí byť v deň začiatku alebo neskôr.':''));
  form.addEventListener('submit',event=>{
    event.preventDefault();
    if(end.value<start.value){end.setCustomValidity('Koniec podujatia musí byť v deň začiatku alebo neskôr.');end.reportValidity();return;}
    const values=new FormData(form);
    const heading=document.createElement('strong');heading.textContent=String(values.get('name'));
    const summary=document.createElement('p');
    const format=value=>new Intl.DateTimeFormat('sk-SK',{day:'numeric',month:'long',year:'numeric'}).format(new Date(`${value}T12:00:00`));
    summary.textContent=`${format(values.get('start'))} – ${format(values.get('end'))} · ${values.get('guests')} hostí · ${layout==='banquet'?'banket':'konferencia'}`;
    const note=document.createElement('p');note.className='result-note';note.textContent='Ukážkový plán je pripravený. V budúcom produkte by nasledovalo overenie možností s prevádzkovateľom. Nič sa neodoslalo ani nerezervovalo.';
    result.replaceChildren(heading,summary,note);form.hidden=true;result.hidden=false;
  });
  dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();}});

  if('IntersectionObserver' in window){const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('visible');observer.unobserve(entry.target);}}),{threshold:.08});document.querySelectorAll('.reveal').forEach(section=>observer.observe(section));}else document.querySelectorAll('.reveal').forEach(section=>section.classList.add('visible'));
})();
