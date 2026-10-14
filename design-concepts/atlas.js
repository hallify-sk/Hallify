// Local design study. All venues, locations, prices and reservations are illustrative.
const venues=[
 {id:'atelier',name:'Ateliér pri rieke',district:'Praha 7',capacity:120,area:180,price:1250,partner:true,x:64,y:24,events:['wedding','business','party'],image:'assets/occasion-wedding.jpg',description:'Svetlý otvorený priestor na večeru, oslavu aj firemné stretnutie.'},
 {id:'garden',name:'Záhrada pod lesom',district:'Praha 6',capacity:80,area:140,price:null,partner:false,x:25,y:36,events:['wedding','party'],image:'assets/occasion-wedding.jpg',description:'Pokojné miesto s vonkajším priestorom na menšie oslavy a svadby.'},
 {id:'gallery',name:'Mestská galéria',district:'Praha 2',capacity:180,area:260,price:1700,partner:true,x:71,y:58,events:['business','party'],image:'assets/occasion-conference.jpg',description:'Veľkorysý priestor na konferenciu, prezentáciu alebo spoločenský večer.'},
 {id:'vault',name:'Sála pod klenbami',district:'Praha 1',capacity:60,area:100,price:null,partner:false,x:39,y:58,events:['wedding','party'],image:'assets/occasion-celebration.jpg',description:'Komorná sála na slávnostné večere a rodinné stretnutia.'}
];
let active='atelier',eventType='all',partnersOnly=false,zoom=1;
const $=(selector)=>document.querySelector(selector);
const money=(amount)=>new Intl.NumberFormat('sk-SK',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(amount);
const modal=$('#venue-dialog');
const content=$('#dialog-content');
let activeTheme=document.documentElement.dataset.theme|| (matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light');
document.querySelectorAll('[data-audience]').forEach(link=>link.addEventListener('click',e=>{if(window.parent!==window){e.preventDefault();parent.postMessage({type:'hallify-audience',audience:link.dataset.audience},location.origin)}}));
$('.theme-toggle').addEventListener('click',()=>{activeTheme=activeTheme==='light'?'dark':'light';document.documentElement.dataset.theme=activeTheme;$('.theme-toggle').setAttribute('aria-label',activeTheme==='dark'?'Zapnúť svetlý režim':'Zapnúť tmavý režim')});
function filteredVenues(){return venues.filter(v=>$('#location').value==='Praha'&&v.capacity>=Number($('#guests').value)&&(!partnersOnly||v.partner)&&(eventType==='all'||v.events.includes(eventType)))}
function renderVenues(){
 const visible=filteredVenues();if(!visible.some(v=>v.id===active))active=visible[0]?.id||null;
 $('#map-pins').innerHTML=visible.map(v=>`<button class="pin ${v.partner?'partner':''}" data-pin="${v.id}" style="left:${v.x}%;top:${v.y}%" aria-pressed="${v.id===active}" aria-label="${v.name}, ${v.price?'odhad '+money(v.price):'cena na dopyt'}">${v.partner?'<small>H</small> ':''}${v.price?money(v.price):v.capacity+' hostí'}</button>`).join('');
 $('#venue-results').innerHTML=visible.map(v=>`<article class="venue-card"><div class="venue-photo"><img src="${v.image}" alt="Ilustračná fotografia priestoru pre ${v.name}" loading="lazy"></div><div class="venue-topline"><span>${v.district}</span><span class="${v.partner?'partner-label':''}">${v.partner?'Partner Hallify':'Základný profil'}</span></div><h3>${v.name}</h3><p class="venue-meta">Do ${v.capacity} hostí · ${v.area} m²</p><div class="venue-bottom"><span>${v.price?'od '+money(v.price):'Cena na dopyt'}<small>${v.price?'ukážkový odhad / deň':'kontakt na prevádzku'}</small></span><button data-detail="${v.id}" aria-label="Otvoriť detail: ${v.name}">↗</button></div></article>`).join('');
 $('#results-summary').textContent=visible.length?`${visible.length} ukážkové priestory pre váš výber. Dostupnosť termínu potvrdí prevádzkovateľ.`:'V tomto výbere nemáme ukážkové priestory.';
 $('#empty-state').hidden=visible.length>0;
 document.querySelectorAll('[data-pin]').forEach(btn=>btn.addEventListener('click',()=>{active=btn.dataset.pin;renderVenues()}));
 document.querySelectorAll('[data-detail]').forEach(btn=>btn.addEventListener('click',()=>openVenue(btn.dataset.detail)));
 renderSelection();
}
function renderSelection(){
 const v=venues.find(v=>v.id===active);
 $('#selected-map-card').innerHTML=v?`<p class="small-label">${v.partner?'Partner Hallify':'Základný profil'}</p><h3>${v.name}</h3><p>${v.district} · do ${v.capacity} hostí</p><button aria-label="Zobraziť ${v.name}" id="map-detail">↗</button>`:'<h3>Žiadny výsledok</h3><p>Upravte výber v ľavej časti.</p>';
 $('#map-detail')?.addEventListener('click',()=>openVenue(active));
}
function dateRange(){const from=$('#date-from').value,to=$('#date-to').value;return {from,to,valid:!!from&&!!to&&from<=to}}
function displayDate(value){return new Date(value+'T12:00:00').toLocaleDateString('sk-SK',{day:'numeric',month:'long',year:'numeric'})}
function openVenue(id){
 const v=venues.find(v=>v.id===id);if(!v)return;
 const range=dateRange();
 content.innerHTML=`<img class="dialog-photo" src="${v.image}" alt="Ilustračná fotografia podujatia"><p class="eyebrow">${v.partner?'Partner Hallify':'Základný profil'}</p><h2 id="dialog-title">${v.name}</h2><p>${v.description}</p><div class="dialog-facts"><div><small>Lokalita</small><strong>${v.district}</strong></div><div><small>Kapacita</small><strong>${v.capacity} hostí</strong></div><div><small>Plocha</small><strong>${v.area} m²</strong></div></div><div class="dialog-status"><p>${range.valid?displayDate(range.from)+(range.from!==range.to?' až '+displayDate(range.to):''):'Vyberte platný termín pri vyhľadávaní.'}<br><strong>Dostupnosť na potvrdenie prevádzkovateľom.</strong></p><p>${v.price&&range.from===range.to?'Ukážkový odhad prenájmu: '+money(v.price)+'. Finálnu ponuku potvrdí prevádzka.':'Individuálna cenová ponuka od prevádzkovateľa.'}</p></div><button class="primary" id="preview-inquiry">${v.partner?'Pripraviť ukážkový dopyt':'Zobraziť spôsob kontaktovania'} ↗</button><p class="fine">Fiktívny priestor a ilustračné ceny. Táto ukážka nevytvára rezerváciu.</p>`;
 $('#preview-inquiry').addEventListener('click',()=>{content.innerHTML=`<h2 id="dialog-title">${v.partner?'Váš dopyt, prehľadne.':'Spojte sa s prevádzkou.'}</h2><div class="preview-success"><h3>${v.name}</h3><p>${v.partner?'V plnej verzii odošlete termín, počet hostí a svoje predstavy priamo pri tomto priestore.':'Pri základnom profile sa zobrazí kontakt zverejnený prevádzkovateľom. Dostupnosť aj cenu dohodnete priamo.'}</p><p>${range.valid?'Termín: '+displayDate(range.from)+(range.from!==range.to?' až '+displayDate(range.to):''):''}</p><p>Počet hostí: ${$('#guests').value==='0'?'na upresnenie':$('#guests').value}</p></div><p class="fine">Toto je náhľad ďalšieho kroku. Žiadny dopyt sa neodoslal.</p><button class="primary" id="back-to-venue">Späť na priestor</button>`;$('#back-to-venue').addEventListener('click',()=>openVenue(id));});
 if(!modal.open)modal.showModal();
}
$('.dialog-close').addEventListener('click',()=>modal.close());
$('#search-form').addEventListener('submit',e=>{e.preventDefault();const range=dateRange();$('#date-error').hidden=range.valid;if(!range.valid){$('#date-error').textContent='Zvoľte dátum začiatku aj konca. Koniec nesmie byť pred začiatkom.';$('#date-to').focus();return}renderVenues();$('#discover').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'})});
['#location','#guests'].forEach(id=>$(id).addEventListener('change',renderVenues));
document.querySelectorAll('[data-event]').forEach(btn=>btn.addEventListener('click',()=>{eventType=btn.dataset.event;document.querySelectorAll('[data-event]').forEach(el=>el.setAttribute('aria-pressed',String(el===btn)));renderVenues()}));
$('#partner-filter').addEventListener('click',()=>{partnersOnly=!partnersOnly;$('#partner-filter').setAttribute('aria-pressed',String(partnersOnly));renderVenues()});
$('#reset-search').addEventListener('click',()=>{$('#location').value='Praha';$('#guests').value='0';partnersOnly=false;eventType='all';$('#partner-filter').setAttribute('aria-pressed','false');document.querySelectorAll('[data-event]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.event==='all')));renderVenues()});
function setZoom(next){zoom=Math.min(1.6,Math.max(1,next));$('#map-canvas').style.setProperty('--zoom',zoom);$('#zoom-in').disabled=zoom>=1.6;$('#zoom-out').disabled=zoom<=1;}
$('#zoom-in').addEventListener('click',()=>setZoom(zoom+.2));$('#zoom-out').addEventListener('click',()=>setZoom(zoom-.2));setZoom(1);
// The calendar is a real selectable local component; no live availability is implied.
const bookings={7:{name:'Firemné stretnutie',guests:48,status:'Potvrdená rezervácia',time:'09:00 - 17:00'},14:{name:'Svadba: Lenka a Tomáš',guests:96,status:'Nový dopyt',time:'14:00 - 23:00'},21:{name:'Narodeninová oslava',guests:60,status:'Príprava podujatia',time:'17:00 - 23:00'}};
let selectedDay=14;
function renderCalendar(){
 $('#calendar-grid').innerHTML='<span aria-hidden="true"></span>'.repeat(6)+Array.from({length:30},(_,i)=>{const day=i+1;return `<button data-day="${day}" class="${bookings[day]?'has-event':''}" aria-pressed="${day===selectedDay}" aria-label="${day}. novembra 2026${bookings[day]?', '+bookings[day].name:''}">${day}</button>`}).join('');
 document.querySelectorAll('[data-day]').forEach(btn=>btn.addEventListener('click',()=>{selectedDay=Number(btn.dataset.day);renderCalendar()}));
 const b=bookings[selectedDay];$('#reservation-preview').innerHTML=b?`<div class="request-heading"><span>${b.status}</span><span>${selectedDay}. november</span></div><h3>${b.name}</h3><p>${b.guests} hostí · ${b.time}<button id="open-booking">Otvoriť dopyt ↗</button></p>`:`<div class="request-heading"><span>${selectedDay}. november 2026</span></div><h3>Bez ukážkovej rezervácie</h3><p>Vyberte zvýraznený deň a preskúmajte dopyt.</p>`;
 $('#open-booking')?.addEventListener('click',()=>openBooking(selectedDay));
}
function openBooking(day){
 const b=bookings[day];content.innerHTML=`<p class="eyebrow">Ukážka správy rezervácie</p><h2 id="dialog-title">${b.name}</h2><p>${day}. november 2026 · ${b.time}</p><form id="booking-form"><div class="dialog-inputs"><label>Počet hostí<input name="guests" type="number" min="1" max="120" value="${b.guests}" required></label><label>Stav<select name="status"><option${b.status==='Nový dopyt'?' selected':''}>Nový dopyt</option><option${b.status==='Potvrdená rezervácia'?' selected':''}>Potvrdená rezervácia</option><option${b.status==='Príprava podujatia'?' selected':''}>Príprava podujatia</option></select></label></div><p>Zmeňte počet hostí alebo stav. Úprava sa premietne do kalendára tejto ukážky.</p><button class="primary" type="submit">Uložiť do ukážky ↗</button><p class="fine">Údaje ostávajú len v tejto otvorenej stránke. Žiadna správa sa neodosiela.</p></form>`;
 $('#booking-form').addEventListener('submit',e=>{e.preventDefault();const form=new FormData(e.currentTarget);b.guests=Number(form.get('guests'));b.status=String(form.get('status'));renderCalendar();modal.close()});if(!modal.open)modal.showModal();
}
$('#business-demo').addEventListener('click',()=>openBooking(14));
function setProfile(mode){
 const partner=mode==='partner';document.querySelectorAll('[data-profile]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.profile===mode)));
 $('#profile-label').textContent=partner?'Partner Hallify':'Základný profil';$('#profile-title').textContent=partner?'Nech si vás vedia predstaviť.':'Nech vás nájdu.';
 $('#profile-description').textContent=partner?'Prezentácia priestoru sa prepája s rezervačným procesom a každodennou správou.':'Názov, lokalita, kapacita a kontakt. Jednoduchý vstup do verejného katalógu.';
 $('#profile-features').innerHTML=(partner?['Rozšírené informácie a rozloženie sály','Odhad ceny pri známych podmienkach','Rezervácie a komunikácia v Hallify']:['Informácie o priestore','Zobrazenie v katalógu','Priamy kontakt']).map(x=>'<li>'+x+'</li>').join('');
 $('#profile-details').innerHTML=partner?'<div class="profile-details-item"><strong>od 1 250 €</strong>Ukážkový odhad / deň</div><div class="profile-details-item">Rozloženie sály &nbsp; ↗<br><br>Termín na potvrdenie</div>':'<div class="profile-details-item"><strong>Cena na dopyt</strong>Dostupnosť priamo u prevádzky</div><div class="profile-details-item">Kontakt na prevádzku &nbsp; ↗</div>';
}
document.querySelectorAll('[data-profile]').forEach(btn=>btn.addEventListener('click',()=>setProfile(btn.dataset.profile)));
renderVenues();renderCalendar();setProfile('directory');
if(!matchMedia('(prefers-reduced-motion:reduce)').matches){const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.remove('pending');observer.unobserve(entry.target)}}),{threshold:.08});document.querySelectorAll('.venues-section,.clarity-section,.bridge,.partnership,.operations').forEach(el=>{el.classList.add('reveal','pending');observer.observe(el)})}
