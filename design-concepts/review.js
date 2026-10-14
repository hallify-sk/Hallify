const frame=document.querySelector('#concept');
const modal=document.querySelector('#comparison');
const loading=document.querySelector('#loading');
const validConcepts=['atlas','occasion','spatial'];
const validAudiences=['customer','business'];
let concept='atlas',audience='customer';
function select(nextConcept=concept,nextAudience=audience,historyMode='push'){
  concept=validConcepts.includes(nextConcept)?nextConcept:'atlas';
  audience=validAudiences.includes(nextAudience)?nextAudience:'customer';
  document.querySelectorAll('[data-concept]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.concept===concept)));
  document.querySelectorAll('[data-audience]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.audience===audience)));
  loading.hidden=false;
  frame.title=`${concept[0].toUpperCase()+concept.slice(1)} ${audience} landing page concept`;
  frame.src=`${concept}.html?audience=${audience}`;
  const url=new URL(location.href);url.searchParams.set('concept',concept);url.searchParams.set('audience',audience);
  if(historyMode==='push')history.pushState({},'',url);else if(historyMode==='replace')history.replaceState({},'',url);
}
frame.addEventListener('load',()=>{loading.hidden=true});
document.querySelectorAll('[data-concept]').forEach(el=>el.addEventListener('click',()=>select(el.dataset.concept)));
document.querySelectorAll('[data-audience]').forEach(el=>el.addEventListener('click',()=>select(concept,el.dataset.audience)));
document.querySelector('#about').addEventListener('click',()=>modal.showModal());
modal.querySelector('.close').addEventListener('click',()=>modal.close());
document.querySelectorAll('[data-open]').forEach(el=>el.addEventListener('click',()=>{select(el.dataset.open);modal.close()}));
window.addEventListener('message',event=>{if(event.origin===location.origin&&event.source===frame.contentWindow&&event.data?.type==='hallify-audience'&&validAudiences.includes(event.data.audience))select(concept,event.data.audience)});
window.addEventListener('popstate',()=>{const params=new URLSearchParams(location.search);select(params.get('concept'),params.get('audience'),'none')});
const params=new URLSearchParams(location.search);select(params.get('concept'),params.get('audience'),'replace');
